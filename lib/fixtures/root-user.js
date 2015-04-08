'use strict';

module.exports.create = function (ru, Auth) {
  var loginObj;

  loginObj = {
    type: 'local'
  , uid: ru.uid
  , salt: ru.salt
  , shadow: ru.shadow
  , hashtype: ru.hashtype
  , provider: 'local'
  };

  ru.login = ru.login || {};

  // TODO rename to findOrCreateById
  return Auth.Logins.login(loginObj).then(function (login) {
    login.set('uid', ru.uid);
    login.set('salt', ru.salt);
    login.set('shadow', ru.shadow);
    login.set('hashtype', ru.hashtype);

    Object.keys(ru.login).forEach(function (k) {
      login.set(k, ru.login[k]);
    });

    if (login.hasChanged()) {
      return login.save();
    }

    return login;
  }).then(function (login) {
    // Find existing account first
    if (login.related('accounts').length) {
      console.log('[root] has account');
      return login;
    }

    console.log('[root-user] creating account...');
    return Auth.Accounts.create(ru.account || { role: 'root' }).then(function ($account) {
      console.log('[root-user] linking account...');
      return Auth.Logins.linkAccounts(login, [$account]).then(function () {
        console.log('[root-user] setting primary account...');
        return Auth.Logins.setPrimaryAccount(login, $account).then(function () {
          console.log('[root-user] created account');
          console.log("[root-user] login.get('primaryAccountId')", login.get('primaryAccountId'));
          console.log("[root-user] login.related('accounts').length", login.related('accounts').length);
          return login;
        });
      });
    });
  }).then(function () {
    console.log('[root-user] ensured login and account for \'' + ru.uid + '\'');
  }, function (err) {
    console.error('[ERROR] [root-user]');
    console.error(err);
  });
};
