'use strict';

function init(/*config, DB*/) {
  var PromiseA = require('bluebird').Promise
    , tests
    ;

  function setup() {
    return PromiseA.resolve();
  }

  function teardown() {
    return PromiseA.resolve();
  }

  var validate = require('../lib/st-validate').validate
    , schema
    ;

  schema = {
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
      'urls': ['']
    , 'ips': ['']
    , 'testers': []
    , 'desc': ''
    , 'expiresAt': new Date()
    }]
  };

  tests = [
    function unrecognizedRestrictedThrows() {
      return validate(schema, {
        name: 'Awesome thing'
      , insecure: true
      , keywords: ["awesome", "thing"]
      , apikeys: [{
          urls: ['http://example.com/api/test']
        , desc: 'something pretty cool'
        , expiresAt: '2014-06-16T12:00:00.000Z'
        }]
      }, ['name']).then(function () {
        throw new Error("Should have thrown error");
      }).catch(function (err) {
        if (/name/.test(err.message)) {
          throw new Error("Should not have had error on 'name'");
        }

        if (!/not recognized or not allowed/.test(err.message)) {
          throw new Error("Wrong error: " + err.message);
        }
      });
    }

  , function unrecognizedKeyThrows() {
      return validate(schema, {
        name: 'Awesome thing'
      , insecure: true
      , keywards: ["awesome", "thing"]
      , apikeys: [{
          urls: ['http://example.com/api/test']
        , desc: 'something pretty cool'
        , expiresAt: '2014-06-16T12:00:00.000Z'
        }]
      }).then(function () {
        throw new Error("Should have thrown error about typo on keywords/keywards");
      }).catch(function (err) {
        if (!/keywards.*not recognized/.test(err.message)) {
          throw err; //new Error("Should have had error on 'keywards'");
        }
      });
    }

  , function unrecognizedNestedKeyThrows() {
      return validate(schema, {
        name: 'Awesome thing'
      , insecure: true
      , keywords: ["awesome", "thing"]
      , apikeys: [{
          orls: ['http://example.com/api/test']
        , desc: 'something pretty cool'
        , expiresAt: '2014-06-16T12:00:00.000Z'
        }]
      }).then(function () {
        throw new Error("Should have thrown error about typo on orls/urls");
      }).catch(function (err) {
        if (!/orls.*not recognized/.test(err.message)) {
          throw err; //new Error("Should have had error on 'orls'");
        }
      });
    }

  , function incorrectValueThrows() {
      return validate(schema, {
        name: 'Awesome thing'
      , insecure: 1
      , keywords: ["awesome", "thing"]
      , apikeys: [{
          urls: ['http://example.com/api/test']
        , desc: 'something pretty cool'
        , expiresAt: '2014-06-16T12:00:00.000Z'
        }]
      }).then(function () {
        throw new Error("Should have thrown type error about insecure = 1");
      }).catch(function (err) {
        if (!/insecure.*not validate/.test(err.message)) {
          throw err; //new Error("Should have had error on 'insecure'");
        }
      });
    }

  , function incorrectNestedValueThrows() {
      return validate(schema, {
        name: 'Awesome thing'
      , insecure: true
      , keywords: ["awesome", "thing"]
      , apikeys: [{
          urls: 1
        , desc: 'something pretty cool'
        , expiresAt: '2014-06-16T12:00:00.000Z'
        }]
      }).then(function () {
        throw new Error("Should have thrown type error about urls = 1");
      }).catch(function (err) {
        if (!/urls.*not validate/.test(err.message)) {
          throw err; //new Error("Should have had error on 'urls'");
        }
      });
    }

  , function correctKeysAndValuesPass() {
      return validate(schema, {
        name: 'Awesome thing'
      , insecure: true
      , keywords: ["awesome", "thing"]
      , apikeys: [{
          urls: []
        , desc: 'something pretty cool'
        , expiresAt: '2014-06-16T12:00:00.000Z'
        }]
      });
    }

  , function incorrectDeeplyNestedValueThrows() {
      return validate(schema, {
        name: 'Awesome thing'
      , insecure: true
      , keywords: ["awesome", "thing"]
      , apikeys: [{
          urls: [1]
        , desc: 'something pretty cool'
        , expiresAt: '2014-06-16T12:00:00.000Z'
        }]
      }).then(function () {
        throw new Error("Should have thrown type error about urls = 1");
      }).catch(function (err) {
        if (!/urls.*not validate/.test(err.message)) {
          throw err; //new Error("Should have had error on 'urls'");
        }
      });
    }
  ];

  return {
    tests: tests
  , setup: setup
  , teardown: teardown
  };
}

module.exports.init = init;

if (require.main === module) {
  require('../tester').create(__filename);
}
