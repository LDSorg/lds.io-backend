'use strict';

// NOTES
// create and delete require the parent
// get and getAll are done in the require, which requires the parent as context
// (the view bits do not)
// update needs schema

var PromiseA = require('bluebird').Promise;

module.exports.createController = function (config, Db) {
  var UUID = require('node-uuid');
  var authutils = require('secret-utils');
  var validate = require('./st-validate').validate;

  function OauthClients() {
  }

  //
  // Controller
  //
  OauthClients.login = function (config, key, secret) {
    return Db.ApiKeys
      .forge({ id: authutils.hashsum('sha256', key) })
      .fetch({ withRelated: ['oauthclient'] })
      .then(function ($apikey) {
        if (!$apikey) {
          return PromiseA.reject(new Error("Incorrect Api Key"));
        }

        if ($apikey.get('insecure')) {
          if (!secret || secret === 'anonymous') {
            return $apikey;
          } else {
            return PromiseA.reject(new Error("Incorrect Secret (insecure)"));
          }
        } else {
          if (authutils.testSecret($apikey.get('salt'), secret, $apikey.get('shadow'), $apikey.get('hashtype'))) {
            return $apikey;
          } else {
            return PromiseA.reject(new Error("Incorrect Secret"));
          }
        }
      });
  };

  OauthClients.lookup = function (config, key, opts) {
    opts = opts || {};

    return Db.ApiKeys
      .forge({ id: opts.id && key || authutils.hashsum('sha256', key) })
      .fetch({ withRelated: ['oauthclient'] })
      .then(function ($apikey) {
        if (!$apikey) {
          return PromiseA.reject(new Error("Incorrect Api Key"));
        }

        return $apikey;
      });
  };

  //
  // Helpers
  //
  function removeThing($things, id) {
    return $things.some(function ($thing, i) {
      if ($thing.id === id) {
        $thing.models.splice(i, 1);
        $thing.length -= 1;

        return true;
      }
    });
  }

  function selectThing($things, id, keyName) {
    var $t
      ;

    $things.forEach(function ($thing) {
      if (keyName) {
        if ($thing.get(keyName) === id) {
          $t = $thing;
        }
      } else if ($thing.id === id) {
        $t = $thing;
      }
    });

    return $t;
  }

  function updateThing($thing, updates) {
    Object.keys(updates).forEach(function (key) {
      if ('undefined' === typeof updates[key]) {
        return;
      }
        
      if (updates[key] !== $thing.get(key)) {
        $thing.set(key, updates[key]);
      }
    });

    if ($thing.hasChanged()) {
      return $thing.save();
    }

    return PromiseA.resolve();
  }

  //
  // API Keys
  //
  OauthClients.createKeys = function (config, $client, opts) {
    // Key lengths:
    // Facebook
    //   id         (6-byte) 15 digit int
    //   secret     (16-byte) 32 hex chars
    // Stripe
    //   id / secret (18-byte) 32/24 'pk_live_' + base62

    var keypair = {};
    var secByteLen = 16; //48
    var idByteLen = 16; //24
    var testSecByteLen = 16;
    var testIdByteLen = 6;

    [ 'urls'
    , 'ips'
    , 'testers'
    , 'insecure'
    , 'test'
    , 'desc'
    , 'expiresAt'
    ].forEach(function (k) {
      if (k in opts) {
        keypair[k] = opts[k];
      }
    });

    if (opts.insecure) {
      keypair.secret = 'anonymous';
    }

    function getId(byteLen, charLen) {
      var id;

      do {
        id = authutils.random(byteLen * 2, 'hex').replace(/^0+/g, '').replace(/[-_]+/g, '').substr(0, charLen);
      } while (id.length < charLen);

      return id;
    }

    function getSecret(byteLen, charLen) {
      var key;

      do {
        key = authutils.url64(byteLen * 2).replace(/^0+/g, '').replace(/[-_]+/g, '').substr(0, charLen);
      } while (key.length < charLen);

      return key;
    }

    if (opts.test) {
      keypair.key = opts.key || ('TEST_ID_' + getId(16, 24));
      if (!keypair.secret) {
        keypair.secret = opts.secret || ('TEST_SK_' + getSecret(16, 24));
      }
    } else {
      keypair.key = 'ID__' + getId(16, 28);
      if (!keypair.secret) {
        keypair.secret = 'SK__' + getSecret(16, 28);
      }
    }

    keypair.id = authutils.hashsum('sha256', keypair.key);
    keypair.salt = authutils.url64(32);
    keypair.shadow = authutils.createShadow(keypair.secret, 'sha384', keypair.salt).shadow;
    keypair.hashtype = 'sha384';

    keypair.oauthclientUuid = $client.id;

    return Db.ApiKeys.forge().save(keypair, { method: 'insert' }).then(function ($apikey) {
      // fake array needs a little help
      $client.related('apikeys').length += 1;
      $client.related('apikeys').models.push($apikey);

      return $apikey;
    });
  };

  OauthClients.getAllKeys = function (config, $client) {
    return $client.related('apikeys');
  };

  OauthClients.getKeys = function (config, $client, keyId) {
    var $keys = selectThing($client.related('apikeys'), keyId)
      ;

    return $keys;
  };

  OauthClients.updateKeys = function (config, $key, updates) {
    return updateThing($key, updates);
  };

  OauthClients.deleteKeys = function (config, $client, $key) {
    var key = $key.toJSON()
      ;

    removeThing($client.related('apikeys'), $key.id);

    return $key.destroy().then(function () {
      return key;
    });
  };

  //
  // Oauth Client Apps
  //
  OauthClients.create = function (config, $account, raw) {
    var client = {}
      , keypairs
      , ps = []
      ;

    [ 'name'
    , 'desc'
    , 'urls'
    , 'ips'
    , 'logo'
    , 'repo'
    , 'keywords'
    , 'insecure'
    , 'status'
    , 'test'
    , 'primary_id'
    //, 'published'
    , 'testers'
    ].forEach(function (k) {
      if (k in raw) {
        client[k] = raw[k];
      }
    });

    client.accountUuid = $account.id;

    if (Array.isArray(raw.apikeys)) {
      keypairs = raw.apikeys;
    }
    keypairs = keypairs || [];

    keypairs.forEach(function (keypair) {
      if ('key' in keypair || 'secret' in keypair) {
        keypair.test = true;
      }

      ps.push(validate({
        'key': ''
      , 'secret': ''
      , 'test': true
      , 'insecure': true
      , 'desc': ''
      , 'urls': ['']
      , 'ips': ['']
      , 'testers': []
      , 'expiresAt': new Date()
      }, keypair));
    });

    if (!client.accountUuid) {
      return PromiseA.reject(new Error("no accountUuid to associate"));
    }

    client.uuid = UUID.v4();

    return PromiseA.all(ps).then(function () {
      return Db.OauthClients.forge().save(client, { method: 'insert' }).then(function ($client) {
        return $client.related('apikeys').fetch().then(function () {
          var ps = []
            ;

          function genKeys() {
            var keySets = []
              ;

            // create test keys
            // create client keys
            if (!$client.get('test')) {
              if (!$client.get('insecure')) {
                keySets.push({
                  test: false
                , insecure: false
                , desc: "key for secure clients (ssl enabled web servers - node, ruby, python, etc)"
                });
              }

              keySets.push({
                test: false
              , insecure: true
              , desc: "key for insecure clients (browser, native apps, mobile apps)"
              });
            }

            if (!$client.get('insecure')) {
              keySets.push({
                test: true
              , insecure: false
              , desc: "test key for secure clients (ssl enabled web servers - node, ruby, python, etc)"
              });
            }

            keySets.push({
              test: true
            , insecure: true
            , desc: "test key for insecure clients (browser, native apps, mobile apps)"
            });

            return keySets;
          }

          if (!keypairs.length) {
            keypairs = genKeys();
          }

          keypairs.forEach(function (pair) {
            ps.push(OauthClients.createKeys(config, $client, pair));
          });

          return PromiseA.all(ps).then(function (/*pairs*/) {
            return $client;
          });
        });
      });
    });
  };

  OauthClients.get = function (config, $account, clientId) {
    if (clientId) {
      return OauthClients.getOne(config, $account, clientId);
    } else {
      return OauthClients.getAll(config, $account);
    }
  };

  OauthClients.getOne = function (config, $account, clientId) {
    if (!clientId) {
      return null;
    }

    return $account.related('oauthclients').fetch({ withRelated: ['apikeys'] }).then(function () {
      return selectThing($account.related('oauthclients'), clientId);
    });
  };

  OauthClients.getAll = function (config, $account) {
    return $account.related('oauthclients').fetch({ withRelated: ['apikeys'] }).then(function () {
      return $account.related('oauthclients');
    });
  };


  OauthClients.update = function (config, $client, updates) {
    return validate({
      'name': ''
    , 'desc': ''
    , 'urls': ['']
    , 'ips': ['']
    , 'logo': ''
    , 'repo': ''
    , 'keywords': ['']
    , 'insecure': true
    , 'status': ''
    , 'test': true
    //, 'primaryId'
    //, 'published'
    , 'testers': []
    , 'apikeys': [{
        'id': '' // allowed as an identifier, not mutable
      , 'urls': ['']
      , 'ips': ['']
      , 'testers': []
      , 'desc': ''
      , 'expiresAt': new Date()
      }]
    }, updates).then(function () {
      var apikeys = updates.apikeys || []
        , ps = []
        ;

      delete updates.apikeys;

      ps.push(updateThing($client, updates));

      apikeys.forEach(function (pair) {
        var $pair = selectThing($client.related('apikeys'), pair.id)
          ;

        delete pair.id;
        ps.push(updateThing($pair, pair));
      });

      return PromiseA.all(ps);
    });
  };

  OauthClients.delete = function (config, $account, $client) {
    var client = $client.toJSON()
      , ps = []
      ;

    removeThing($account.related('oauthclients'), $client.id);

    $client.related('apikeys').forEach(function ($key) {
      removeThing($client.related('apikeys'), $key.id);
      ps.push($key.destroy());
    });

    ps.push($client.destroy());

    return PromiseA.all(ps).then(function () {
      return client;
    });
  };

  return OauthClients;
};

