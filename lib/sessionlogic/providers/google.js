'use strict';

module.exports.createRouter = function (passport, config, opts) {
  var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

  passport.use('google-oauth2', new GoogleStrategy({
      clientID: config.google.id,
      clientSecret: config.google.secret,
      callbackURL: config.protocol + "://" + config.host
        + config.oauthPrefix + "/google/callback"
    },
    function(accessToken, refreshToken, profile, done) {
      // this object is attached as or merged to req.session.passport.user
      delete profile._raw;
      delete profile._json;

      done(null, {
        type: profile.provider || 'google'
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
      config.oauthPrefix + '/google/callback'
    , function (req, res, next) {
        passport.authenticate('google-oauth2', function (err, user, info) {
          opts.login(req, res, next, {
            error: err
          , user: user
          , info: info
            // TODO this should be configurable in a higher level
          , successUrl: '/oauth2-close.html' + '?shim=/auth/' + 'google' + '/callback'
          , failureUrl: '/oauth2-close.html' // # oauth2-error.html?
          });
        })(req, res, next);
      }
    );
    // Redirect the user to Facebook for authentication.  When complete,
    // Facebook will redirect the user back to the application at
    //   /facebook/callback
    // TODO request-based scopes
    console.log('TODO: request-based scopes');
    // TODO this fails HARD when the request fails
    rest.get(config.oauthPrefix + '/google/connect', passport.authenticate('google-oauth2', { scope: ['https://www.googleapis.com/auth/plus.login'] }));
  }

  return route;
};
