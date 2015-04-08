'use strict';

module.exports.create = function (DB, BearerLogins) {
  var authutils = require('secret-utils')
    , PromiseA = require('bluebird').Promise
    ;

  function AccessTokens() {
  }
  AccessTokens.create = function (values) {
    var asLogin = false;
    var token;
    var id;

    if (values.test) {
      token = 'test_';
    } else {
      token = 'prod_';
    }

    if (values.insecure) {
      token += 'client_';
    } else {
      token += 'server_';
    }

    if (-1 !== ['password', 'delegated'].indexOf(values.grantType)) {
      asLogin = true;
    }

    token += authutils.genSalt(64);
    id = authutils.hashsum('sha256', token);

    values.id = id;
    // TODO hand back the original token, but don't save it
    values.token = token;

    // tokens will generally only have one account, but
    // a resource-owner-password token will have all of them

    // values.selectedAccountId

    // TODO better error handling
    if (!(values.apikeyId && values.oauthclientUuid)) {
      return PromiseA.reject(new Error(
        "sanity check failed for grant_type '"
        + values.grantType
        + "': client was not attached"
      ));
    }

    switch (values.grantType) {
      case 'client_credentials':
        if (values.accounts && values.accounts.length) {
          return PromiseA.reject(new Error("[grant_type=client_credentials] Account unexpectedly specified"));
        }
        break;
      case 'password':
        if (!values.loginId) {
          return PromiseA.reject(new Error("[grant_type=password] No loginId specified"));
        }
        break;
      case 'delegated':
        if (!values.loginId) {
          return PromiseA.reject(new Error("[grant_type=delegated] No loginId specified"));
        }
        break;
      case 'authorization_code':
        if (!values.accounts || !values.accounts.length) {
          return PromiseA.reject(new Error("[grant_type=code] No account specified"));
        }
        break;
      case 'implicit':
        if (!values.accounts || !values.accounts.length) {
          return PromiseA.reject(new Error("[grant_type=implicit] No account specified"));
        }
        break;
      case 'authorization_code':
        return PromiseA.reject(new Error("[grant_type=" + values.grantType + "] not yet implemented"));
        //break;
      default:
        return PromiseA.reject(new Error("[grant_type=" + values.grantType + "] unrecognized grant_type"));
    }

    return DB.AccessTokens.forge().save(values, { method: 'insert' }).then(function ($token) {
      return BearerLogins.create({ uid: $token.get('id') }).then(function ($login) {
        if (!values.accounts) {
          return $token;
        }

        return BearerLogins.linkAccounts($login, values.accounts).then(function () {
          if (values.selectedAccountId) {
            return BearerLogins.setPrimaryAccount($login, values.selectedAccountId).then(function () {
              return $token;
            });
          }

          return $token;
        });
      });
    });
  };

  AccessTokens.login = function (token) {
    var id = authutils.hashsum('sha256', token)
      ;

    // TODO check expiresAt
    return DB.AccessTokens.forge({ id: id }).fetch().then(function ($token) {
      if (!$token) {
        return null; // PromiseA.reject(new Error("Invalid Auth Token"));
      }

      if (-1 !== ['password', 'delegated'].indexOf($token.get('grantType'))) {
        return DB.Logins
          .forge({ hashid: $token.get('loginId') })
          .fetch()
          .then(function ($login) {
            $token.$login = $login;
            return $login.load('accounts').then(function () {
              return $token;
            });
          });
      } else {
        return BearerLogins.login({ uid: $token.get('id') }).then(function ($login) {
          $token.$login = $login;

          return $token;
        });
      }
    });
  };

  return AccessTokens;
};
