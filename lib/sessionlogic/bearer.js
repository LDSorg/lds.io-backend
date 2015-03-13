'use strict';

    // looks for
      // HTTP Authorization Bearer header
      // `access_token` in form field
      // `access_token` URL query param
var BearerStrategy = require('passport-http-bearer').Strategy
  ;

module.exports.create = function (passport, config, AccessTokens, loginWrapper) {

  // TODO associated scope with token
  function tokenLookup(token, done) {

    // TODO XXX XXX
    // Select preferred account in clientside OAuth thingy

    return AccessTokens
      .login(token)
      .then(function ($token) {
        var user
          , info = { info: true }
          ;

        if (!$token) {
          // TODO all Logins need to change to allow additional messages to be passed
          // with the return object (such as a message with 'invalid password')
          console.error("[bearer] invalid bearer token:", token);
          done(null, null, { error: { message: "invalid bearer token" } });
          return;
        }

        // NOTE: there is one token per account - except resource owner password

        user = {
          $token: $token
        , $login: $token.$login
          // TODO check that login is still attached to the account?
        , $account: $token.related('account')
        , $apikey: $token.related('apikey')
          // TODO pull client from apikey
        , $oauthclient: $token.related('oauthclient')
        , error: null
        };

        done(null, user, info);
      }).catch(function (err) {
        done(err, null, { info: true });
      });
  }

  passport.use(
    'bearer.st'
  , new BearerStrategy(tokenLookup)
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
  function createHandleLogin(type) {
    return function handleLogin(req, res, next) {
      function handleSuccessOrFailure(err, user, info) {
        var loginResults
          ;

        if (err) {
          res.error({
            message: "login failed: " + err.toString()
          , code: "INVALID_AUTH_TOKEN"
          });
          return;
        }

        loginResults = {
          error: err
        , user: user
        , info: info
        //, successUrl: '/api/users/me'
        //, successUrl: '/api/session'
        };

        loginWrapper(req, res, next, loginResults);
      }

      passport.authenticate(type, handleSuccessOrFailure)(req, res, next);
    };
  }

  function route(rest) {
    rest.post(
      config.apiPrefix + '/session/bearer'
    , createHandleLogin('bearer.st')
    );
  }

  return {
    route: route
  };
};
