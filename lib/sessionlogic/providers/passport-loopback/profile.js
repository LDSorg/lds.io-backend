'use strict';

var recase = require('recase').Recase.create({ exceptions: {} })
  ;

module.exports.parse = function (json) {
  var profile = {}
    , account
    ;

  json = recase.camelCopy(json);
  console.log('[passport-loopback] json');
  console.log(json);
  json.accounts.forEach(function (acc) {
    if (json.selectedAccountId === (acc.id || acc.uuid)) {
      account = acc;
    }
  });

  profile.id = account.id;
  profile.displayName = account.name || account.displayName || account.email.replace(/@.*/, '');
  profile.createdAt = account.createdAt;
  profile.updatedAt = account.updatedAt;

  return profile;
};
