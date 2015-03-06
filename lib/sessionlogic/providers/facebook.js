'use strict';

var FacebookStrategy = require('passport-facebook').Strategy;

module.exports.init = function (passport, config, opts) {
  passport.use(new FacebookStrategy({
      clientID: config.facebook.id,
      clientSecret: config.facebook.secret,
      callbackURL: config.protocol + "://" + config.host
        + config.oauthPrefix + "/facebook/callback"
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
      config.oauthPrefix + '/facebook/callback'
    , function (req, res, next) {
        passport.authenticate('facebook', function (err, user, info) {
          //console.log('[auth] [facebook]');
          //console.log(user);

          // for some reason the very first time the profile comes back it is without emails
          // NOTE: if the email is unverified the array will exist, but be empty
          if (user && !Array.isArray(user.public.emails)) {
            res.redirect(config.oauthPrefix + '/facebook/connect');
            return;
          }

          opts.login(req, res, next, {
            error: err
          , user: user
          , info: info
          , successUrl: '/oauth2-close.html'
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
    rest.get(config.oauthPrefix + '/facebook/connect', passport.authenticate('facebook', { scope: ['email'] }));
  }

  return route;
};
