'use strict';

var PromiseA = require('bluebird').Promise;
var fs = PromiseA.promisifyAll(require('fs'));
var path = require('path');
var ldsAccount = require('./index');
var secretsPath = path.join(process.cwd(), process.argv[2]);
var secretsSession = secretsPath + '.session.json';
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
} else if (secrets.accessToken) {
  var config;
  var configFile = path.join(__dirname, '..', '..', 'priv', 'config.json');
  config = require(configFile);
  // TODO setup should attach sql passphrase for this db
  config.knexInst = require('../knex-connector').create(config.knex);
  promise = require('../../bookcase/bookshelf-models').create(config, config.knexInst).then(function (Db) {
    var Auth = require('../auth-logic').create(Db, config);
    return Auth.AccessTokens.login(secrets.accessToken).then(function ($token) {
      var token;

      $token.$login.related('accounts').some(function ($account) {
        token = $account.get('token');
        if (token) {
          return true;
        }
      });

      if (!token) {
        return PromiseA.reject(new Error("couldn't get a token in inspect"));
      }

      return ldsAccount.refreshSession(token);
    });
  });
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
      console.log('profile.result.homeWardId');
      console.log(profile.result.homeWardId);
      console.log('profile.result.homeStakeId');
      console.log(profile.result.homeStakeId);

      fs.writeFileSync('profile.json', JSON.stringify(profile, null, '  '), 'utf8');
      setTimeout(function () {
        process.exit();
      }, 100);
      return;


      return ldsAccount.raw(session, 'unit-members-and-callings-v2', [profile.result.homeWardId]).then(function (data) {
        console.log('writing to debug.json in the current directory');
        fs.writeFileSync('debug.json', JSON.stringify(data.result, null, '  '), 'utf8');
        setTimeout(function () {
          process.exit();
        }, 100);
      });

      /*
      ldsAccount.wardPhotos(session, profile.result.homeWardId).then(function (ward) {
        console.log(ward);
        console.log(ward.result.members.length);
        console.log(ward.result.families.length);
      });
      */

      /*
      ldsAccount.ward(session, profile.result.homeWardName || 'Provo', profile.result.homeWardId).then(function (ward) {
        console.log('ward');
        console.log(ward);
      });
      */
    });
  });
}).error(function (err) {
  console.error('(Probably) Invalid Credentials');
  console.error(err);
}).catch(function (err) {
  console.error('(Probably) Unhandled Error');
  console.error(err);
  throw err;
});
