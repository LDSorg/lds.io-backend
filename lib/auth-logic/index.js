'use strict';

var PromiseA = require('bluebird').Promise;

module.exports.create = function (Db/*, config*/) {
  // This object can access all logins, regardless of type
  var Logins = require('../auth-logic/logins').create(Db);
  // A Local Login is one with a username and password
  var LocalLogin = require('../auth-logic/locals').create(Logins.Logins.create('local'));
  // An OAuth2 Login (i.e. facebook, ldsconnect) may be used for many accounts
  var Oauth2Login = require('../auth-logic/oauth2-providers').create(Db, Logins.Logins.create('oauth2'));
  var AccessTokens = require('../auth-logic/access-tokens').create(Db, Logins.Logins.create('bearer'));
  var Accounts = require('../auth-logic/accounts').create(Db);
  var AppLogin = require('../oauthclients').createController(/*config*/null, Db);
  var Auth;

  Auth = {
  //  serialize: serialize
  //, deserialize: deserialize
  //, handleNewLogin: handleNewLogin
    Logins: Logins
  , Accounts: Accounts
  , LocalLogin: LocalLogin
  , AppLogin: AppLogin
  , Oauth2Login: Oauth2Login
  , AccessTokens: AccessTokens
  };

  return Auth;
};
