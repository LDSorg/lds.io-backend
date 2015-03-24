'use strict';

var PromiseA = require('bluebird').Promise;

module.exports.createController = function (/*config, DB*/) {
  function LdsConnect() {
  }

  function handleResult($account, data) {
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
  }

  LdsConnect.profile = function (config, $account/*, opts*/) {
    // TODO cache parts of the profile and retrieve cache unless stale or opts.expire is true
    return require('./lds-account').profile({
      token: $account.get('token')
    , jar: $account.get('jar')
    , lastSessionAt: $account.get('lastSessionAt')
    }).then(function (data) {
      return handleResult($account, data);
    });
  };

  LdsConnect.photo = function (config, $account, params/*, opts*/) {
    return require('./lds-account').photo({
      token: $account.get('token')
    , jar: $account.get('jar')
    , lastSessionAt: $account.get('lastSessionAt')
    }, params.id, params.type, params.size).then(function (data) {
      return handleResult($account, data);
    });
  };

  return LdsConnect;
};

module.exports.createView = function (config, DB, Verifier, ContactNodes) {
  var promiseRequest = require('./common').promiseRequest;
  //var rejectableRequest = require('./common').rejectableRequest;

  var LdsConnect = module.exports.createController(config, DB, Verifier);

  LdsConnect.restful = {};

  LdsConnect.restful.profile = function (req, res) {
    var promise = LdsConnect.profile(config, req.$account, { expire: req.query.expire });
    return promiseRequest(req, res, promise, "get lds account profile");
  };

  LdsConnect.restful.photo = function (req, res) {
    var promise = LdsConnect.photo(config, req.$account, { 
      type: req.params.photoType
    , id: req.params.photoId
    , size: req.params.photoSize
    , expire: req.query.expire
    });
    return promiseRequest(req, res, promise, "get lds account profile");
  };

  LdsConnect.restful.validateClaimCode = function (req, res) {
    var $account = req.$account;
    var type = req.body.type;
    var node = req.body.node;
    var id = req.body.uuid || req.body.id;
    var code = req.body.code;
    var pub = $account.get('public');
    var promise;

    // TODO format
    if ('email' === type
      && ContactNodes.formatters.email(pub.email) === ContactNodes.formatters.email(node)) {
      pub.emailVerifiedAt = new Date().toISOString();
      $account.set('public', pub);
      promise = $account.save();
    } else if ('phone' === type
      && ContactNodes.formatters.phone(pub.phone) === ContactNodes.formatters.phone(node)) {
      pub.phoneVerifiedAt = new Date().toISOString();
      $account.set('public', pub);
      promise = $account.save();
    } else {
      /*
      console.error('[ERROR] type or value mismatch');
      console.error(type);
      console.error(
        $account.get('public').phone
      , ContactNodes.formatters.phone($account.get('public').phone)
      , ContactNodes.formatters.phone(node)
      );
      console.error(
        $account.get('public').email
      , ContactNodes.formatters.email($account.get('public').email)
      , ContactNodes.formatters.email(node)
      );
      */
      promise = PromiseA.reject(new Error("the contact details you are trying to verify do not match your account"));
    }

    promise = promise.then(function () {
      return Verifier.validateClaimCode(type, node, id, code, { destroyOnceUsed: true }).then(function () {
        return {
          type: type
        , node: node
        , validated: true
        };
      });
    });
    
    return promiseRequest(req, res, promise, "Verifier.restful.validateClaimCode");
  };

  return LdsConnect;
};

module.exports.create = module.exports.createRouter = function (app, config, DB, ContactNodes) {
  var Verifier = require('./verify-stuff').createView(config, DB, ContactNodes);
  var LdsConnect = module.exports.createView(config, DB, Verifier, ContactNodes);

  function requireLdsAccount(req, res, next) {
    // bearer token selects a single account
    req.$account = req.$account || req.user.$account;
    if ('undefined' === req.params.accountId && req.$account) {
      next();
      return;
    }

    console.info('requireLdsAccount req.user');
    console.log(req.user);
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
    rest.get('/me', requireLdsAccount, LdsConnect.restful.profile);

    rest.get('/:accountId/photos/:photoType/:photoId/:photoSize', requireLdsAccount, LdsConnect.restful.photo);
    rest.get('/photos/:photoType/:photoId/:photoSize', requireLdsAccount, LdsConnect.restful.photo);

    //rest.get('/:accountId/stake/:stakeId/ward/:wardId', requireLdsAccount, LdsConnect.restful.wardDirectory);
    //rest.get('/:accountId/stake/:stakeId', requireLdsAccount, LdsConnect.restful.stakeDirectory);
    //rest.get('/stake/:stakeId/ward/:wardId', LdsConnect.restful.wardDirectory);
    //rest.get('/stake/:stakeId', LdsConnect.restful.stakeDirectory);

    rest.post('/:accountId/verify/code', requireLdsAccount, Verifier.restful.getClaimCode);
    rest.post('/:accountId/verify/code/validate', requireLdsAccount, LdsConnect.restful.validateClaimCode);
  }

  return {
    route: route
  , LdsConnect: LdsConnect
  };
};
