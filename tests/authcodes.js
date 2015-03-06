'use strict';

var config = require('../priv/config')
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
  var Codes = require('../lib/authcodes').create(DB)
    , $code
    , tests
    , testsCheckId
    , count = 0
    ;

  function setup(opts) {
    return Codes.create(opts).then(function (_$code) {
      $code = _$code;
      return $code;
    });
  }

  function teardown() {
    var _$code = $code
      ;

    $code = null;
    return _$code.destroy();
  }

  // Test that success is successful
  tests = [
    function ($code) {
      return Codes.validate($code.get('uuid'), $code.get('code'), { skipCheckId: true }).then(function (correct) {
        if (!correct || !correct.uuid) {
          console.error(correct);
          throw new Error('expected $code.toJSON() to be the success result');
        }

        return Codes.validate($code.get('uuid'), $code.get('code'), { skipCheckId: true }).then(function () {
          throw new Error('expected the code to have been deleted');
        }, function (err) {
          if (!/not exist/.test(err.message)) {
            console.error(err);
            throw new Error('Got the wrong error');
          }
        });
      });
    }
  , function ($code) {
      return Codes.validate($code.get('uuid'), 'not-the-right-code', { skipCheckId: true }).then(function () {
        throw new Error("should have had an error");
      }, function (err) {
        if (!/incorrect/.test(err.message)) {
          console.error(err);
          throw new Error('should have had error about incorrect code');
        }

        return Codes.validate($code.get('uuid'), 'not-the-right-code', { skipCheckId: true }).then(function () {
          throw new Error("should have had an error");
        }, function (err) {
          if (!/you must wait/.test(err.message)) {
            console.error(err);
            throw new Error('should have had error about waiting longer between attempts');
          }
        });
      });
    }
  , function () {
      return Codes.validate('not-the-right-id', 'not-the-right-code', { skipCheckId: true }).then(function () {
        throw new Error("expected this to not work");
      }, function (err) {
        if (!/not exist/.test(err.message)) {
          console.error(err);
          throw new Error('Got the wrong error');
        }
      });
    }
  ];

  testsCheckId = [
    function ($code) {
      return Codes.validate($code.get('uuid'), $code.get('code'), { checkId: 'foo', skipSpeedCheck: true }).then(function () {
        throw new Error('Should have had checkId error');
      }, function (err) {
        if (!/wrong account/.test(err.message)) {
          console.error(err);
          throw new Error('Got the wrong error');
        }
      }).then(function () {
        return Codes.validate($code.get('uuid'), $code.get('code'), { checkId: 'abc123', skipSpeedCheck: true });
      });
    }
  ];

  forEachAsync(tests, function (next, fn) {
    setup().then(fn).then(teardown).then(function () {
      count += 1;
      next();
    }, function (err) {
      console.error('[ERROR] failure');
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
        console.error('[ERROR] failure');
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
  require('../bookcase/bookshelf-models').create(config, config.knexInst).then(init);
};

module.exports.create();
