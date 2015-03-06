'use strict';

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

  function getFooAuth() {
    return { uid: 'foouser', secret: 'foosecret' };
  }

  function setup() {
    return Auth.LocalLogin.create(getFooAuth()).then(function (_$login) {
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
      return Logins.reset(getFooAuth()).then(function ($code) {
        if (!$code) {
          throw new Error("Didn't get reset code");
        }

        if (!$code.id) {
          throw new Error("Didn't get reset code uuid");
        }

        if ($login.id !== $code.get('checkId')) {
          throw new Error("reset checkId doesn't match login id");
        }

        if (!$code.get('code')) {
          throw new Error("reset code doesn't exist");
        }

        return $code.destroy();
      });
    }
  , function () {
      return Logins.reset(getFooAuth()).then(function ($code) {
        return Logins.validateReset(getFooAuth(), { id: 'bad-id', code: 'bad-code' }).then(function () {
          throw new Error("should not validate invalid code");
        }, function (err) {
          if (!/exist/.test(err.message)) {
            console.error(err);
            throw new Error("expected error about invalid code");
          }

          return Logins.validateReset(getFooAuth(), { id: $code.id, code: $code.get('code') });
        });
      });
    }
  , function () {
      return Logins.reset(getFooAuth()).then(function ($code) {
        return Logins.validateReset({ uid: 'bad-uid' }, { id: 'bad-id', code: 'bad-code' }).then(function () {
          throw new Error("should not validate invalid code");
        }, function (err) {
          if (!/found/.test(err.message)) {
            console.error(err);
            throw new Error("expected error about login not found");
          }

          return Logins.validateReset(getFooAuth(), { id: $code.id, code: $code.get('code') });
        });
      });
    }
  , function () {
      // TODO what is the desired behavior here?
      return Logins.reset({ uid: 'doesnt-exist' }).then(function () {
        throw new Error("expected an error for resetting a login that doesn't exist");
      }, function (err) {
        if (!/found/.test(err.message)) {
          console.error(err);
          throw new Error("expected error about login not found");
        }
      });
    }
  , function () {
      return Logins.reset(getFooAuth()).then(function ($code1) {
        return Logins.reset(getFooAuth()).then(function () {
          throw new Error("expected error about existing reset");
        }, function (err) {
          $code1.destroy();
          if (!/outstanding/i.test(err.message)) {
            console.error(err);
            throw new Error("expected error about outstanding reset request");
          }
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
