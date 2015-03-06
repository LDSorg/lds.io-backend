'use strict';

function init(config, DB) {
  var PromiseA = require('bluebird').Promise
    //, Auth = require('../lib/auth-logic').create(DB, config)
    , Accounts = require('../lib/accounts').createController(config, DB)
    , Oauthclients = require('../lib/oauthclients').createController(config, DB)
    //, Logins = require('../lib/logins').createRestless(config, DB, Auth)
    , tests
    , shared = {}
    ;

  /*
  function getFooAuthOld() {
    return { uid: 'foouser', secret: 'foosecret' };
  }
  */

  function setup() {
    var p
      ;

    //shared.accId = '310b4365-4359-434f-9224-5421158d7502';
    if (shared.accId) {
      p = Accounts.get(null, shared.accId);
    } else {
      p = Accounts.create(config, {});
    }

    return p.then(function ($acc) {
      return $acc.load(['addresses']).then(function () {
        shared.accId = $acc.id;
        shared.$acc = $acc;
        return $acc;
      });
    });

    /*
    if (shared.$login) {
      return PromiseA.resolve(shared.$login);
    }

    return Auth.LocalLogin.create(getFooAuthOld()).then(function ($login) {
      shared.$login = $login;
      return $login;
    });
    */
  }

  function teardown() {
    return PromiseA.resolve();
  }

  function finalTeardown() {
    var ps = []
      ;

    shared.$acc.related('addresses').forEach(function ($addr) {
      ps.push($addr.destroy());
    });

    return PromiseA.all(ps).then(function () {
      return shared.$acc.destroy();
    });
  }

  tests = [
    function createClient($acc) {
      return Oauthclients.create(
        null
      , $acc
      , { name: "Awesome ACME App (Production)"
        , desc: "This app is just a test app, but we'll treat it like a real app, yay!"
        , urls: ["http://example.com", "http://sample.net"]
        , ips: ["127.0.0.1", "172.60.10.243"]
        , logo: "http://example.com/logo.png"
        , repo: "git@github.com/example/whatever.git"
        , keywords: ["ACME", "App", "Awesome"]
        , insecure: false // haha, that's a lie
        , test: false     // also a lie
        //, status: ''    // published / blocked / active?
        //, scope: ''     // the max scope the app will want
        }
      ).then(function ($client) {
        shared.$client = $client;

        var client = $client.toJSON()
          , p = {
              testInsecure: 0
            , realInsecure: 0
            , testSecure: 0
            , realSecure: 0
            }
          ;

        if (4 !== client.apikeys.length) {
          throw new Error("should have 4 keys");
        }

        client.apikeys.forEach(function (pair) {
          if (pair.test && pair.insecure) {
            p.testInsecure += 1;
            shared.testInsecureId = pair.id;
          }
          if (!pair.test && pair.insecure) {
            p.realInsecure += 1;
          }
          if (pair.test && !pair.insecure) {
            p.testSecure += 1;
          }
          if (!pair.test && !pair.insecure) {
            p.realSecure += 1;
            shared.realSecureId = pair.id;
          }
        });

        if (1 !== p.testInsecure) {
          throw new Error("test insecure");
        }
        if (1 !== p.realInsecure) {
          throw new Error("real insecure");
        }
        if (1 !== p.testSecure) {
          throw new Error("test secure");
        }
        if (1 !== p.realSecure) {
          throw new Error("real secure");
        }
        
        shared.clientId = $client.id;
        return client;
      });
    }

  , function updateClient() {
      return Oauthclients.update(
        null
      , shared.$client
      , { name: "New ACME App Name (Production)"
        , desc: "This new app is just a test app, but we'll treat it like a real app, yay!"
        , ips: ["172.60.10.243"]
        , apikeys: [
            { id: shared.testInsecureId
            , desc: "test insecure"
            }
          , { id: shared.realSecureId
            , desc: "real secure"
            }
          ]
        }
      ).then(function () {
        var $client = shared.$client
          ;

        if (4 !== $client.related('apikeys').length) {
          throw new Error("should have 4 keys");
        }

        $client.related('apikeys').forEach(function ($pair) {
          var pair = $pair.toJSON()
            ;

          if (pair.test && pair.insecure) {
            if (pair.id !== shared.testInsecureId) {
              throw new Error("wrong key for test insecure");
            }

            if ("test insecure" !== pair.desc) {
              throw new Error("wrong desc for test insecure", pair.desc);
            }

            shared.testInsecure = pair;
          }
          if (!pair.test && !pair.insecure) {
            if (pair.id !== shared.realSecureId) {
              throw new Error("wrong key for real secure");
            }

            if ("real secure" !== pair.desc) {
              throw new Error("wrong desc for real secure", pair.desc);
            }

            shared.realSecure = pair;
          }
        });
      });
    }

    // TODO cantOtherAccountClient
  , function getClient() {
      return Oauthclients.get(
        null
      , shared.$acc
      , shared.clientId
      ).then(function ($client) {
        if (!$client) {
          throw new Error("could not get client");
        }

        if (4 !== $client.related('apikeys').length) {
          throw new Error("didn't attach related apikeys");
        }
      });
    }

    /*
  , function createKeys() {
    }

  , function updateKeys() {
    }

  , function deleteKeys() {
    }

  , function deleteClient() {
    }
    */

  , function loginFail() {
      return Oauthclients.login(null, 'id', 'secret').then(function () {
        throw new Error("Should have had an error (with id)");
      }).catch(function (err) {
        if (!/incorrect/i.test(err.message)) {
          throw err;
        }
      });
    }

  , function loginTestInsecure() {
      return Oauthclients.login(null, shared.testInsecure.key, shared.testInsecure.secret).then(function ($key) {
        var key = $key.toJSON()
          ;

        if (!key.test) {
          throw new Error("should have been the test key");
        }

        if (!key.insecure) {
          throw new Error("should have been the insecure key");
        }
      });
    }

  , function loginRealSecure() {
      return Oauthclients.login(null, shared.realSecure.key, shared.realSecure.secret).then(function ($key) {
        var key = $key.toJSON()
          ;

        if (key.test) {
          throw new Error("should have been the real key");
        }

        if (key.insecure) {
          throw new Error("should have been the secure key");
        }
      });
    }

  , function loginRealSecureFail() {
      return Oauthclients.login(null, shared.realSecure.key, 'fail').then(function () {
        throw new Error("Should have had an error (with secret)");
      }).catch(function (err) {
        if (!/incorrect/i.test(err.message)) {
          throw err;
        }
      });
    }

  , function createDummy() {
      return Oauthclients.create(
        null
      , shared.$acc
      , { name: "Awesome ACME App (Production)"
        , desc: "This app is just a test app, but we'll treat it like a real app, yay!"
        , urls: ["http://example.com", "http://sample.net"]
        , ips: ["127.0.0.1", "172.60.10.243"]
        , logo: "http://example.com/logo.png"
        , repo: "git@github.com/example/whatever.git"
        , keywords: ["ACME", "App", "Awesome"]
        , insecure: false // haha, that's a lie
        , test: false     // also a lie
        //, status: ''    // published / blocked / active?
        //, scope: ''     // the max scope the app will want
        , apikeys: [
            { key: "key_1"
            , secret: "secret"
            , test: true
            , insecure: false
            }
          , { key: "key_2"
            , test: true
            , insecure: true
            }
          ]
        }
      ).then(function ($client) {
        var client = $client.toJSON()
          , key1 = client.apikeys[0]
          , key2 = client.apikeys[1]
          ;

        if (2 !== client.apikeys.length) {
          throw new Error("should have had exactly 2 predefined keys");
        }

        if ('pub_test_key_1' !== key1.key) {
          throw new Error("key_1 should be named as such");
        }

        if ('sec_test_secret' !== key1.secret) {
          throw new Error("key_1 secret should be secret");
        }

        if ('pub_test_key_2' !== key2.key) {
          throw new Error("key_2 should be named as such");
        }

        if ('anonymous' !== key2.secret) {
          throw new Error("key_2 secret should be secret");
        }
      });
    }
  ];

  return {
    tests: tests
  , setup: setup
  , teardown: teardown
  , finalTeardown: finalTeardown
  };
}

module.exports.init = init;

if (require.main === module) {
  require('../tester').create(__filename);
}
