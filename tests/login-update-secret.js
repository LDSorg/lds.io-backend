'use strict';

// TODO test that none of secret, newSecret, oldSecret are accidentally exposed
var config = require('../config')
  , path = require('path')
  , forEachAsync = require('forEachAsync').forEachAsync
  ;

config.knex = {
  client: 'sqlite3'
//, debug: true
, connection: {
    filename : path.join(__dirname, '..', 'priv', 'knex.dev.sqlite3')
  , debug: true
  }
};

function init(DB) {
  var Auth = require('../lib/auth-logic').create(DB, config)
    , Logins = require('../lib/logins').createRestless(config, DB, Auth)
    , $login
    , tests
    , testsCheckId
    , count = 0
    ;

  function getFooAuthOld() {
    return { uid: 'foouser', secret: 'foosecret' };
  }

  function getFooAuthNew() {
    return { uid: 'foouser', secret: 'secretfoo' };
  }

  function setup() {
    return Auth.LocalLogin.create(getFooAuthOld()).then(function (_$login) {
      $login = _$login;
      return $login;
    });
  }

  function teardown() {
    var _$login = $login
      ;

    $login = null;
    return _$login.destroy();
  }

  // Test that success is successful
  tests = [
    function ($login) {
      var oldAuth = getFooAuthOld()
        , newAuth = getFooAuthNew()
        , auth = getFooAuthOld()
        ;

      auth.newSecret = newAuth.secret;

      //console.log('[original] $login.toJSON()');
      //console.log($login.toJSON());
      return Logins.updateSecret(auth).then(function (/*$login*/) {
        //console.log('[updated] $login.toJSON()');
        //console.log($login.toJSON());
        return Auth.LocalLogin.login(oldAuth).then(function ($login) {
          if ($login) {
            console.log($login.toJSON());
            throw new Error("Shouldn't be able to login with old auth");
          }

          return Auth.LocalLogin.login(newAuth);
        });
      });
    }
  , function () {
      var oldAuth = getFooAuthOld()
        , badAuth = getFooAuthOld()
        ;

      badAuth.secret = 'bad-secret';
      badAuth.newSecret = getFooAuthNew().secret;

      return Logins.updateSecret(badAuth).then(function () {
        throw new Error("Shouldn't be able to change secret with bad auth");
      }, function (err) {
        // TODO test error
        // TODO make sure that the good auth still works and the bad auth does not
        return Auth.LocalLogin.login(badAuth).then(function () {
        }, function (err) {
          // TODO test error
          return Auth.LocalLogin.login(oldAuth);
        });
      });
    }
  ];

  testsCheckId = [
  ];

  forEachAsync(tests, function (next, fn) {
    setup().then(fn).then(teardown).then(function () {
      count += 1;
      next();
    }, function (err) {
      console.error('[ERROR] failure 1');
      console.error(err);
      console.error(fn.toString());
      return teardown();
    });
  }).then(function () {
    forEachAsync(testsCheckId, function (next, fn) {
      setup({ checkId: 'abc123' }).then(fn).then(teardown).then(function () {
        count += 1;
        next();
      }, function (err) {
        console.error('[ERROR] failure 2');
        console.error(err);
        console.error(fn.toString());
        return teardown();
      });
    }).then(function () {
      console.log('%d of %d tests complete', count, tests.length + testsCheckId.length);
      process.exit();
    });
  });
}

module.exports.create = function () {
  config.knexInst = require('../lib/knex-connector').create(config.knex);
  require('../lib/bookshelf-models').create(config, config.knexInst).then(init);
};

module.exports.create();