module.exports.createView = function (config, Db) {
  var OauthClients = module.exports.createController(config, Db)
    ;

  //
  // RESTful OAuth
  //
  OauthClients.restful = {};

  //
  // API Keys
  //
  OauthClients.restful.createKeys = function (req, res) {
    var config = req.config
      , $client = req.$client
      , keys = req.body
      ;

    OauthClients.createKeys(config, $client, keys).then(function ($key) {
      res.json($key.toJSON());
    }).error(function (err) {
      res.error(err);
    }).catch(function (err) {
      console.error('CREATE Api Keys');
      console.error(err);
      res.error(err);

      throw err;
    });
  };

  OauthClients.restful.getAllKeys = function (req, res) {
    var $keys = req.$keys
      ;

    res.json($keys.toJSON());
  };

  OauthClients.restful.getKeys = function (req, res) {
    var $key = req.$key
      ;

    res.json($key.toJSON());
  };

  OauthClients.restful.updateKeys = function (req, res) {
    var config = req.config
      , updates = req.body
      , $key = req.$key
      ;

    OauthClients.updateKeys(config, $key, updates).then(function () {
      res.json({ success: true });
    }).error(function (err) {
      res.error(err);
    }).catch(function (err) {
      console.error('UPDATE API Keys');
      console.error(err);
      res.error(err);

      throw err;
    });
  };

  OauthClients.restful.deleteKeys = function (req, res) {
    var config = req.config
      , $client = req.$client
      , $key = req.$key
      ;

    OauthClients.deleteKeys(config, $client, $key).then(function (key) {
      res.json(key);
    }).error(function (err) {
      res.error(err);
    }).catch(function (err) {
      console.error('DELETE API Keys');
      console.error(err);
      res.error(err);

      throw err;
    });
  };


  //
  // OAuth Client Apps
  //
  OauthClients.restful.create = function (req, res) {
    var config = req.config
      , $account = req.user.account
      , client = req.body
      ;

    OauthClients.create(config, $account, client).then(function ($client) {
      res.json($client.toJSON());
    }).error(function (err) {
      res.error(err);
    }).catch(function (err) {
      console.error('CREATE OAUTH CLIENT');
      console.error(err);
      res.error(err);

      throw err;
    });
  };

  OauthClients.restful.getAll = function (req, res) {
    var $clients = req.$clients;
    // TODO create a test app for everyone when they access their list?
    /*
    var demoApps = [
      { name: "Test App"
      , url: "https://local.ldsconnect.org:4443"
      , logo: "https://dropsha.re/files/pink-emu-16/ldsconnect-app-256.png"
      , token: "09177b4c-2052-test-b672-5eda1321729e"
        // 746913342088510 for facebook
      , id: "55c7-test-bd03"
        // ad539732cbfbd60169f32336e257b37c for testing facebook
      , secret: "6b2fc4f5-test-8126-64e0-b9aa0ce9a50d"
        // http://local.foobar3000.com:4080 for testing facebook)
      , callback: "https://local.ldsconnect.org:4443"
      , description: "Use the username 'dumbledore' with password 'secret' to log in to the developer sandbox account. The 'Howarts Magical Realm' Area includes the 'Bettendorf' stake and 4 wards."
      , comments: "You can use this right away to start testing your application"
      , live: false
      , test: true
      }
    ];
    */

    //res.send({ clients: demoApps.concat($clients.toJSON()) });
    res.send({ clients: $clients.toJSON() });
  };

  OauthClients.restful.getOne = function (req, res) {
    var $client = req.$client
      ;

    res.json($client.toJSON());
  };

  OauthClients.restful.update = function (req, res) {
    var config = req.config
      //, $account = req.user.account
      , $client = req.$client
      , client = req.body
      ;

    OauthClients.update(config, $client, client).then(function ($client) {
      res.json($client.toJSON());
    }).error(function (err) {
      res.error(err);
    }).catch(function (err) {
      console.error('UPDATE OAUTH CLIENT');
      console.error(err);
      res.error(err);

      throw err;
    });
  };

  OauthClients.restful.delete = function (req, res) {
    var config = req.config
      , $account = req.user.account
      , $client = req.$client
      ;

    OauthClients.delete(config, $account, $client).then(function (client) {
      res.json(client);
    }).error(function (err) {
      res.error(err);
    }).catch(function (err) {
      console.error('DELETE OAUTH CLIENT');
      console.error(err);
      res.error(err);

      throw err;
    });
  };

  return OauthClients;
};

