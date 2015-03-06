'use strict';

module.exports.run = function (Db) {
  var mocks = {}
    , Logins = require('./logins').create(Db)
    , Accounts = require('./accounts').create(Db)
    , LocalLogin = require('./locals').create(Logins)
    ;

  // See Story at https://github.com/coolaj86/angular-project-template/issues/8

  // I login with facebook
  function loginWithFacebook(profile) {
    // TODO public / private profile info
    var loginObj = { public: profile }
      ;

    loginObj.type = 'facebook';
    loginObj.uid = loginObj.public.id;

    // TODO every login needs a mergeUpdates hook
    return Logins.login(loginObj)
      .then(function (login) {
        var pub
          ;

        // Update profile with updated data
        pub = login.get('public') || {};
        loginObj.public = loginObj.public || {};
        Object.keys(loginObj.public).forEach(function (key) {
          pub[key] = loginObj.public[key];
        });
        login.set('public', pub);
        // TODO and oauth token, which is not in public

        if (!login.hasChanged()) {
          console.log('[fb] profile has not changed');
          return login;
        }

        console.log('[fb] profile updated:', login.changed);
        return login.save().then(function (savedLogin) {
          console.log('[fb] saved updates');
          return savedLogin;
        });
      });
  }

  // I login with twitter
  function loginWithTwitter(profile) {
    // TODO public / private profile info
    var loginObj = { public: profile }
      ;

    loginObj.type = 'twitter';
    loginObj.uid = loginObj.public.id;

    // TODO every login needs a mergeUpdates hook
    return Logins.login(loginObj)
      .then(function (login) {
        var pub
          ;

        // Update profile with updated data
        pub = login.get('public') || {};
        loginObj.public = loginObj.public || {};
        login.get('public');
        Object.keys(loginObj.public).forEach(function (key) {
          pub[key] = loginObj.public[key];
        });
        login.set('public', pub);
        // TODO and oauth token, which is not in public
        console.log(login.attributes);

        if (!login.hasChanged()) {
          console.log('[tw] profile has not changed');
          return login;
        }

        console.log('[tw] profile updated:', login.changed);
        return login.save().then(function (data) {
          console.log('[tw] saved updates');
          return data;
        });
      });
  }

  mocks.fbProfile = require('./profile.fb.json');
  mocks.twProfile = require('./profile.tw.json');

  // I log in with facebook
  loginWithFacebook(mocks.fbProfile).then(function (fbLogin) {
    console.log('logged in with facebook');

    if (fbLogin.related('accounts').length) {
      console.log('fbLogin has an account');
      return [fbLogin];
    }

    console.log('fbLogin does not have an account');

    // I don't have an account, so I create one
    return LocalLogin.create({ uid: 'coolaj86', secret: 'sauce123' }).then(function (localLogin) {
      var logins = [fbLogin, localLogin]
        ;

      // TODO we'll test which logins exist in the local session before we allow linking
      //console.log(fbLogin.toJSON());
      return Accounts.create({
        name: fbLogin.get('public').name.displayName
        // TODO sometimes a facebook account is unverified and therefore the email doesn't show up
      , email: fbLogin.get('public').emails[0].value
      }).then(function (account) {
        return Logins.linkAccounts(logins, [account])
          .then(function (/*TODO logins*/) {
            return Logins.setPrimaryAccount(logins, account).then(function () {
              logins.forEach(function (login, i) {
                console.log(i, login.related('accounts').length);
              });
              //throw new Error('something fishy');
              return logins;
            });
          });
      });
    });
  }).then(function () {

    console.log('[tw] login time');
    // I login some other time with new credentials (twitter)
    return loginWithTwitter(mocks.twProfile).then(function (twLogin) {
      console.log('[tw] got twLogin');
      // If the user has previous associated the account
      if (twLogin.related('accounts').length) {
        console.log('twLogin has an associated account');
        return [twLogin];
      }

      // If the user chooses to link with facebook
      console.log('[tw] needs to associate');
      return loginWithFacebook(mocks.fbProfile).then(function (fbLogin) {
        var account
          ;

        console.log('[tw] got fb login');
        // fbLogin.reset('accounts').load('accounts').then(function (login) { ... });
        fbLogin.related('accounts').some(function (_account) {
          if (_account.id === fbLogin.get('primaryAccountId')) {
            account = _account;
            return true;
          }
        });

        if (!account) {
          account = fbLogin.related('accounts')[0];
          // TODO set primary account
        }

        if (!account) {
          // TODO create account
          throw new Error('no associated account');
        }

        return twLogin.related('accounts').attach(account)
          .then(function () {
            console.log('[tw] associated');
            return [twLogin, fbLogin];
          });
      });
    });
  }).then(function (logins) {
    console.log('[fin] got a login with an account');
    var accountsMap = {}
      ;

    logins.forEach(function (login) {
      console.log('[fin] accounts in this login:', login.related('accounts').length);
      login.related('accounts').forEach(function (account) {
        accountsMap[account.id] = account;
      });
    });

    // I am now logged in and have associated accounts
    console.log({
      accounts: Object.keys(accountsMap).map(function (id) { return accountsMap[id].toJSON(); })
    , logins: logins.map(function (login) { return login.toJSON(); })
    });
  });
};
