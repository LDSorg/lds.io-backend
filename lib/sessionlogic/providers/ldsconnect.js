'use strict';

var LdsConnectStrategy = require('passport-lds-connect').Strategy
  ;

module.exports.init = function (passport, config, opts) {
  passport.use(new LdsConnectStrategy({
      clientID: config.ldsconnect.id,
      clientSecret: config.ldsconnect.secret,
      callbackURL: config.protocol + "://" + config.host
        + config.oauthPrefix + "/ldsconnect/callback"
    },
    function(accessToken, refreshToken, profile, done) {
      // this object is attached as or merged to req.session.passport.user
      delete profile._raw;
      delete profile._json;

      done(null, {
        type: profile.provider || 'ldsconnect'
      , uid: profile.id
      , public: profile
      , accessToken: accessToken
      , refreshToken: refreshToken
      });
    }
  ));

  function route(rest) {
    rest.get(
      config.oauthPrefix + '/ldsconnect/callback'
    , function (req, res, next) {
        passport.authenticate('ldsconnect', function (err, user, info) {
          opts.login(req, res, next, {
            error: err
          , user: user
          , info: info
          // NOTE this does not issue a Location redirect.
          // Instead, the file is read and served with the current URL.
          // The hash/anchors are being used as reminder placeholders
          , successUrl: '/oauth2-close.html' // TODO #allow
          , failureUrl: '/oauth2-close.html' // TODO #error || #deny || /oauth2-error.html
          });
        })(req, res, next);
      }
    );

    // Redirect the user to LdsConnect for authentication.  When complete,
    // LdsConnect will redirect the user back to the application at
    //   /auth/ldsconnect/callback
    rest.get(
      config.oauthPrefix + '/ldsconnect/connect'
    , passport.authenticate('ldsconnect', { scope: ['email'] })
    );
  }

  return route;
};