module.exports.createRouter = function (app, config, Db) {
  var OauthClients = module.exports.createView(config, Db)
    ;

  function requireClient(req, res, next) {
    var $account = req.user.account
      , clientId = req.params.clientId
      , p
      ;

    if (clientId) {
      p = OauthClients.getOne(null, $account, clientId).then(function ($client) {
        req.$client = $client;

        if (!$client) {
          return PromiseA.reject(new Error("did not find client"));
        }

        next();
      });
    } else {
      p = OauthClients.getAll(null, $account).then(function ($clients) {
        req.$clients = $clients;

        if (!$clients) {
          return PromiseA.reject(new Error("did not find clients associated with this account"));
        }

        next();
      });
    }

    return p.error(function (err) {
      res.error(err);
    }).catch(function (err) {
      console.error('ERROR requireClient');
      console.error(err);
      res.error(err);

      throw err;
    });
  }

  function requireKeys(req, res, next) {
    var $client = req.$client
      , keyId = req.params.keyId
      , p
      ;

    if (keyId) {
      p = OauthClients.getKeys(null, $client, keyId).then(function ($key) {
        req.$key = $key;

        if (!$key) {
          return PromiseA.reject(new Error("keys not found by that id"));
        }

        next();
      });
    } else {
      p = OauthClients.getAllKeys(null, $client).then(function ($keys) {
        req.$keys = $keys;

        if (!$keys) {
          return PromiseA.reject(new Error("keys not found by that id"));
        }

        next();
      });
    }
    
    return p.error(function (err) {
      res.error(err);
    }).catch(function (err) {
      console.error('ERROR requireClient');
      console.error(err);
      res.error(err);

      throw err;
    });
  }

  function requireAccount(req, res, next) {
    var accountId = req.params.accountId;

    if (req.$account) {
      next();
      return;
    }

    if (!req.user.accounts$) {
      res.error(new Error('no accounts'));
    }

    req.user.accounts$.forEach(function ($account) {
      if (accountId === $account.id) {
        req.$account = $account;
      }
    });

    if (!req.$account) {
      res.error(new Error('the account you requested is not in the session'));
      return;
    }

    next();
  }
  function requireVerifiedAccount() {
    // TODO check config.verificationStaleTime
    return function (req, res, next) {
      var staleTime = 3 * 30 * 24 * 60 * 60 * 1000;
      var emailVerifiedAt = req.$account.get('public').emailVerifiedAt;
      var phoneVerifiedAt = req.$account.get('public').phoneVerifiedAt;
      var fresh = true;

      fresh = fresh && (Date.now() - new Date(emailVerifiedAt).valueOf()) < staleTime;
      fresh = fresh && (Date.now() - new Date(phoneVerifiedAt).valueOf()) < staleTime;

      if (!fresh) {
        console.error('req.$account.toJSON()');
        console.error(req.$account.toJSON());
        res.error(new Error(
          "For security it is required that you periodically verify your contact details."
        + " Please verify your contact details now."
        ));
        return;
      }

      next();
    };
  }

  // 
  // ROUTES
  //
  OauthClients.route = function (rest) {
    //rest.get('/me/clients', requireClient, OauthClients.restful.getAll);
    //rest.post('/me/clients', requireVerifiedAccount(['email', 'phone']), OauthClients.restful.create);

    rest.get('/me/clients/:clientId', requireClient, OauthClients.restful.getOne);
    rest.post('/me/clients/:clientId', requireVerifiedAccount(['email', 'phone']), requireClient, OauthClients.restful.update);

    rest.get('/accounts/:accountId/clients', requireAccount, requireClient, OauthClients.restful.getAll);
    rest.post('/accounts/:accountId/clients', requireAccount, requireVerifiedAccount(['email', 'phone']), OauthClients.restful.create);

    rest.delete('/me/clients/:clientId', requireClient, OauthClients.restful.delete);

    //rest.post('/me/clients/:clientId/keys', requireClient, OauthClients.restful.createKeys);
    rest.get('/me/clients/:clientId/keys', requireClient, requireKeys, OauthClients.restful.getAllKeys);
    rest.get('/me/clients/:clientId/keys/:keyId', requireClient, requireKeys, OauthClients.restful.getKeys);
    rest.post('/me/clients/:clientId/keys/:keyId', requireClient, requireKeys, OauthClients.restful.updateKeys);
    rest.delete('/me/clients/:clientId/keys/:keyId', requireClient, requireKeys, OauthClients.restful.deleteKeys);

    /*
    rest.post('/me/clients', OauthClients.restful.create);
    rest.get('/me/clients', requireClient, OauthClients.restful.getAll);
    rest.get('/me/clients/:clientId', requireClient, OauthClients.restful.getOne);
    rest.post('/me/clients/:clientId', requireClient, OauthClients.restful.update);
    rest.delete('/me/clients/:clientId', requireClient, OauthClients.restful.delete);

    rest.post('/me/clients/:clientId/keys', requireClient, OauthClients.restful.createKeys);
    rest.get('/me/clients/:clientId/keys', requireClient, requireKeys, OauthClients.restful.getAllKeys);
    rest.get('/me/clients/:clientId/keys/:keyId', requireClient, requireKeys, OauthClients.restful.getKeys);
    rest.post('/me/clients/:clientId/keys/:keyId', requireClient, requireKeys, OauthClients.restful.updateKeys);
    rest.delete('/me/clients/:clientId/keys/:keyId', requireClient, requireKeys, OauthClients.restful.deleteKeys);    */
  };
  OauthClients.OauthClients = OauthClients;

  return OauthClients;
};
