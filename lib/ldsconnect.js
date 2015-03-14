'use strict';

module.exports.createController = function (/*config, DB, ContactNodes*/) {
  function LdsConnect() {
  }

  LdsConnect.profile = function (config, $account/*, opts*/) {
    // TODO cache parts of the profile and retrieve cache unless stale or opts.expire is true
    return require('./lds-account').profile({
      token: $account.get('token')
    , jar: $account.get('jar')
    , lastSessionAt: $account.get('lastSessionAt')
    }).then(function (data) {
      if (!data.warning) {
        return data.result;
      }

      // If there was a warning, that means that either
      //  * the current session has been renewed
      //  * the current session has been replaced
      //  * the current token has been replaced
      $account.set('token', data.token);
      $account.set('jar', data.jar);
      $account.set('lastSessionAt', Date.now());
      return $account.save().then(function () {
        return data.result;
      });
    });
  };

  return LdsConnect;
};

module.exports.createView = function (config, DB, ContactNodes) {
  var promiseRequest = require('./common').promiseRequest;
  //var rejectableRequest = require('./common').rejectableRequest;

  var LdsConnect = module.exports.createController(config, DB, ContactNodes);

  LdsConnect.restful = {};

  LdsConnect.restful.profile = function (req, res) {
    var promise = LdsConnect.profile(config, req.$account, { expire: req.query.expire });
    return promiseRequest(req, res, promise, "get lds account profile");
  };

  return LdsConnect;
};

module.exports.create = module.exports.createRouter = function (app, config, DB, ContactNodes) {
  var LdsConnect = module.exports.createView(config, DB, ContactNodes.ContactNodes || ContactNodes);

  function requireLdsAccount(req, res, next) {
    req.user.accounts$.some(function ($acc) {
      if ($acc.id === req.params.accountId) {
        req.$account = $acc;
      }
    });

    if (!req.$account) {
      res.error({ message: "account id '" + encodeURIComponent(req.params.accountId) + "' not in session" });
      return;
    }

    if (!req.$account.get('token')) {
      res.error({ message: "account is corrupt. no token in session" });
      return;
    }

    next();
  }

  // TODO use bearer tokens even for logged-in users?
  // is there any disadvantage to making the API serve only one account at a time?
  function route(rest) {
    // Create a new account
    //rest.get('/logins', Logins.restful.upsert);
    rest.get('/:accountId/me', requireLdsAccount, LdsConnect.restful.profile);
    //rest.get('/:accountId/stake/:stakeId/ward/:wardId', requireLdsAccount, LdsConnect.restful.wardDirectory);
    //rest.get('/:accountId/stake/:stakeId', requireLdsAccount, LdsConnect.restful.stakeDirectory);
    //rest.get('/stake/:stakeId/ward/:wardId', LdsConnect.restful.wardDirectory);
    //rest.get('/stake/:stakeId', LdsConnect.restful.stakeDirectory);
  }

  return {
    route: route
  , LdsConnect: LdsConnect
  };
};
