'use strict';

var PromiseA = require('bluebird').Promise;
var fs = PromiseA.promisifyAll(require('fs'));
var path = require('path');
var ldsAccount = require('./index');
var secretsPath = path.join(process.cwd(), process.argv[2]);
var secretsSession = secretsPath + '.session.js';
var secrets = require(secretsPath);
var session;
var promise;

try {
  var session = require(secretsSession);
} catch(e) {
  // ignore
}

if (session && session.token) {
  promise = PromiseA.resolve(session);
} else if (secrets.username && secrets.passphrase) {
  promise = ldsAccount.createSession(secrets.username, secrets.passphrase);
} else {
  return PromiseA.reject(new Error("neither session.token nor secrets.username and secrets.passphrase"));
}

function saveSession(session) {
  return fs.writeFileAsync(secretsSession, JSON.stringify(session, null, '  '));
}

promise.then(function (session) {
  return saveSession(session).then(function () {
    var now1 = Date.now();
    return ldsAccount.profile(session).then(function (profile) {
      console.log('profile time', Date.now() - now1);

      console.log('[GET profile]');
      console.log(profile);

      ldsAccount.ward(session, profile.result.homeWardName || 'Provo', profile.result.homeWardId).then(function (ward) {
        console.log('ward');
        console.log(ward);
      });
    });
  });
}).error(function (err) {
  console.error('(Probably) Invalid Credentials');
  console.error(err);
}).catch(function (err) {
  console.error('(Probably) Unhandled Error');
  console.error(err);
});
