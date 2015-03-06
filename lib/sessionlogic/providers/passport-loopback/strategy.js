'use strict';

/**
 * Module dependencies.
 */
var util = require('util')
  //, https = require('https')
  //, fs = require('fs')
  //, path = require('path')
  , OAuth2Strategy = require('passport-oauth').OAuth2Strategy
  , InternalOAuthError = require('passport-oauth').InternalOAuthError
  , parse = require('./profile').parse
  , pConf = {
      protocol: 'http'
    , host: 'local.ldsconnect.org:4004'
    }
  //, cas
  ;

/*
require('ssl-root-cas').inject();
cas = https.globalAgent.options.ca;
cas.push(fs.readFileSync(path.join(__dirname, 'ssl', '00-equifax.pem')));
cas.push(fs.readFileSync(path.join(__dirname, 'ssl', '01-rapidssl.pem')));
cas.push(fs.readFileSync(path.join(__dirname, 'ssl', '03-loopback.pem')));
*/

/**
 * `Strategy` constructor.
 *
 * The example-oauth2orize authentication strategy authenticates requests by delegating to
 * example-oauth2orize using the OAuth 2.0 protocol.
 *
 * Applications must supply a `verify` callback which accepts an `accessToken`,
 * `refreshToken` and service-specific `profile`, and then calls the `done`
 * callback supplying a `user`, which should be set to `false` if the
 * credentials are not valid.  If an exception occured, `err` should be set.
 *
 * Options:
 *   - `clientID`      your example-oauth2orize application's client id
 *   - `clientSecret`  your example-oauth2orize application's client secret
 *   - `callbackURL`   URL to which example-oauth2orize will redirect the user after granting authorization
 *
 * Examples:
 *
 *     passport.use(new ExampleStrategy({
 *         clientID: '123-456-789',
 *         clientSecret: 'shhh-its-a-secret'
 *         callbackURL: 'https://www.example.net/auth/example-oauth2orize/callback'
 *       },
 *       function (accessToken, refreshToken, profile, done) {
 *         User.findOrCreate(..., function (err, user) {
 *           done(err, user);
 *         });
 *       }
 *     ));
 *
 * @param {Object} options
 * @param {Function} verify
 * @api public
 */
function Strategy(options, verify) {
  var me = this
    ;

  options = options || {};
  options.authorizationURL = 
    options.authorizationURL || 
    options.authorizationUrl ||
    (pConf.protocol + '://' + pConf.host + '/oauth/dialog/authorize')
    ;
  options.tokenURL =
    options.tokenURL ||
    options.tokenUrl ||
    (pConf.protocol + '://' + pConf.host + '/oauth/token')
    ;

  pConf.profileUrl = 
    options.profileURL ||
    options.profileUrl ||
    '/api/tokeninfo'
    ;
  
  OAuth2Strategy.call(me, options, verify);

  // must be called after prototype is modified
  me.name = 'loopback';
}

/**
 * Inherit from `OAuth2Strategy`.
 */
util.inherits(Strategy, OAuth2Strategy);


/**
 * Retrieve user profile from example-oauth2orize.
 *
 * This function constructs a normalized profile, with the following properties:
 *
 *   - `provider`         always set to `example-oauth2orize`
 *   - `id`
 *   - `username`
 *   - `displayName`
 *
 * @param {String} accessToken
 * @param {Function} done
 * @api protected
 */
Strategy.prototype.userProfile = function (accessToken, done) {
  var me = this
    ;

  console.log('[loopback] accessToken');
  console.log(accessToken);
  if (!accessToken) {
    throw new Error("Loopback didn't get the access token");
  }
  me._oauth2.get(
    pConf.protocol + '://' + pConf.host + pConf.profileUrl
  , accessToken
  , function (err, body/*, res*/) {
      var json
        , profile
        ;

      if (err) { 
        console.error("ERROR: failed to fetch user profile");
        console.error(err);
        done(new InternalOAuthError('failed to fetch user profile', err));

        return ;
      }

      if ('string' === typeof body) {
        try { json = JSON.parse(body); }
        catch(e) {
          console.error(e);
          console.error(body);
          done(e);

          return;
        }
      } else if ('object' === typeof body) {
        json = body;
        body = JSON.stringify(body);
      }

      if (body.error) { return done(new InternalOAuthError('user profile returned error', body.error)); }

      profile = parse(json);
      profile.provider = me.name;

      profile._raw = body;
      profile._json = json;

      done(null, profile);
    }
  );
};

/**
 * Expose `Strategy`.
 */
module.exports.Strategy = Strategy.Strategy = Strategy;
