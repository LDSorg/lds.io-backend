'use strict';

var PromiseA = require('bluebird').Promise;
var cipher = require('./common').cipher;
var decipher = require('./common').decipher;
var rejectableRequest = require('./common').rejectableRequest;
//var promiseRequest = require('./common').promiseRequest;

module.exports.createController = function (/*config, DB*/) {
  function LdsConnect() {
  }

  function handleResult($account, data, opts) {
    var result;

    if (opts && (opts.cache || opts.mime)) {
      result = { _value: data.result, _cache: opts.cache, _mime: opts.mime };
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

  function mergeAccount($account, profile) {
    var pub;
    var email;
    var phone;

    pub = $account.get('public');
    profile.userVerifiedAt = pub.userVerifiedAt || '1970-01-01T00:00:00.000Z';

    if (profile.emails[0]) {
      email = (profile.emails[0].value || '').toLowerCase().trim();
      if (pub.email !== email) {
        pub.emailVerifiedAt = '1970-01-01T00:00:00.000Z';
        pub.email = email;
      }

      profile.emails[0].verifiedAt = pub.emailVerifiedAt;
    }

    if (profile.phones[0]) {
      phone = (profile.phones[0].value || '').toLowerCase().trim();
      if (pub.phone !== phone) {
        pub.phoneVerifiedAt = '1970-01-01T00:00:00.000Z';
        pub.phone = phone;
      }

      profile.phones[0].verifiedAt = pub.phoneVerifiedAt;
    }

    $account.set('public', {
      phoneVerifiedAt: pub.phoneVerifiedAt
    , emailVerifiedAt: pub.emailVerifiedAt
    , phone: pub.phone
    , email: pub.email
    , stakes: profile.stakes
    , userVerifiedAt: pub.userVerifiedAt
    });

    return $account.save();
  }

  LdsConnect.raw = function (config, $account, url, params/*, opts*/) {
    // TODO cache parts of the profile and retrieve cache unless stale or opts.expire is true
    return require('./lds-account').raw({
      token: $account.get('token')
    , jar: $account.get('jar')
    , lastSessionAt: $account.get('lastSessionAt')
    }, url, params).then(function (data) {
      return handleResult($account, data);
    });
  };

  LdsConnect.profile = function (config, $account/*, opts*/) {
    // TODO cache parts of the profile and retrieve cache unless stale or opts.expire is true
    return require('./lds-account').profile({
      token: $account.get('token')
    , jar: $account.get('jar')
    , lastSessionAt: $account.get('lastSessionAt')
    }).then(function (data) {
      return mergeAccount($account, data.result).then(function (/*$account*/) {
        return handleResult($account, data);
      });
    });
  };

  LdsConnect.photo = function (config, $account, params/*, opts*/) {
    if (!params.id || 'undefined' === params.id || 'null' === params.id) {
      // client sending undefined is a common mistake
      return PromiseA.reject(new Error("missing or invalid photo id"));
    }

    return require('./lds-account').photo({
      token: $account.get('token')
    , jar: $account.get('jar')
    , lastSessionAt: $account.get('lastSessionAt')
    }, params.id, params.type, params.size).then(function (data) {
      // Images are cached for 3 months (90 days) because the meta-data
      // includes when they were last updated.  Hence the url will change
      // when there is a new image. :-)
      return handleResult($account, data, { cache: 90 * 24 * 60 * 60 * 1000, mime: 'image/jpeg' });
    });
  };

  LdsConnect.stake = function (config, $account, params/*, opts*/) {
    if (!params.id || 'undefined' === params.id || 'null' === params.id) {
      return PromiseA.reject(new Error("missing or invalid stake id"));
    }

    if ($account.get('public').stakes) {
      $account.get('public').stakes.some(function (stake) {
        if (params.id.toString() === stake.id.toString()) {
          params.name = stake.name;
          return true;
        }
      });
      if (!params.name) {
        return PromiseA.reject(new Error("that stake id was not found in available stakes"));
      }
    }

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
    if (!params.id || 'undefined' === params.id || 'null' === params.id) {
      return PromiseA.reject(new Error("missing or invalid stake id"));
    }

    if ($account.get('public').stakes) {
      $account.get('public').stakes.some(function (stake) {
        if (params.id.toString() === stake.id.toString()) {
          params.name = stake.name;
          return true;
        }
      });
      if (!params.name) {
        return PromiseA.reject(new Error("that stake id was not found in available stakes"));
      }
    }

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
    if (!params.id || 'undefined' === params.id || 'null' === params.id) {
      return PromiseA.reject(new Error("missing or invalid ward id"));
    }

    if ($account.get('public').stakes) {
      $account.get('public').stakes.some(function (stake) {
        /*
        if (params.id.toString() !== stake.id.toString()) {
          return;
        }
        */
        return stake.wards.some(function (ward) {
          if (params.id.toString() === ward.id.toString()) {
            params.name = ward.name;
            return true;
          }
        });
      });
      if (!params.name) {
        return PromiseA.reject(new Error("that ward id was not found in available wards"));
      }
    }

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
    if (!params.id || 'undefined' === params.id || 'null' === params.id) {
      return PromiseA.reject(new Error("missing or invalid ward id"));
    }

    if ($account.get('public').stakes) {
      $account.get('public').stakes.some(function (stake) {
        /*
        if (params.id.toString() !== stake.id.toString()) {
          return;
        }
        */
        return stake.wards.some(function (ward) {
          if (params.id.toString() === ward.id.toString()) {
            params.name = ward.name;
            return true;
          }
        });
      });
      if (!params.name) {
        return PromiseA.reject(new Error("that ward id was not found in available wards"));
      }
    }

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

  LdsConnect.markAsChecked = function ($account) {
    var pub = $account.get('public');

    pub.userVerifiedAt = new Date().toISOString();
    $account.set('public', pub);

    return $account.save();
  };

  LdsConnect.cipherMember = function (m, secret, sensitive) {
    m.appScopedId = cipher(m.id, secret);
    m.homeAppScopedId = m.homeId && cipher(m.homeId, secret) || null;
    m.emails.forEach(function (email) {
      email.appScopedId = cipher(email.value, secret);
    });
    m.phones.forEach(function (phone) {
      phone.appScopedId = cipher(phone.value, secret);
    });
    m.spouseAppScopedId = m.spouseId && cipher(m.spouseId, secret) || null;
    // TODO
    //m.parents / m.children

    if (sensitive) {
      m = {
        appScopedId: m.appScopedId
      , homeAppScopedId: m.homeAppScopedId
      , emails: m.emails.map(function (email) { return { appScopedId: email.appScopedId }; })
      , phones: m.phones.map(function (phone) { return { appScopedId: phone.appScopedId }; })
      , spouseAppScopedId: m.spouseAppScopedId
      , callings: m.callings
      // TODO adult, elder reliefsociety, etc
      // TODO head_of_house spouse_of_house child_of_house
      };
    }

    return m;
  };

  LdsConnect.cipherHome = function (h, secret, sensitive) {
    h.appScopedId = h.id && cipher(h.id, secret) || null;
    h.emailAppScopedId = h.email && cipher(h.email, secret) || null;
    h.phoneAppScopedId = h.phone && cipher(h.phone, secret) || null;

    if (sensitive) {
      return {
        appScopedId: h.appScopedId
      , emailAppScopedId: h.emailAppScopedId
      , phoneAppScopedId: h.phoneAppScopedId
      };
    }
    return h;
  };

  LdsConnect.cipherUnitPhotos = function (data, req) {
    var secret = req.oauth3.$client.get('secret');
    var sensitive = req.fromServer;
    var u = data._value;

    if (secret) {
      u.families.forEach(function (p) {
        p.appScopedId = cipher(p.id, secret);
      });
      u.members.forEach(function (p) {
        p.appScopedId = cipher(p.id, secret);
      });
    }

    if (sensitive) {
      u = {
        families: u.families.map(function (p) {
          return {
            appScopedId: p.appScopedId
          , type: p.type
          , updatedAt: p.updatedAt
          };
        })
      , members: u.members.map(function (p) {
          return {
            appScopedId: p.appScopedId
          , type: p.type
          , updatedAt: p.updatedAt
          };
        })
      };
    }

    data._value = u;
    return data;
  };

  LdsConnect.cipherWard = function (data, req) {
    var secret = req.oauth3.$client.get('secret');
    var sensitive = req.fromServer;
    var w = data._value;

    w.members.forEach(function (m, i) {
      w.members[i] = LdsConnect.cipherMember(m, secret, sensitive);
    });
    w.homes.forEach(function (h, i) {
      w.homes[i] = LdsConnect.cipherHome(h, secret, sensitive);
    });

    w = {
      members: w.members
    , homes: w.homes
    , callings: w.callings
    , meetinghouse: w.meetinghouse
    // TODO move leader-finding logic to client
    //, leaders: !sensitive && w.leaders || undefined
    };

    data._value = w;
    return data;
  };

  return LdsConnect;
};

module.exports.createView = function (config, DB, Verifier, AccessTokens, ContactNodes) {
  var Accounts = require('./accounts').createController(config, DB/*, Auth*/);
  var promiseRequest = require('./common').promiseRequest;

  var LdsConnect = module.exports.createController(config, DB/*, Verifier*/);

  LdsConnect.restful = {};

  LdsConnect.restful.profile = function (req, res) {
    var $client = req.oauth3.$client;

    var promise = LdsConnect.profile(config, req.$account, { expire: req.query.expire }).then(function (p) {
      var secret;
      var sensitive;

      if (!$client) {
        return p;
      }

      //sensitive = !$token.get('insecure');
      sensitive = req.fromServer;
      secret = $client.get('secret');

      p.appScopedId = cipher(p.individualId, secret);
      p.homeStakeAppScopedId = cipher(p.homeStakeId, secret);
      p.homeWardAppScopedId = cipher(p.homeWardId, secret);
      /*
      p.emails.forEach(function (email) {
        email.appScopedId = cipher(email.value, secret);
      });
      p.phones.forEach(function (phone) {
        phone.appScopedId = cipher(phone.value, secret);
      });
      */
      p.photos.forEach(function (photo) {
        photo.appScopedId = cipher(photo.id, secret);
      });
      p.wardsWithCalling.forEach(function (u) {
        u.wardAppScopedId = cipher(u.wardId, secret);
        u.stakeAppScopedId = cipher(u.stakeId, secret);
      });
      p.stakesWithCalling.forEach(function (u) {
        u.stakeAppScopedId = cipher(u.stakeId, secret);
      });
      p.stakes.forEach(function (stake) {
        stake.appScopedId = cipher(stake.id, secret);
        stake.wards.forEach(function (ward) {
          ward.appScopedId = cipher(ward.id, secret);
        });
      });
      //p.spouseAppScopedId = p.spouseId && cipher(p.spouseId, secret) || null;
      // TODO
      //p.parents / p.children

      // insecure means browser, which means client
      // secure means server, which also means no client data
      if (sensitive) {
        p = {
          appScopedId: p.appScopedId
          // TODO hack for meteorjs
        , id: p.appScopedId
        , homeStakeAppScopedId: p.homeStakeAppScopedId
        , homeWardAppScopedId: p.homeWardAppScopedId
        /*
        , emails: p.emails.map(function (e) { return { appScopedId: e.appScopedId }; })
        , phones: p.phones.map(function (p) { return { appScopedId: p.appScopedId }; })
        */
        , callings: p.callings
        , photos: p.photos.map(function (p) {
            return {
              appScopedId: p.appScopedId
            , type: p.type
            , updatedAt: p.updatedAt
            };
          })
        , wardsWithCalling: p.wardsWithCalling.map(function (u) {
            return {
              stakeAppScopedId: u.stakeAppScopedId
            , wardAppScopedId: u.wardAppScopedId
            , typeId: u.typeId
            , type: u.type
            };
          })
        , stakesWithCalling: p.stakesWithCalling.map(function (u) {
            return {
              stakeAppScopedId: u.stakeAppScopedId
            , typeId: u.typeId
            , type: u.type
            };
          })
        , stakes: p.stakes.map(function (u) {
            return {
              appScopedId: u.appScopedId
            , type: u.type
            , typeId: u.typeId
            , wards: u.wards.map(function (u) {
                return {
                  appScopedId: u.appScopedId
                , type: u.type
                , typeId: u.typeId
                };
              })
            };
          })
        //, spouseAppScopedId: p.spouseAppScopedId
        // TODO
        // wards_with_calling
        // stakes_with_calling
        // stakes
        };
      }

      return p;
    });
    return promiseRequest(req, res, promise, "get lds account profile");
  };

  LdsConnect.restful.stake = function (req, res) {
    var stakeId = req.params.stakeId;
    var promise;

    stakeId = decipher(stakeId, req.oauth3.$client.get('secret'));

    promise = LdsConnect.stake(config, req.$account, { 
      id: stakeId
    , expire: req.query.expire
    }).then(function (stake) {
      return LdsConnect.cipherWard(stake, req);
    });

    return promiseRequest(req, res, promise, "get lds ward");
  };

  LdsConnect.restful.ward = function (req, res) {
    var wardId = req.params.wardId;
    var promise;

    wardId = decipher(wardId, req.oauth3.$client.get('secret'));

    promise = LdsConnect.ward(config, req.$account, { 
      id: wardId
    , expire: req.query.expire
    }).then(function (ward) {
      return LdsConnect.cipherWard(ward, req);
    });

    return promiseRequest(req, res, promise, "get lds ward");
  };

  LdsConnect.restful.stakePhotos = function (req, res) {
    var stakeId = req.params.stakeId;
    var promise;

    stakeId = decipher(stakeId, req.oauth3.$client.get('secret'));

    promise = LdsConnect.stakePhotos(config, req.$account, { 
      id: stakeId
    , expire: req.query.expire
    }).then(function (data) {
      return LdsConnect.cipherUnitPhotos(data, req);
    });

    return promiseRequest(req, res, promise, "get lds ward");
  };

  LdsConnect.restful.wardPhotos = function (req, res) {
    var wardId = req.params.wardId;
    var promise;

    wardId = decipher(wardId, req.oauth3.$client.get('secret'));

    promise = LdsConnect.wardPhotos(config, req.$account, { 
      id: wardId
    , expire: req.query.expire
    }).then(function (data) {
      return LdsConnect.cipherUnitPhotos(data, req);
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

    // assign after shimming
    var photoId = req.params.photoId;
    var promise;

    if (req.$client) { 
      /*
      if (!req.$token.get('insecure')) {
        return PromiseA.reject("this is a server-side token, you can't use it to get pictures in the browser");
      }
      */
      if (req.fromServer) {
        return PromiseA.reject("member photos should only be access on clients"
          + " (on Android / iOS please use the appropriate 'User-Agent' and web app 'Origin')");
      }
      photoId = decipher(photoId, req.$client.get('secret'));
    }

    promise = LdsConnect.photo(config, req.$account, { 
      type: req.params.photoType
    , id: photoId
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
    var promise = new PromiseA(function (resolve) {
      var accounts = req.oauth3.accounts$.map(function ($account) {
        var appScopedId;
        var result;
        var pub = $account.get('public');
        var never = '1970-01-01T00:00:00.000Z';

        if (req.$client) { 
          appScopedId = cipher($account.id, req.$client.get('secret'));
        }

        result = {
            appScopedId: appScopedId
          , emailVerifiedAt: pub.emailVerifiedAt || never
          , phoneVerifiedAt: pub.phoneVerifiedAt || never
          , userVerifiedAt: pub.userVerifiedAt || never
          , hasEmail: !!pub.email
          , hasPhone: !!pub.phone
        };

        if (!req.fromServer) {
          result.id = $account.id;
        }

        return result;
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

    if (!node || 'undefined' === node || 'null' === node) {
      res.error({
        code: 'E_INVALID_CONTACT_NODE'
      , message: "no phone number or email address was given to check"
      });
      return;
    }

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

  // TODO handle account and 0+ logins
  LdsConnect.restful.createAccount = function (req, res) {
    var newAccount = req.body.account;
    var requestedLogins = req.body.logins || [];
    var authorizedLogins$ = req.oauth3.logins$;
    var promise = PromiseA.when();

    promise = promise.then(function () {
      return Accounts.createWithLogins(null, newAccount, authorizedLogins$, requestedLogins).then(function ($account) {
        var account = Accounts.publish(null, $account);

        account.appScopedId = cipher(account.id, req.$client.get('secret'));
        account.checkedAt = $account.get('public').checkedAt || '1970-01-01T00:00:00.000Z';
        // TODO don't resend entire session
        //res.send({ success: true });

        res.send(account);
      }, function (err) {
        res.send({
          error: { 
            message: err && err.message || 'invalid logins or accounts'
          , code: err && err.code
          }
        });
      });
    });

    return rejectableRequest(req, res, promise, 'Accounts.restful.create');
  };

  LdsConnect.restful.markAsChecked = function (req, res) {
    var $account = req.$account;
    var promise = LdsConnect.markAsChecked($account).then(function () {
      return { success: true };
    });

    return promiseRequest(req, res, promise, "logins markAsChecked");
  };

  LdsConnect.restful.getRaw = function (req, res) {
    // TODO require verified account
    var params = [];
    var proxyableUrl = req.query.url;

    // false evillds.org
    // true lds.org
    // true good.lds.org
    // true really.good.lds.org
    if (!/https:\/\/([^\/\?\&\#]+\.)?lds.org\//.test(proxyableUrl)) {
      res.error({
        code: 'E_INVALID_PARAM'
      , message: "The URL you supplied was not part of lds.org or one of it's subdomains"
      });
      return;
    }

    var promise = LdsConnect.raw(config, req.$account, proxyableUrl, params, { expire: req.query.expire });
    return promiseRequest(req, res, promise, "get raw lds.org resource");
  };

  return LdsConnect;
};

module.exports.create = module.exports.createRouter = function (app, config, DB, AccessTokens, ContactNodes) {
  var Verifier = require('./verify-stuff').createView(config, DB, ContactNodes);
  var LdsConnect = module.exports.createView(config, DB, Verifier, AccessTokens, ContactNodes);

  function requireDevelopmentToken(req, res, next) {
    var $client = req.oauth3.$client;
    if (!(req.oauth3.$token.get('test') || $client.get('root') || 'groot' === $client.get('accountUuid')) || req.fromServer) {
      res.error({
        code: 'E_INVALID_ENVIRONMENT'
      , message: "This resource is intended for development and debugging in the client only. You may not use it in production or from the server."
      });
      return;
    }
    next();
  }

  function requireLdsAccount(req, res, next) {
    if (req.query.server) {
      req.fromServer = true;
    }

    var accountId = req.params.accountId || req.params[0];
    accountId = decipher(accountId, req.oauth3.$client.get('secret'));

    // TODO should be able to remove this
    // 1st Party Bearer tokens select a login
    // 3rd Party Bearer tokens select an account
    req.$account = req.oauth3.$account;
    if (req.$account && ('undefined' ===  accountId)) {
      next();
      return;
    }

    req.oauth3.accounts$.some(function ($acc) {
      if ($acc.id === accountId) {
        req.$account = $acc;
      }
    });

    if (!req.$account) {
      console.warn();
      console.warn("[error] account not found in session");
      console.warn(req.oauth3);
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
    rest.delete('/session', LdsConnect.restful.logout);
    rest.get('/accounts', LdsConnect.restful.accounts);
    rest.post('/accounts', LdsConnect.restful.createAccount);

    rest.get('/:accountId/me', requireLdsAccount, LdsConnect.restful.profile);
    //rest.get('/me', requireLdsAccount, LdsConnect.restful.profile);

    // TODO require verified account
    rest.get('/:accountId/debug/raw', requireLdsAccount, requireDevelopmentToken, LdsConnect.restful.getRaw);
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

    rest.post('/:accountId/verify/code', requireLdsAccount, Verifier.restful.getClaimCode);
    rest.post('/:accountId/verify/code/validate', requireLdsAccount, LdsConnect.restful.validateClaimCode);

    rest.post('/:accountId/mark-as-checked', requireLdsAccount, LdsConnect.restful.markAsChecked);
  }

  return {
    route: route
  , LdsConnect: LdsConnect
  };
};
