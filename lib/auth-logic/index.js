'use strict';

var PromiseA = require('bluebird').Promise;

module.exports.create = function (Db/*, config*/) {
  // This object can access all logins, regardless of type
  var Logins = require('./logins').create(Db);
  // A Local Login is one with a username and password
  var LocalLogin = require('./locals').create(Logins.Logins.create('local'));
  // An OAuth2 Login (i.e. facebook, ldsconnect) may be used for many accounts
  var Oauth2Login = require('./oauth2-providers').create(Db, Logins.Logins.create('oauth2'));
  // ??? true or false: An AccessToken is, in fact, a form of login (to a single account)
  var AccessTokens = require('./access-tokens').create(Db, Logins.Logins.create('bearer'));
  var Accounts = require('./accounts').create(Db);
  var AppLogin = require('../oauthclients').createController(/*config*/null, Db);
  var Auth;

  // TODO
  // don't reconstitute the logins and accounts that aren't in use

  function deserialize(sessionIds) {
    return Logins.mget(sessionIds.loginIds.map(function (l) { return l.id; })).then(function ($logins) {
      var accounts$ = []
                  // a sub for slice() since this isn't a real array
        , logins$ = $logins.filter(function ($l, i) {
            if (!$l.atime) {
              $l.atime = sessionIds.loginIds[i].atime || Date.now();
            }
            return true;
          })
        , $account
        , accountIds = []
        , $login
        ;

      logins$.forEach(function ($l) {
        $l.related('accounts').forEach(function ($account) {
          if (-1 === accountIds.indexOf($account.id)) {
            // TODO sort accounts by atime?
            accountIds.push($account.id);
            accounts$.push($account);
          }
        });
      });

      if (!sessionIds.selectedAccountId) {
        logins$.some(function ($l) {
          if ($l.id === sessionIds.mostRecentLoginId) {
            sessionIds.selectedAccountId = $l.get('primaryAccountId');
            return true;
          }
        });
      }

      if (!sessionIds.selectedAccountId) {
        logins$.some(function ($l) {
          return (sessionIds.selectedAccountId = $l.get('primaryAccountId'));
        });
      }

      accounts$.forEach(function ($a) {
        if ($a.id === sessionIds.selectedAccountId) {
          $account = $a;
        }
      });

      if (!$account) {
        sessionIds.selectedAccountId = null;
      }

      logins$.forEach(function ($l) {
        if ($l.id === sessionIds.mostRecentLoginId) {
          $login = $l;
        }
      });

      if (!$login) {
        sessionIds.mostRecentLoginId = null;
      }

      return {
        // make a copy
        mostRecentLoginId: sessionIds.mostRecentLoginId
      , login: $login
      , logins: logins$
      , $logins: logins$ // reconstituted?
      , logins$: logins$
      , $login: $login

      , selectedAccountId: sessionIds.selectedAccountId
      , account: $account
      , accounts: accounts$
      , $accounts: accounts$ // reconstituted?
      , accounts$: accounts$
      , $account: $account
      };
    });
  }

  function handleNewLogin(reqUser) {
    return PromiseA.resolve().then(function (/*resolve, reject*/) {
      var $newLogin = reqUser.$newLogin
        ;

      if (!$newLogin) {
        return reqUser.$login;
      }

      delete reqUser.$newLogin;

      // Add the new login to the current session
      if (!reqUser.logins.some(function ($l) {
        if ($l.id === $newLogin.id) {
          return true;
        }
      })) {
        reqUser.logins.push($newLogin);
      }

      reqUser.$login = $newLogin;
      reqUser.mostRecentLoginId = $newLogin.id;

      // TODO remove, this is justbackwards compat
      reqUser.login = $newLogin.toJSON();


      // If there isn't a previous account
      //    we'll switch to the new primary
      // If there is a previous account
      //    leave it up to the client to decide whether or not to switch
      if (!reqUser.selectedAccountId) {
        reqUser.selectedAccountId = $newLogin.get('primaryAccountId');
      }

      $newLogin.related('accounts').forEach(function ($acc) {
        // If the associated accounts aren't in the session, add them
        if (!reqUser.accounts.some(function ($a) {
          return $acc.id === $a.id;
        })) {
          reqUser.accounts.push($acc);
        }

        if (!reqUser.$account) {
          if (reqUser.selectedAccountId === $acc.id) {
            reqUser.$account = $acc;
          }
        }
      });

      // TODO remove
      // but first ensure that primaryAccountId is never in disharmony
      if ($newLogin.get('primaryAccountId') && !$newLogin.related('accounts').length) {
        throw new Error('has primary account id, but no accounts');
      }

      // TODO remove
      // but first ensure that selectedAccountId is never in disharmony
      if (reqUser.selectedAccountId && !reqUser.$account) {
        throw new Error('has selected account id with account after loop');
      }

      return $newLogin;
    });
  }

  function indexOf(arr, id) {
    var index = -1;

    arr.some(function (login, i) {
      if (login.id === id) {
        index = i;
        return true;
      }
    });

    return index;
  }

  function serialize(reqUser) {
    return handleNewLogin(reqUser).then(function ($login) {
      // NOTE reqUser.$login === $login
      var sessionIds = { loginIds: [] }
        ;

      // TODO login.uid = appid + realLoginId + accountUuid
      sessionIds.mostRecentLoginId = $login.id;

      sessionIds.loginIds = reqUser.$logins.map(function ($l) {
        if (!$l.atime) {
          $l.atime = Date.now();
        }
        return { id: $l.id, atime: $l.atime };
      });


      // If this login isn't in the session serialization, add it
      // (I think this should always be true, but... just in case)
      if (-1 === indexOf(sessionIds.loginIds, $login.id)) {
        if (!$login.atime) {
          $login.atime = Date.now();
        }
        sessionIds.loginIds.push({ id: $login.id, atime: $login.atime });
      }

      sessionIds.selectedAccountId = reqUser.selectedAccountId;

      // TODO remove
      // but first make sure the error condition can't actually happen
      if (sessionIds.selectedAccountId && !reqUser.$account) {
        return PromiseA.reject(new Error('has selectedAccountId but no sessionIds.account'));
      }

      sessionIds.loginIds = sessionIds.loginIds.sort(function (a, b) {
        // most recent at index 0 (greatest atime)
        // oldest at index len - 1
        return b.atime - a.atime;
      });

      return sessionIds;
    });
  }

  Auth = {
    serialize: serialize
  , deserialize: deserialize
  , handleNewLogin: handleNewLogin
  , Logins: Logins
  , Accounts: Accounts
  , LocalLogin: LocalLogin
  , AppLogin: AppLogin
  , Oauth2Login: Oauth2Login
  , AccessTokens: AccessTokens
  };

  return Auth;
};
