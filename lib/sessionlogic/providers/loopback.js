'use strict';

var LoopbackStrategy = require('./passport-loopback').Strategy
  ;

module.exports.init = function (passport, config, opts) {
  var strategyName = 'st.loopback'
    ;

  passport.use(
    strategyName
  , new LoopbackStrategy({
      clientID: config.loopback.id
    , clientSecret: config.loopback.secret
    , callbackURL: config.protocol + "://" + config.host
        + config.oauthPrefix + "/loopback/callback"
    }
  , function handleLogin(accessToken, refreshToken, profile, done) {
      var user
        , info = { info: true, debug_infoInLoopbackStrategy: true }
        ;

      // this object is attached as or merged to req.session.passport.user
      delete profile._raw;
      delete profile._json;

      user = {
        profile: profile
      , accessToken: accessToken
      , refreshToken: refreshToken
      };

      done(null, user, info);
    }
  ));

  function route(rest) {
    rest.get(
      config.oauthPrefix + '/loopback/callback'
    , function (req, res, next) {
        passport.authenticate(strategyName, function (err, user, info) {
          var loginResults
            ;

          loginResults = {
            error: err
          , user: user
          , info: info

          // *IMPORTANT*
          // This does not issue a Location redirect.
          // Instead, the file is read and served with the current URL.
          // The hash/anchors are being used as reminder placeholders
          , successUrl: '/oauth2-close.html' // TODO #allow
          , failureUrl: '/oauth2-close.html' // TODO #error || #deny
          };

          opts.login(req, res, next, loginResults);
        })(req, res, next);
      }
    );

    // Redirect the user to Loopback for authentication.  When complete,
    // Loopback will redirect the user back to the application at
    //   /auth/loopback/callback
    rest.get(
      config.oauthPrefix + '/loopback/connect'
    , function (req, res, next) {
        var scope
          , strategy
          ;

        if (!req.query.scope) {
          scope = [];
        } else {
          scope = req.query.scope.split(' ');
        }

        //console.log('[scope]', scope, req.query);
        strategy = passport.authenticate(strategyName, { scope: scope });
        strategy(req, res, next);
      }
    );
  }

  return { route: route };
};
