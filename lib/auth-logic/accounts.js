'use strict';

var UUID = require('node-uuid')
  ;

/*
function logQuery(params) {
  console.log('[log] [accounts] sql');
  console.log(params);
}
*/

module.exports.create = function (DB) {
  var PromiseA = require('bluebird').Promise
    ;

  function Accounts() {
  }

  Accounts.create = function (stuff) {
    var account
      , uuid
      ;

    if (stuff.uuid) {
      return PromiseA.reject(new Error('uuids are assigned by the accounts, not by you'));
    }

    uuid = UUID.v4();
    //stuff.uuid = uuid;
    account = DB.Accounts.forge(stuff);

    return account/*.on('query', logQuery)*/.save({ uuid: uuid }, { method: 'insert' });
  };

  Accounts.get = function (uuid, opts) {
    if (Array.isArray(uuid)) {
      return Accounts.mget(uuid, opts);
    } else {
      return Accounts.mget([uuid], opts).then(function (accounts) {
        return accounts[0];
      });
    }
  };

  Accounts.mget = function (uuids, opts) {
    var accounts = []
      , ps = []
      ;

    if (0 === uuids.length) {
      return accounts;
    }

    uuids.forEach(function (uuid) {
      if ('string' !== typeof uuid) {
        // if the objects have already been retrieved as objects
        ps.push(uuid);
        return;
      }

      ps.push(DB.Accounts.forge({ id: uuid }).fetch(opts));
    });

    return PromiseA.all(ps);
  };

  Accounts.select = function (id, accounts) {
    var account
      ;

    accounts.some(function (a) {
      if (id === a.id || id === a.uuid) {
        account = a;
        return true;
      }
    });

    return account;
  };

  return Accounts;
};
