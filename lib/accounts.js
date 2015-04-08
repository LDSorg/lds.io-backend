'use strict';

var UUID = require('node-uuid');
var PromiseA = require('bluebird').Promise;

function rejectableRequest(req, res, p, msg) {
  return p.error(function (err) {
    res.error(err);
  }).catch(function (err) {
    console.error("[ERROR] '" + (msg) + "'");
    console.error(err);
    res.error(err);

    throw err;
  });
}
function promiseRequest(req, res, p, msg) {
  return p.then(function (result) {
    res.send(result);
  }).error(function (err) {
    res.error(err);
  }).catch(function (err) {
    console.error("[ERROR] '" + (msg) + "'");
    console.error(err);
    res.error(err);

    throw err;
  });
}

module.exports.createController = function (config, DB, Auth) {
  function Accounts() {
  }

  Accounts.create = function (config, newAccount, opts) {
    var uuid = opts && opts.id || UUID.v4();
    var $account;

    $account = DB.Accounts.forge(newAccount);

    return $account/*.on('query', logQuery)*/.save({ uuid: uuid }, { method: 'insert' });
  };

  Accounts.lintLogins = function (config, $authorizedLogins, requestedLogins) {
    var authorizedLoginsMap = {};
    var requestedLoginsMap$ = [];
    var authorizedRequests$;
    var rejectable;

    //
    // check that all logins are ones I'm currently logged into
    //
    $authorizedLogins.forEach(function ($l) {
      authorizedLoginsMap[$l.id] = $l;
    });

    if (!requestedLogins.length) {
      return PromiseA.reject({ message: 'You didn\'t give any accounts to link to' });
    }

    if (requestedLogins.some(function (l) {
      if (!l.id) {
        rejectable = PromiseA.reject({ message: 'You gave a login without an id. Use /logins/create to login first.' });
        return true;
      }

      if (!authorizedLoginsMap[l.id]) {
        rejectable = PromiseA.reject({ message: 'You gave a login that is not in your current session' });
        return true;
      }

      requestedLoginsMap$[l.id] = authorizedLoginsMap[l.id];
    })) {
      return rejectable;
    }

    authorizedRequests$ = Object.keys(requestedLoginsMap$).map(function (key) {
      return requestedLoginsMap$[key];
    });

    return PromiseA.resolve(authorizedRequests$);
  };
  // trusting that the implementer has paired the logins
  Accounts.dangerousAttachLogins = function (config, $account, $authorizedRequests) {
    var ps = [];
    // TODO maybe do this in reverse? So that it ends up in the session?
    // logins.forEach.related('accounts').attach(account)
    /*
    return $account.related('logins').attach(requestedLogins.map(function (login) {
      return login.id;
    }))
    */
    $authorizedRequests.forEach(function ($login) {
      ps.push(Auth.Logins.linkAccounts($login, [$account]).catch(function (err) {
        // TIM TIM why can't I attach things when linkAccounts just checked that they weren't already attached?
        if (/SQLITE_CONSTRAINT: UNIQUE/.test(err.message)) {
          console.warn('[1] Bookshelf used FML. It was very effective');
          return PromiseA.resolve($login);
        }

        console.error(err);
        throw err;
      }));
    });

    return PromiseA.all(ps).then(function (logins$) {
      //
      // return the result
      //
      var ps = []
        ;

      logins$.forEach(function ($login) {
        ps.push(Auth.Logins.letPrimaryAccount($login, $account));
      });

      return PromiseA.all(ps);
    });
  };
  Accounts.attachLogins = function (config, $account, $authorizedLogins, requestedLogins) {
    return Accounts.lintLogins(config, $authorizedLogins, requestedLogins).then(function (authorizedRequests$) {
      return Accounts.dangerousAttachLogins(config, $account, authorizedRequests$);
    });
  };

  // handles the creation of an account and linking it to existing accounts
  Accounts.createWithLogins = function (config, newAccount, $authorizedLogins, requestedLogins) {
    //
    // check that the account doesn't violate basic constraints
    //
    if (newAccount.id || newAccount.uuid || newAccount._id) {
      return PromiseA.reject({
        message: 'You may not supply your own account id when creating an account', code: 501
      });
    }

    if (newAccount.role) {
      return PromiseA.reject({
        message: 'You may not supply your own role when creating an account', code: 501
      });
    }
//attachLogins

    return Accounts.lintLogins(config, $authorizedLogins, requestedLogins).then(function (authorizedRequests$) {
      // TODO middleware hook goes here
      // TODO remove, this is ldsaccount specific
      var ldslogin;
      var ldslogins = authorizedRequests$.filter(function ($login) {
        return 'local' === $login.get('type');
      });
      var profile;
      var me;

      if (ldslogins.length < 1) {
        return PromiseA.reject("You must have an LDS Account to create an account at this time.");
      }
      if (ldslogins.length > 1) {
        return PromiseA.reject("You may only link one LDS Account per account at this time.");
      }

      ldslogin = ldslogins[0];
      if (0 !== ldslogin.related('accounts').length) {
        return PromiseA.reject("You may only create one account per LDS Account at this time.");
      }

      newAccount.token = ldslogin.get('token');
      newAccount.jar = ldslogin.get('jar');
      newAccount.lastSessionAt = ldslogin.get('lastSessionAt');
      profile = (ldslogin.get('profile')||{});
      me = (profile.me||{});
      // TODO sync up on every manual login
      // (and on occasion just for fun)
      newAccount.public = {
        individualId: me.individualId || me.id
      /*
      , homeId: me.homeId
      , phones: me.phones
      , emails: me.emails
      , name: me.name
      , givennames: me.givennames
      , surnames: me.surnames
      , homeWardId: 
      , homeStakeId: 
      , callings: profile.callings
      , callingWards: profile.wards
      , stakeStakes: profile.stakes
      */
      };
      return Accounts.create(config, newAccount, { manualId: ldslogins[0].get('id') }).then(function ($account) {
        // NOTE: we lint before creating the account and then attach directly after creating it
        return Accounts.dangerousAttachLogins(config, $account, authorizedRequests$).then(function (/*jointables*/) {
          return $account;
        });
      });
    });
  };

  Accounts.get = function (config, id) {
    return DB.Accounts.forge({ uuid: id }).fetch();
  };

  Accounts.getData = function (/*config, $account, id*/) {
    return PromiseA.reject(new Error("not implemented"));
  };

  Accounts.setData = function (/*config, $account, id, data*/) {
    return PromiseA.reject(new Error("not implemented"));
  };

  Accounts.publish = function (client, $account/*, opts*/) {
    // TODO if this is used by other functions that create we
    // should return all logins associated with the account
    //var $logins = $account.related('logins');
    var json;
    var pub;

    delete $account.relations.logins;
    //$account.relations.logins = undefined;
    json = $account.toJSON();
    pub = json.public;

    if (!pub) {
      pub = {};
    }

    /*
    pub.logins = $logins.map(function ($login) {
      return {
        id: $login.id
      };
    });
    */

    // TODO appScopedId
    pub.id = json.uuid;

    return pub;
  };

  return Accounts;
};

