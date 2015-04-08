'use strict';

// TODO make these create-able and return instances
var local = require('./local');
var bearer = require('./bearer');
var strategies = {};
var PromiseA = require('bluebird').Promise;
var rootClient;

module.exports.strategies = {};
// this isn't a true create yet because the proviers aren't true creates
module.exports.init = function (passport, config, Auth, OauthClients, AccessTokens, Logins) {
  function getLoginFromResults(loginResults) {
    if (loginResults.user.$login) {
      return PromiseA.resolve(loginResults.$login);
    }

    if (!(loginResults.user.profile || loginResults.user.public)) {
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
    // TODO this function might be the right one to wrap
    // on a per-module basis to enforce 'type' is what it ought to be
    var newReqUser;
    var reqUser = req.user || {};

    if (loginResults.error || !loginResults.user) {
      if (loginResults.failure) {
        loginResults.failure();
        return;
      }
      req.url = loginResults.failureUrl || req.url;
      nextOrCallback();
      //res.redirect(loginResults.failureUrl);
      return;
    }

    getLoginFromResults(loginResults).then(function () {
      var accounts$;
      var logins$;

      if (!loginResults.user.$login) {
        throw new Error('[SANITY FAIL] user.$login not set in passport middleware');
      }

      // this session object will overwrite the existing req.user
      accounts$ = reqUser.accounts$ || reqUser.$accounts || reqUser.accounts || [];
      logins$ = reqUser.logins$ || reqUser.$logins || reqUser.logins || [];

      newReqUser = {
        $newLogin: loginResults.user.$login
      , $token: loginResults.user.$token || reqUser.$token

      , mostRecentLoginId: reqUser.mostRecentLoginId || null
      , login: reqUser.login || null
      , logins: logins$
      , $logins: logins$
      , logins$: logins$
      , $login: loginResults.user.$login || reqUser.$login || null

      , selectedAccountId: reqUser.selectedAccountId || null
      , account: reqUser.account || null
      , accounts: accounts$
      , $accounts: accounts$
      , accounts$: accounts$
      , $account: reqUser.$account || null
      };

      function finishLoginHelper(err) {
        if (err) {
          nextOrCallback(err);
          return;
        }
        
        function finish() {
          var promise;

          // Note that express/connect treats the first argument as an error,
          // but because I'm doing something stupid that I'll one day do right instead
          // I'm multiplexing this callback
          if (!loginResults.successUrl) {
            nextOrCallback(null, req.user);
            return;
          }

          if (rootClient) {
            promise = PromiseA.resolve(rootClient);
          } else {
            // TODO XXX expire this cache occasionally
            promise = OauthClients.login(config, config.rootClient.id, config.rootClient.secret).then(function ($apikey) {
              return $apikey.load('oauthclient');
            });
          }

          return promise.then(function ($apikey) {
            var tokenMeta;
            var $login = loginResults.user.$login;
            var error;
            var token;
            var expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            // TODO use root api key and root app
            tokenMeta = {
              apikeyId: $apikey.id
            , oauthclientUuid: $apikey.related('oauthclient').id
            , loginId: $login.id
            , as: 'login'             // vs 'account'
            , requestedScopeString: '*'
            , acceptedScopeString: '*'
            , test: $apikey.get('test')
            , insecure: $apikey.get('insecure')
            , providerUri: $login.get('providerUri')
            , providerToken: $login.get('accessToken')
              // (i.e. facebook login)
            , grantType: 'delegated'

              // TODO XXX CUT (get the accounts dynamically)
            , selectedAccountId: $login.get('primaryAccountId')
            , accounts: $login.related('accounts').map(function (a) { return a; })
              // END CUT
            };

            // TODO lookup loginId to find existing token
            // TODO JWT
            return AccessTokens.create(tokenMeta).then(function ($token) {
              token = $token.get('token');
            }, function (err) {
              // no soft errors
              throw err;
            }).catch(function (err) {
              error = err.message;
            }).then(function () {
              // TODO pass back token
              // req.url = loginResults.successUrl || req.url;
              // TODO this should be configurable in a higher level (just need the name of the login service)
              // TODO pull req.query.rediruct_uri (plus security checks)
              // from states[serverState].browserState
              var redirectUri = config.oauth3Frontend + loginResults.successUrl
                + '&server_state=' + req.query.state;

              if (token) {
                redirectUri += '&access_token=' + token
                  + '&login_id=' + $login.id
                  + '&expires_at=' + expiresAt
                  + '&granted_scopes=*'
                  ;
              } else {
                redirectUri += '&error=' + error
                  + '&error_description=' + error
                  ;
              }

              res.redirect(redirectUri);
            });
          });
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
    if (!(/^Bearer /i.test(req.headers.authorization) || req.query.access_token)) {
      next();
      return;
    }

    // everything except for bearer relies on a session
    //passport.authenticate('bearer.st', { session: false }),
    passport.authenticate('bearer.st', function (err, user, info) {
      var loginResults;

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

  var localHelpers = local.create(passport, config, Logins, loginWrapper);
  var bearerHelpers = bearer.create(passport, config, AccessTokens, loginWrapper);

  // Passport session setup.
  //   To support persistent login sessions, Passport needs to be able
  //   to serialize users into and deserialize users out of the session.
  //   Typically, this will be as simple as storing the user ID when 
  //   serializing, and finding the user by ID when deserializing.

  // save to db
  passport.serializeUser(function(reqUser, done) {
    Auth.serialize(reqUser).then(function (sessionIds) {
      // TODO where does this done go?
      done(null, sessionIds);
    }).catch(function (err) {
      console.error("ERROR serializeUser");
      console.error(err);
      done(err);
    });
  });

  // session restores from db
  passport.deserializeUser(function (loginObj, done) {
    Auth.deserialize(loginObj).then(function (authObj) {
      done(null, authObj);
    }).catch(function (err) {
      console.error("ERROR deserializeUser");
      console.error(err);
      done(err);
    });
  });

  function route(rest) {
    // TODO
    // Since the API prefix is sometimes necessary,
    // it's probably better to always require the
    // auth providers to use it manually
    localHelpers.route(rest);
    bearerHelpers.route(rest);
  }

  return {
    manualLogin: localHelpers.manualLogin
  , strategies: strategies
  , route: route
  , loginWrapper: loginWrapper
  , tryBearerSession: testForAndLoginWithBearerToken
  //, rejectUnauthorizedSessions: controlApiAccess
  };
};
