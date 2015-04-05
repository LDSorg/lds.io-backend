'use strict';

/**
 * Module dependencies.
 */
var BasicStrategy = require('passport-http').BasicStrategy;
var ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy;
var ResourceOwnerPasswordStrategy = require('passport-oauth2-resource-owner-password').Strategy;
var oauth2 = require('./oauth2orize-logic');

module.exports.create = function (passport, config, DB, AccessTokens, AppLogin, Logins) {
  /**
   * BasicStrategy & ClientPasswordStrategy
   *
   * These strategies are used to authenticate registered OAuth clients.  They are
   * employed to protect the `token` endpoint, which consumers use to obtain
   * access tokens.  The OAuth 2.0 specification suggests that clients use the
   * HTTP Basic scheme to authenticate.  Use of the client password strategy
   * allows clients to send the same credentials in the request body (as opposed
   * to the `Authorization` header).  While this approach is not recommended by
   * the specification, in practice it is quite common.
   */
  function getClient(apikeyId, apikeySecret, done) {
    // TODO should be DB.Apps or DB.Consumers or something of that nature, separate from user logins?
    AppLogin.login(null, apikeyId, apikeySecret).then(function ($apikey) {
      done(null, $apikey);
    }).error(function (err) {
      if (/Incorrect/i.test(err && err.message)) {
        done(null, false);
      } else {
        console.error('[ERROR] getClient [client password] - Unknown');
        console.warn(err);
        console.warn(err.stack);
        done(err);
      }
    }).catch(function (err) {
      console.error('[ERROR] getClient [client password] - [UNCAUGHT]');
      console.warn(err);
      console.warn(err.stack);
      done(err);
    });
  }

  /**
   * ResourceOwnerPasswordStrategy
   *
   * This strategy is used to authenticate registered OAuth clients WITH users'
   * credentials. It is employed to protect the `token` endpoint, which consumers
   * use to obtain access tokens on behalf of the users supplying credentials.
   * This is primary for use with privileged applications in insecure environments
   * (such as an official mobile app)
   */
  function getClientAndUser(apikeyId, apikeySecret, user, pass, done) {
    AppLogin.login(null, apikeyId, apikeySecret).then(function ($apikey) {
      // It seems that only the client is meant to be passed here
      // the user, pass seem to disappear into the ether
      //TODO Logins.login()
      done(null, $apikey, user, pass);
    }).error(function (err) {
      if (/Incorrect/i.test(err && err.message)) {
        done(null, false);
      } else {
        console.error('[ERROR] getClientAndUser [resource owner password] - Unknown');
        console.warn(err);
        console.warn(err.stack);
        done(err);
      }
    }).catch(function (err) {
      console.error('[ERROR] getClientAndUser [resource owner password] - [UNCAUGHT]');
      console.warn(err);
      console.warn(err.stack);
      done(err);
    });
  }

  passport.use(
    'provider.oauth2-basic.st'
  , new BasicStrategy(getClient)
  );
  passport.use(
    'provider.oauth2-client-password.st'
  , new ClientPasswordStrategy(getClient)
  );
  passport.use(
    'provider.oauth2-resource-owner-password.st'
  , new ResourceOwnerPasswordStrategy(getClientAndUser)
  );

  return {
    route: oauth2.create(passport, config, DB, AccessTokens, AppLogin, Logins)
  };
};