/*
module.exports.createView = function (config, DB, Auth) {
};
*/

module.exports.createRouter = function (app, config, DB, Auth) {
  var Accounts = module.exports.createController(config, DB, Auth)
    ;

  Accounts.restful = {};

  Accounts.restful.setData = function (req, res) {
    var promise = Accounts.setData(config, req.$account, req.params.id, req.body);
    return promiseRequest(req, res, promise, 'accounts setData');
  };

  Accounts.restful.getData = function (req, res) {
    var promise = Accounts.setData(config, req.$account, req.params.id);
    return promiseRequest(req, res, promise, 'accounts getData');
  };

  // TODO handle account and 0+ logins
  Accounts.restful.create = function (req, res) {
    var newAccount = req.body.account;
    var requestedLogins = req.body.logins || [];
    var authorizedLogins$ = req.logins$ || req.$logins 
      || (req.user && (req.user.logins$ || req.user.$logins || req.user.logins))
      || (req.$login && [req.$login]) || []
      ;

    // var curAccounts$ = req.$accounts || req.user.$accounts || req.user.accounts || [];
    var promise = Accounts.createWithLogins(null, newAccount, authorizedLogins$, requestedLogins);

    promise.then(function ($account) {
      // TODO don't resend entire session
      //res.send({ success: true });

      // if no account is selected, select this one
      if (!req.user.selectedAccountId) {
        req.user.selectedAccountId = $account.id;
      }

      //$account.toJSON()
      res.send(Accounts.publish(null, $account));
    }).error(function (err) {
      res.send({
        error: { 
          message: err && err.message || 'invalid logins or accounts'
        , code: err && err.code
        }
      });
    });

    return rejectableRequest(req, res, promise, 'Accounts.restful.create');
  };

  Accounts.restful.attachLogins = function (req, res) {
    //var accountId = req.params.accountId;
    var $account = req.$account;
    var requestedLogins = req.body.logins || [];
    var authorizedLogins$ = req.$logins || req.user.$logins || req.user.logins || [];

    var promise = Accounts.attachLogins(
      null
    , $account
    , authorizedLogins$
    , requestedLogins
    ).then(function (/*jointables*/) {
      res.send({ success: true });
    }).error(function (err) {
      res.send({
        error: { 
          message: err && err.message || "could not attach invalid logins or accounts"
        , code: err && err.code
        }
      });
    });

    return rejectableRequest(req, res, promise, 'Accounts.restful.attachLogins');
  };


  function requireAccount(req, res, next) {
    req.user.accounts$.some(function ($acc) {
      if ($acc.id === req.params.accountId) {
        req.$account = $acc;
      }
    });

    next();
  }

  function route(rest) {
    function noImpl(req, res) {
      res.error(501, 'NOT IMPLEMENTED');
    }

    // Create a new account
    rest.post('/accounts', Accounts.restful.create);
    // Update the selected account
    rest.post('/accounts/:accountId', noImpl);
    // link a login to the selected account
    rest.post('/accounts/:accountId/logins', requireAccount, Accounts.restful.attachLogins);
    // unlink a login from the selected account
    rest.delete('/accounts/:accountId/logins', noImpl);

    rest.get('/accounts/:accountId/data/:id', requireAccount, Accounts.restful.getData);
    rest.post('/accounts/:accountId/data/:id', requireAccount, Accounts.restful.setData);
  }

  return {
    route: route
  };
};
