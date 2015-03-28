'use strict';

var PromiseA = require('bluebird').Promise;

module.exports.createController = function (/*config, DB*/) {
  function LdsConnect() {
  }

  function handleResult($account, data, opts) {
    var result;

    if (opts && opts.cache) {
      result = { _value: data.result, _cache: opts.cache };
    } else {
      result = data.result;
    }

    if (!data.warning) {
      return result;
    }

    // If there was a warning, that means that either
    //  * the current session has been renewed
    //  * the current session has been replaced
    //  * the current token has been replaced
    $account.set('token', data.token);
    $account.set('jar', data.jar);
    $account.set('lastSessionAt', Date.now());

    return $account.save().then(function () {
      return result;
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
      // Images are cached for 3 months (90 days) because the meta-data
      // includes when they were last updated.  Hence the url will change
      // when there is a new image. :-)
      return handleResult($account, data, { cache: 90 * 24 * 60 * 60 * 1000 });
    });
  };

  LdsConnect.stake = function (config, $account, params/*, opts*/) {
    // TODO get stake name from units on user
    // XXX
    /*
    $account.get('public').stakes.forEach(function (stake) {
      if (params.id.toString() === stake.id.toString()) {
        params.name = stake.name;
      }
    })
    if (!stake.name) {
      return PromiseA.reject(new Error("that stake id was not found in available stakes"));
    }
    */
    return require('./lds-account').stake({
      token: $account.get('token')
    , jar: $account.get('jar')
    , lastSessionAt: $account.get('lastSessionAt')
    }, params.name, params.id).then(function (data) {
      // cache 4-6 minutes
      var age = Math.floor(Math.random() * (2 * 60 * 1000)) + (4 * 60 * 1000);
      return handleResult($account, data, { cache: age });
    });
  };

  LdsConnect.stakePhotos = function (config, $account, params/*, opts*/) {
    /*
    $account.get('public').stakes.forEach(function (stake) {
      if (params.id.toString() === stake.id.toString()) {
        params.name = stake.name;
      }
    })
    if (!stake.name) {
      return PromiseA.reject(new Error("that stake id was not found in available stakes"));
    }
    */
    return require('./lds-account').stakePhotos({
      token: $account.get('token')
    , jar: $account.get('jar')
    , lastSessionAt: $account.get('lastSessionAt')
    }, params.id).then(function (data) {
      // cache 4-6 minutes
      var age = Math.floor(Math.random() * (2 * 60 * 1000)) + (4 * 60 * 1000);
      return handleResult($account, data, { cache: age });
    });
  };

  LdsConnect.ward = function (config, $account, params/*, opts*/) {
    // TODO get ward name from units on user
    // XXX
    /*
    $account.get('public').stakes.forEach(function (stake) {
      if (params.id.toString() !== stake.id.toString()) {
        return;
      }
      stake.wards.forEach(function (ward) {
        if (params.id.toString() === stake.id.toString()) {
          params.name = ward.name;
        }
      });
    })
    if (!ward.name) {
      return PromiseA.reject(new Error("that ward id was not found in available wards"));
    }
    */
    return require('./lds-account').ward({
      token: $account.get('token')
    , jar: $account.get('jar')
    , lastSessionAt: $account.get('lastSessionAt')
    }, params.name, params.id).then(function (data) {
      // cache 4-6 minutes
      var age = Math.floor(Math.random() * (2 * 60 * 1000)) + (4 * 60 * 1000);
      return handleResult($account, data, { cache: age });
    });
  };

  LdsConnect.wardPhotos = function (config, $account, params/*, opts*/) {
    /*
    $account.get('public').stakes.forEach(function (stake) {
      if (params.id.toString() !== stake.id.toString()) {
        return;
      }
      stake.wards.forEach(function (ward) {
        if (params.id.toString() === stake.id.toString()) {
          params.name = ward.name;
        }
      });
    })
    if (!ward.name) {
      return PromiseA.reject(new Error("that ward id was not found in available wards"));
    }
    */
    return require('./lds-account').wardPhotos({
      token: $account.get('token')
    , jar: $account.get('jar')
    , lastSessionAt: $account.get('lastSessionAt')
    }, params.id).then(function (data) {
      // cache 4-6 minutes
      var age = Math.floor(Math.random() * (2 * 60 * 1000)) + (4 * 60 * 1000);
      return handleResult($account, data, { cache: age });
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

  LdsConnect.restful.stake = function (req, res) {
    var promise = LdsConnect.stake(config, req.$account, { 
      id: req.params.stakeId
    , expire: req.query.expire
    });

    return promiseRequest(req, res, promise, "get lds ward");
  };

  LdsConnect.restful.stakePhotos = function (req, res) {
    var promise = LdsConnect.stakePhotos(config, req.$account, { 
      id: req.params.stakeId
    , expire: req.query.expire
    });

    return promiseRequest(req, res, promise, "get lds ward");
  };

  LdsConnect.restful.ward = function (req, res) {
    var promise = LdsConnect.ward(config, req.$account, { 
      id: req.params.wardId
    , expire: req.query.expire
    });

    return promiseRequest(req, res, promise, "get lds ward");
  };

  LdsConnect.restful.wardPhotos = function (req, res) {
    var promise = LdsConnect.wardPhotos(config, req.$account, { 
      id: req.params.wardId
    , expire: req.query.expire
    });

    return promiseRequest(req, res, promise, "get lds ward");
  };

  LdsConnect.restful.photo = function (req, res) {
    if (!req.params.photoId && req.params[3]) {
      if (!req.params[4]) {
        // /:accountId/photos/:type-:id-:size.jpg
        req.params.photoType = req.params[1];
        req.params.photoId = req.params[2];
        req.params.photoSize = req.params[3];
      } else {
        // /:accountId/photos/:id/(whatever)-:type-:size.jpg
        req.params.photoId = req.params[1];
        req.params.photoType = req.params[3];
        req.params.photoSize = req.params[4];
      }
    }
    console.log('restful.photo');
    console.log(req.params);
    var promise = LdsConnect.photo(config, req.$account, { 
      type: req.params.photoType
    , id: req.params.photoId
    , size: req.params.photoSize
    , expire: req.query.expire
    }).then(function (data) {
      if (Buffer.isBuffer(data) && data.length > 100) {
        res.set('Content-Type', 'image/jpeg');
      }

      return data;
    });
    return promiseRequest(req, res, promise, "get lds photo");
  };

  LdsConnect.restful.logout = function (req, res) {
    req.logout();
    res.send({ success: true });
  };

  LdsConnect.restful.accounts = function (req, res) {
    // TODO cipher accountid with private app secret?
    var promise = new PromiseA(function (resolve) {
      var accounts = req.user.accounts$.map(function ($account) {
        return { id: $account.id, appScopedId: null };
      });

      resolve({ accounts: accounts });
    });

    return promiseRequest(req, res, promise, "get accounts (in ldsconnect.js)");
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
    var accountId = req.params.accountId || req.params[0];
    // bearer token selects a single account
    req.$account = req.$account || req.user.$account;
    if ('undefined' ===  accountId && req.$account) {
      next();
      return;
    }

    req.user.accounts$.some(function ($acc) {
      if ($acc.id === accountId) {
        req.$account = $acc;
      }
    });

    if (!req.$account) {
      res.error({ message: "account id '" + encodeURIComponent(accountId) + "' not in session" });
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
    rest.delete('/session', requireLdsAccount, LdsConnect.restful.logout);
    rest.get('/accounts', requireLdsAccount, LdsConnect.restful.accounts);

    rest.get('/:accountId/me', requireLdsAccount, LdsConnect.restful.profile);
    rest.get('/me', requireLdsAccount, LdsConnect.restful.profile);

    rest.get('/:accountId/photos/:photoType/:photoId/:photoDate/:photoSize/:whatever.jpg', requireLdsAccount, LdsConnect.restful.photo);
    rest.get('/:accountId/photos/:photoType/:photoId/:photoSize/:whatever.jpg', requireLdsAccount, LdsConnect.restful.photo);
    rest.get(/^\/([^\/]+)\/photos\/([^\/\-]+)-([^\/\-]+)-([^\/\-]+)\.jpg$/, requireLdsAccount, LdsConnect.restful.photo);
    // /:accountId/photos/:photoId/(aj-oneal-or-whatever)-(:type)-(:size).jpg
    rest.get(/^\/([^\/]+)\/photos\/([^\/\-]+)\/([^\/]+)-([^\/\-]+)-([^\/\-]+)\.jpg$/, requireLdsAccount, LdsConnect.restful.photo);

    rest.get('/:accountId/stakes/:stakeId', requireLdsAccount, LdsConnect.restful.stake);
    rest.get('/stakes/:stakeId', requireLdsAccount, LdsConnect.restful.stake);

    rest.get('/:accountId/stakes/:stakeId/photos', requireLdsAccount, LdsConnect.restful.stakePhotos);
    rest.get('/stakes/:stakeId/photos', requireLdsAccount, LdsConnect.restful.stakePhotos);

    rest.get('/:accountId/stakes/:stakeId/wards/:wardId', requireLdsAccount, LdsConnect.restful.ward);
    rest.get('/stakes/:stakeId/wards/:wardId', requireLdsAccount, LdsConnect.restful.ward);

    rest.get('/:accountId/stakes/:stakeId/wards/:wardId/photos', requireLdsAccount, LdsConnect.restful.wardPhotos);
    rest.get('/stakes/:stakeId/wards/:wardId/photos', requireLdsAccount, LdsConnect.restful.wardPhotos);

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
