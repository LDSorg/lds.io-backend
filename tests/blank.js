'use strict';

function init(config, DB) {
  var PromiseA = require('bluebird').Promise
    , tests
    , shared = {}
    ;

  function setup() {
    return PromiseA.resolve();
  }

  function teardown() {
    return PromiseA.resolve();
  }

  function finalTeardown() {
    return PromiseA.resolve();
  }

  tests = [
    function pass() {
      return PromiseA.resolve();
    }
  , function fail() {
      return PromiseA.reject();
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
