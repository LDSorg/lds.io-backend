'use strict';

var TumblrStrategy = require('passport-tumblr').Strategy
  , OAuth = require('oauth').OAuth
  , request = require('request')
  ;

module.exports.init = function (passport, config, opts) {
  var oa
    , tumblrAuth
    , tumblrConfig = config.tumblr
    ;

  /*
  // TODO to allow this user to message you, follow us
  function directMessage(user, params, cb) {
    oa.post(
      "https://api.tumblr.com/1.1/direct_messages/new.json"
    , user.tumblr.token
    , user.tumblr.tokenSecret
    , { "screen_name": params.sn, text: params.text }
    , cb
    );
  }
  */

  function getBlog(user, params, cb) {
    console.log(user, params, cb);
    var url = "http://api.tumblr.com/v2/blog/" + params.blog + "/posts"
      + "?notes_info=true"
      + "&offset=" + (params.offset || 0)
      + "&api_key=" + tumblrConfig.consumerKey
      ;

    console.log(url);
    request.get(url, function (err, req, data) {
      cb(err, data);
    });
    /*
    oa.get(
      "http://api.tumblr.com/v2/blog/" + params.blog + "/posts/text?notes_info=true"
    , user.tumblr.token
    , user.tumblr.tokenSecret
    //, { "notes_info": true }
    , cb
    );
    */
  }
  module.exports.getBlog = getBlog;

  function initTumblrOauth() {
    oa = new OAuth(
      "http://www.tumblr.com/oauth/request_token"
    , "http://www.tumblr.com/oauth/access_token"
    , tumblrConfig.consumerKey
    , tumblrConfig.consumerSecret
    , "1.0A"
    , "http://" + config.host + config.oauthPrefix + "/tumblr/callback"
    , "HMAC-SHA1"
    );
    module.exports.oa = oa;
  }
  initTumblrOauth();
  //module.exports.directMessage = directMessage;


  tumblrAuth = new TumblrStrategy({
      consumerKey: tumblrConfig.consumerKey
    , consumerSecret: tumblrConfig.consumerSecret
    , callbackURL: "http://" + config.host + config.oauthPrefix + "/tumblr/callback"
    },
    function(token, tokenSecret, profile, done) {
      console.log('[load:tumblrN]');

      delete profile._raw;
      delete profile._json;
      done(null, {
        type: profile.provider || 'tumblr'
      , uid: profile.username
      , public: profile
      , token: token
      , tokenSecret: tokenSecret
      });
    }
  );

  passport.use(tumblrAuth);

  function route(rest) {
    // Tumblr AuthN
    // Handle the case that the user clicks "Sign In with Tumblr" on our own app
    rest.get(
      config.oauthPrefix + '/tumblr/connect'
    , passport.authenticate('tumblr')
    );
    // Handle the oauth callback from tumblr
    rest.get(
      config.oauthPrefix + '/tumblr/callback'
    , function (req, res, next) {
        passport.authenticate('tumblr', function (err, user, info) {
          console.log('[auth] tumblr auth n');
          opts.login(req, res, next, {
            error: err
          , user: user
          , info: info
          , successUrl: '/oauth2-close.html'
          , failureUrl: '/oauth2-close.html'
          });
        })(req, res, next);
      }
    );
  }

  return route;
};
