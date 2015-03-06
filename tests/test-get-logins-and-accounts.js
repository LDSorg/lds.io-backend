'use strict';

module.exports.run = function (Db) {
  var mocks = {}
    , Logins = require('./logins').create(Db)
    ;

  // I login with facebook
  function loginWithFacebook(profile) {
    // TODO public / private profile info
    var loginObj = { public: profile }
      ;

    loginObj.type = 'facebook';
    loginObj.uid = loginObj.public.id;

    // TODO every login needs a mergeUpdates hook
    return Logins.login(loginObj);
  }

  // I login with twitter
  function loginWithTwitter(profile) {
    // TODO public / private profile info
    var loginObj = { public: profile }
      ;

    loginObj.type = 'twitter';
    loginObj.uid = loginObj.public.id;

    // TODO every login needs a mergeUpdates hook
    return Logins.login(loginObj);
  }

  mocks.fbProfile = require('./profile.fb.json');
  mocks.twProfile = require('./profile.tw.json');

  // I log in with facebook
  loginWithFacebook(mocks.fbProfile).then(function (fbLogin) {
    console.log("[fb] login.related('accounts')");
    console.log(fbLogin.related('accounts').length);
    loginWithTwitter(mocks.twProfile).then(function (twLogin) {
      console.log("[tw] login.related('accounts')");
      console.log(twLogin.related('accounts').length);
    });
  });
};
