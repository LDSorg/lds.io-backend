'use strict';

module.exports.createRouter = function (passport, config, opts) {
  var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
  var authorizationRedirect = "/authorization_redirect";
  var authorizationCodeCallback = "/authorization_code_callback";
  //var accessTokenCallback = "/api/oauth3/access_token_callback";
  var providerUri = 'google.com';
  var allStates = {};

  // TODO /callbaks/:providerUri
  passport.use('google-oauth2', new GoogleStrategy({
      clientID: config.google.id,
      clientSecret: config.google.secret,
      callbackURL: config.protocol + "://" + config.host
        + config.oauthPrefix + authorizationCodeCallback + '/' + providerUri
    },
    function(accessToken, refreshToken, profile, done) {
      // this object is attached as or merged to req.session.passport.user
      delete profile._raw;
      delete profile._json;

      done(null, {
        type: profile.provider || 'google.com'
      , uid: profile.id
      , public: profile
      , profile: profile
      , accessToken: accessToken
      , refreshToken: refreshToken
      });
    }
  ));

  function route(rest) {
    rest.get(
      config.oauthPrefix + authorizationCodeCallback + '/' + providerUri
    , function (req, res, next) {
        passport.authenticate('google-oauth2', function (err, user, info) {
          var loginResults = {
            error: err
          , user: user
          , info: info
            // TODO this (providerUri) should be configurable in a higher level
          , successUrl: '/oauth3.html'
              + '?browser_state=' + (allStates[req.query.state] || {}).browserState
              + '&provider_uri=' + providerUri
              // TODO local login token
          , failureUrl: '/oauth3.html' // # oauth2-error.html?
              + '?browser_state=' + (allStates[req.query.state] || {}).browserState
              + '&provider_uri=' + providerUri
              + '&error=' + encodeURIComponent('delegated login failed for \'' + providerUri + '\'')
          };

          opts.login(req, res, next, loginResults);
        })(req, res, next);
      }
    );

    // Redirect the user to Facebook for authentication.  When complete,
    // Facebook will redirect the user back to the application at
    //   /callbacks/facebook.com
    // TODO request-based scopes
    rest.get(config.oauthPrefix + authorizationRedirect + '/' + providerUri, function (req, res, next) {
      var serverState = Math.random().toString(36).replace(/^0\./, '');
      allStates[serverState] = {
        browserState: req.query.state
      };
      passport.authenticate('google-oauth2', {
        scope: (req.query.scope||'').split(/\s+,/g) || [ 'https://www.googleapis.com/auth/plus.login' ]
      , state: serverState
      })(req, res, next);
    });
  }

  return route;
};
