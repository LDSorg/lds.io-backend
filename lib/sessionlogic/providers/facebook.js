'use strict';

module.exports.createRouter = function (passport, config, opts) {
  var FacebookStrategy = require('passport-facebook').Strategy;
  var authorizationRedirect = "/authorization_redirect";
  var authorizationCodeCallback = "/authorization_code_callback";
  //var accessTokenCallback = "/api/oauth3/access_token_callback";
  var providerUri = 'facebook.com';
  var allStates = {};

  // TODO /callbaks/:providerUri
  passport.use('fb-1', new FacebookStrategy({
      clientID: config.facebook.id,
      clientSecret: config.facebook.secret,
      callbackURL: config.protocol + "://" + config.host
        + config.oauthPrefix + authorizationCodeCallback + '/' + providerUri
    },
    function(accessToken, refreshToken, profile, done) {
      // this object is attached as or merged to req.session.passport.user
      delete profile._raw;
      delete profile._json;

      done(null, {
        type: profile.provider || 'facebook'
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
        passport.authenticate('fb-1', function (err, user, info) {
          // for some reason the very first time the profile comes back it is without emails
          // NOTE: if the email is unverified the array will exist, but be empty
          if (user && !Array.isArray(user.public.emails)) {
            res.redirect(config.oauthPrefix + authorizationRedirect + '/' + providerUri);
            return;
          }

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
      passport.authenticate('fb-1', {
        scope: (req.query.scope||'').split(/\s+,/g)
      , state: serverState
      })(req, res, next);
    });
  }

  return route;
};
