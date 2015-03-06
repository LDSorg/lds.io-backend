'use strict';

    // looks for a username and password field in the request
var LocalStrategy = require('passport-local').Strategy
    // looks for an HTTP Authorization Basic header
  , BasicStrategy = require('passport-http').BasicStrategy
  // TODO
  //, ManualStrategy = require('passport-http-bearer').Strategy
  ;

module.exports.create = function (passport, config, Logins, loginWrapper) {
  function basicLookup(clientId, clientSecret, done) {

  // TODO basicLookup may not the best because we can't hint the id type
  // (i.e. #aj might be instagram or slack or irc, aj.daplie.com might be a url or a messaging platform)
  Logins
      .login(null, clientId, clientSecret)
      .then(
        function ($login) {
          console.log('[basicLookup] $login', $login);
          if (!$login) {
            done(null, false);
            return;
          }

          var user
            , info = { info: true }
            ;

          console.log('[basicLookup] login  ');
          //console.log(login);
          //console.log(login && Object.keys(login));

          user = { $login: $login };
          done(null, user, info);
        }
      , function (err) {
          done(err);
        }
      );
  }

  /*
  function manualLookup(hashid, done) {
    return Auth.Logins.login({ id: hashid }).then(function (login) { done(login); }, done);
  }

  manualStrategy = new BearerStrategy(function (token, done) {
    manualLookup(token, function (err, user) {
      done(err, user);
    });
  });
  manualStrategy.name = 'manual.hashid';
  */

  // username & password are intuitive,
  // but I much prefer passphrase at worst and,
  // preferably, the more generic id and secret
  passport.use(
    'local.st'
  , new LocalStrategy(basicLookup)
  );
  passport.use(
    'local.st.passphrase'
  , new LocalStrategy({ passwordField: 'passphrase' }, basicLookup)
  );
  passport.use(
    'local.st.secret'
  , new LocalStrategy({ usernameField: 'uid', passwordField: 'secret' }, basicLookup)
  );
  passport.use(
    'local.st.secret.id'
  , new LocalStrategy({ usernameField: 'id', passwordField: 'secret' }, basicLookup)
  );
  // NOTE: http basic doesn't have named fields
  passport.use(
    'basic.st'
  , new BasicStrategy(basicLookup)
  );

  // Yes, custom callbacks have a lot of layers...
  // http://passportjs.org/guide/authenticate/#custom-callback
  //
  // Alternate approach:
  //  rest.get('/api/session/whatevs', passport.authenticate(
  //    'local'
  //  , { failureRedirect: '/login-failed.json'
  //    , successReturnToOrRedirect: '/api/me'
  //    //, successRedirect: '/api/me'
  //    }
  //  ));
  //
  //  negs: has a redirect, can't send specific error, can't manually login
  //  pros: appropriate api redirect will show up in the console
  function handleLogin(type) {
    return function (req, res, next) {
      function handleSuccessOrFailure(err, user, info) {
        if (err) {
          res.error({
            message: "login failed: " + err.toString()
          , code: "INVALID_AUTH"
          });
          return;
        }

        console.log('[sessionlogic/local]', type);
        loginWrapper(req, res, next, {
          error: err
        , user: user
        , info: info
        //, successUrl: '/api/users/me'
        //, successUrl: '/api/session'
        });
      }

      passport.authenticate(type, handleSuccessOrFailure)(req, res, next);
    };
  }

  function manualLogin(id, secret, req, res, cb, wrapped) {
    wrapped = wrapped || {};
    var authorization = req.headers.authorization
      ;

    function handleResult(err, user, info) {
      req.headers.authorization = authorization;

      if (err) {
        if (wrapped.wrapped) {
          err.code = err.code || "INVALID_AUTH";
          cb(err);
          return;
        }
        // TODO cb(err) ?;
        res.error({
          message: "login failed: " + err.toString()
        , code: "INVALID_AUTH"
        });
        return;
      }

      loginWrapper(req, res, cb, {
        error: err
      , user: user
      , info: info
      //, successUrl: '/api/users/me'
      //, successUrl: '/api/session'
      }, wrapped);
    }

    req.headers.authorization = 'Basic ' + require('btoa')(id + ':' + secret);

    // TODO test putting res = null XXX
    // TODO test putting req = { headers: headers } XXX
    passport.authenticate('basic.st', handleResult)(req, res, cb);
    //passport.authenticate('local.secret', handleSuccessOrFailure)(req, res, next);
  }

  function route(rest) {
    rest.post(config.apiPrefix + '/session/local', handleLogin('local.st'));
    rest.post(config.apiPrefix + '/session/local', handleLogin('local.st.passphrase'));
    rest.post(config.apiPrefix + '/session/local', handleLogin('local.st.secret'));
    rest.post(config.apiPrefix + '/session/local', handleLogin('local.st.secret.id'));
    rest.post(config.apiPrefix + '/session/basic', handleLogin('basic.st'));
  }

  return {
    route: route
  , manualLogin: manualLogin
  };
};
