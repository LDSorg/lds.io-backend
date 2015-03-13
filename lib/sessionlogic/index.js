'use strict';

// TODO make these create-able and return instances
var local = require('./local')
  , escapeRegExp = require('escape-string-regexp')
  , bearer = require('./bearer')
  , loopback = require('./providers/loopback')
  , facebook = require('./providers/facebook')
  , ldsconnect = require('./providers/ldsconnect')
  , twitter = require('./providers/twitter')
  , tumblr = require('./providers/tumblr')
  , strategies = {}
  , PromiseA = require('bluebird').Promise
  ;

exports.strategies = strategies = {
  twitter: twitter
, tumblr: tumblr
, facebook: facebook
, loopback: loopback
, ldsconnect: ldsconnect
, local: local
, bearer: bearer
};

// this isn't a true create yet because the proviers aren't true creates
module.exports.init = function (passport, config, Auth, Logins) {
  function getLoginFromResults(loginResults) {
    if (loginResults.user.$login) {
      return PromiseA.resolve(loginResults.$login);
    }

    if (!(loginResults.user.profile || loginResults.user.public)) {
      console.error(loginResults);
      return PromiseA.reject(new Error("user.$login was not set, neither user.profile or user.public"));
    }

    // TODO upsert oauthy-thingy?
    return Auth.Oauth2Login
      .create(loginResults.user)
      .then(function ($login) {
        loginResults.user.$login = $login;

        // TODO remove (deprecated)
        loginResults.user.login = $login;
      });
  }

  // The reason this function has been pulled out to
  // auth-logic/index.js is because it is very common among
  // the various auth implementations and it does some
  // req.user mangling, which has already changed once,
  // and the underlying implementations should not need to be aware of it
  function loginWrapper(req, res, nextOrCallback, loginResults) {
    console.log("[sessionlogic/index.js] loginWrapper");
    // TODO this function might be the right one to wrap
    // on a per-module basis to enforce 'type' is what it ought to be
    var newReqUser
      , reqUser = req.user || {}
      ;

    if (loginResults.error || !loginResults.user) {
      if (loginResults.failure) {
        loginResults.failure();
        return;
      }
      req.url = loginResults.failureUrl || req.url;
      console.log("[loginWrapper] CHANGE URL", req.url);
      nextOrCallback();
      //res.redirect(loginResults.failureUrl);
      return;
    }

    getLoginFromResults(loginResults).then(function () {
      if (!loginResults.user.$login) {
        console.error('[ERROR] loginWrapper');
        console.error(loginResults.user);

        throw new Error('user.$login not set in passport middleware');
      }

      // this session object will overwrite the existing req.user
      newReqUser = {
        $newLogin: loginResults.user.$login
      , $token: loginResults.user.$token || reqUser.$token

      , mostRecentLoginId: reqUser.mostRecentLoginId || null
      , login: reqUser.login || null
      , logins: reqUser.logins || []
      , $logins: reqUser.$logins || []
      , $login: loginResults.user.$login || reqUser.$login || null

      , selectedAccountId: reqUser.selectedAccountId || null
      , account: reqUser.account || null
      , accounts: reqUser.accounts || []
      , $accounts: reqUser.$accounts || []
      , $account: reqUser.$account || null
      };

      function finishLoginHelper(err) {
        if (err) {
          nextOrCallback(err);
          return;
        }
        

        function finish() {
          // TODO save req.user.login

          req.url = loginResults.successUrl || req.url;
          console.log("[finish] CHANGE URL", req.url);
          // connect treats first argument as error, but sometimes 'next' isn't in connect
          nextOrCallback(null, req.user);
          //res.redirect(loginResults.successUrl);
        }

        if (loginResults.callback) {
          // TODO confirm that req.user.login === loginResults.user
          // twitter needs this callback to determine
          // if this user has been authenticated AND authorized
          loginResults.callback(
            loginResults.user.$account || loginResults.user.account
          , finish
          );
        } else {
          finish();
        }
      }

      if (false === loginResults.session) {
        return Auth.handleNewLogin(newReqUser).then(function () {
          // what needs to be done here with req.$account and such?
          req.user = newReqUser;
          finishLoginHelper(null);
        });
      }

      // this call is what overwrites req.user with session
      req.logIn(newReqUser, finishLoginHelper);
    });
  }

  function testForAndLoginWithBearerToken(req, res, next) {
    // when using access_token / bearer without a session
    // also, we will pefer a token over a session (and thus switch users)
    if (!(/^bearer/i.test(req.headers.authorization) || req.query.access_token)) {
      next();
      return;
    }

    console.log('[sessionlogic/index.js] testForAndLoginWithBearerToken');

    // everything except for bearer relies on a session
    //passport.authenticate('bearer.st', { session: false }),
    passport.authenticate('bearer.st', function (err, user, info) {
      var loginResults
        ;

      if (err) {
        res.error({
          message: err.message || "Unknown Error"
        , code: 401
        , class: "UNKNOWN-ERROR"
        , superclasses: []
        });
        return;
      }

      if (!user) {
        res.error({
          message: "Invalid login for account access"
        , code: 401
        , class: "INVALID-AUTH-N"
        , superclasses: []
        });
        return;
      }

      // This creates a session via req.logIn(),
      // which is not strictly required
      loginResults = {
        error: err
      , user: user
      , info: info
      , session: false
      };
      loginWrapper(req, res, next, loginResults);
    })(req, res, next);
  }

  function controlApiAccess(req, res, next) {
    console.log('[controlApiAccess] TODO: set req.$client instead of hard-coding');
    // TODO link all logins to a client
    req.client = req.client || {};
    req.client.config = {
      stripe: config.stripe
    , twilio: config.twilio
    , mailer: config.mailer
    }; // TODO - for stripe token and such

    function doesntNeedAuth() {
      return (
          req.skipAuthn
        || publicApiRe.test(req.url)
           // TODO use session prefix
        || /^(\/api)?\/(session|accounts|logins)($|\?|\/)/.test(req.url)
      );
    }

    if (doesntNeedAuth()) {
      next();
      return;
    }

    console.log('[sessionlogic/index.js] Needs Auth');

    if (!req.user) {
      res.error({
        message: "Invalid login / Unauthorized access to " + config.apiPrefix
      , code: 401
      , class: "INVALID-AUTH-N"
      , superclasses: []
      });
      return;
    }

    // TODO remove
    if (!req.user.$account) {
      res.error({
        message: "Valid login, but Invalid account / Unauthorized access to " + config.apiPrefix
      , code: 401
      , class: "INVALID-AUTH-Z"
      , superclasses: []
      });
      return;
    }

    // If the user is authenticating with cookies (not an access token)
    // then they must have the correct browser origin
    if (!req.user.$token) {
      if (!config.trustedOrigins.some(function (origin) {
        var re = new RegExp("^(https?|spdy):\\/\\/([^\\/]+\\.)?" + escapeRegExp(origin) + "(:\\d+)?($|\\/|\\?)")
          , matches = re.test(req.headers.origin)
          ;

        return matches;
      })) {
        res.error({
          message: "Invalid Origin '" + req.headers.origin + "' for " + config.apiPrefix + " access"
        , code: 401
        , class: "INVALID-ORIGIN"
        , superclasses: []
        });

        return;
      }
    }

    next();
  }

  var publicApiRe = new RegExp('^' + config.publicApi
        .replace(new RegExp('^' + config.apiPrefix), ''));
      // TODO test that publicApi actually falls under apiPrefix
  var localHelpers = local.create(passport, config, Logins, loginWrapper);
  var bearerHelpers = bearer.create(passport, config, Auth.AccessTokens, loginWrapper);

  // Passport session setup.
  //   To support persistent login sessions, Passport needs to be able
  //   to serialize users into and deserialize users out of the session.
  //   Typically, this will be as simple as storing the user ID when 
  //   serializing, and finding the user by ID when deserializing.

  // save to db
  passport.serializeUser(function(reqUser, done) {
    //console.log('passport.serializeUser', Object.keys(reqUser));
    Auth.serialize(reqUser).then(function (sessionIds) {
      //console.log('Auth.serialize', Object.keys(sessionIds));

      // TODO where does this done go?
      done(null, sessionIds);
    }).catch(function (err) {
      console.error("ERROR serializeUser");
      console.error(err);
      done(err);

      throw err;
    });
  });

  // session restores from db
  passport.deserializeUser(function (loginObj, done) {
    //console.log('passport.deserializeUser', Object.keys(loginObj));
    Auth.deserialize(loginObj).then(function (authObj) {
      //console.log('Auth.deserialize', Object.keys(authObj));
      done(null, authObj);
    }).catch(function (err) {
      console.error("ERROR deserializeUser");
      console.error(err);
      done(err);

      throw err;
    });
  });

  function route(rest) {
    // TODO
    // Since the API prefix is sometimes necessary,
    // it's probably better to always require the
    // auth providers to use it manually
    localHelpers.route(rest);
    bearerHelpers.route(rest);

    // Faux 3rd Party Provider (for testing)
    loopback.init(passport, config, { login: loginWrapper }).route(rest);

    // 3rd Party Providers
    facebook.init(passport, config, { login: loginWrapper })(rest);
    //twitter.init(passport, config, { login: loginWrapper })(rest);
    //tumblr.init(passport, config, { login: loginWrapper })(rest);
    ldsconnect.init(passport, config, { login: loginWrapper })(rest);
  }

  return {
    manualLogin: localHelpers.manualLogin
  , strategies: strategies
  , route: route
  , tryBearerSession: testForAndLoginWithBearerToken
  , rejectUnauthorizedSessions: controlApiAccess
  };
};
