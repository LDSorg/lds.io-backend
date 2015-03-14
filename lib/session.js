'use strict';

var PromiseA = require('bluebird').Promise
  ;

module.exports.createController = function () {
  function Sessions() {
  }

  Sessions.getGuest = function getGuest(method, type) {
    return PromiseA.resolve({
      as: method
    , type: type
    , logins: []
    , accounts: []
    , account: { role: 'guest' }
    , selectedAccountId: null
    , mostRecentLoginId: null
    });
  };

  Sessions.getPublic = function getPublic(reqUser, opts) {
    opts = opts || {};

    var mps = []
      , accounts = []
      ;

    if (!reqUser) {
      return null;
    }

    reqUser.accounts.forEach(function ($account) {
      var logins = [];
      var ps = [];
      var p;

      // you may see that you have linked other logins,
      // even if you are not currently logged in with that login.
      if (!opts.token) {
        p = $account.load(['logins']).then(function () {
          $account.related('logins').forEach(function ($login) {
            logins.push({
              hashid: $login.id
            , provider: $login.get('type')
            , comment: $login.get('comment') // TODO
            });
          });
        });

        ps.push(p);
      }
      
      p = PromiseA.all(ps).then(function () {
        var json;
        var pub;

        delete $account.relations.logins;
        //$account.relations.logins = undefined;
        json = $account.toJSON();
        pub = json.public;

        if (!pub) {
          pub = {};
        }
        pub.logins = logins;
        pub.id = json.uuid;

        if (opts.token) {
          //delete json.logins;
        }

        accounts.push(pub);
      });

      mps.push(p);
    });

    return PromiseA.all(mps).then(function () {
      var result
        ;

      result = {
        mostRecentLoginId: reqUser.login && reqUser.login.id
      , selectedAccountId: reqUser.account && reqUser.account.id
      , logins: reqUser.logins.map(function ($login) {
          var l
            , p
            ;

          l = $login.toJSON();
          p = l.public || l.profile || {};

          p.uid = p.id;
          p.id = l.id || l.hashid;
          p.hashid = p.id;
          p.type = l.type;
          p.primaryAccountId = l.primaryAccountId || null;
          p.atime = $login.atime;

          p.accountIds = $login.related('accounts').map(function (a) { return a.id; });
          p.accounts = $login.related('accounts').map(function (a) { return { id: a.id }; });

          return p;
        }).sort(function (a, b) {
          // most recent login at index 0
          // oldest login at index len - 1
          return b.atime - a.atime;
        })
      , accounts: accounts
      };

      return result;
    });
  };

  return Sessions;
};

module.exports.createView = function () {
  var Sessions = module.exports.createController()
    ;

  Sessions.restful = {};

  Sessions.restful.getSession = function (req, res) {
    var ps = []
      ;

    req.user = req.user || { accounts: [], logins: [] };
    req.user.accounts = req.user.accounts || [];
    req.user.logins = req.user.logins || [];
    req.user.accounts.forEach(function (account) {
      ps.push(account.load(['logins']));
    });

    PromiseA.all(ps).then(function () {
      if (req.user) {
        return Sessions.getPublic(req.user);
      } else {
        return Sessions.getGuest('get');
      }
    }).then(function (result) {
      res.send(result);
    }).catch(function (err) {
      console.error('[ERROR] /session');
      console.error(err);
      res.error(err);

      throw err;
    });
  };

  Sessions.restful.getTokenInfo = function (req, res) {
    if (!req.user || !req.user.$login || !req.user.$token || !req.user.accounts.length) {
      res.error({ message: "invalid bearer token" });
      return;
    }

    return Sessions.getPublic(req.user, { token: true })
      .then(function (result) {
        result.accounts.forEach(function (account) {
          if (account.id === req.user.$login.get('primaryAccountId')) {
            result.selectedAccountId = account.id;
          }
        });

        result.mostRecentLoginId = null;
        result.logins = [];

        res.send(result);
      }).catch(function (err) {
        console.error('[ERROR] /session');
        console.error(err);
        res.error(err);

        throw err;
      });
  };

  Sessions.restful.loginByType = function (req, res) {
    // NOTE: this is the fallthrough from the POST '/api' catchall

    // TODO have separate error / guest and valid user fallthrough
    function fin(result) {
      res.send(result);
    }
    function errback(err) {
      res.error(err);
    }

    if (req.user) {
      return Sessions.getPublic(req.user).then(fin).error(errback).catch(errback);
    } else {
      return Sessions.getGuest('post', req.params.type).then(fin).error(errback).catch(errback);
    }
  };

  Sessions.restful.logoutAll = function (req, res) {
    req.logout();

    Sessions.getGuest('delete').then(function (result) {
      res.send(result);
    });
  };

  return Sessions;
};

module.exports.createRouter = function () {
  var Sessions = module.exports.createView()
    , r = Sessions.restful
    ;

  // These are just fallthrough routes
  // The real logic is handled in the sessionlogic stuff
  // (and this all should probably move there)
  function route(rest) {
    rest.get('/session', r.getSession);

    // Begin: this is the fallthrough from the POST '/api' catchall
    rest.post('/session', r.loginByType);
    rest.post('/session/:type', r.loginByType);
    // END

    rest.delete('/session', r.logoutAll);

    rest.get('/tokeninfo', r.getTokenInfo);
  }

  return {
    route: route
  };
};
