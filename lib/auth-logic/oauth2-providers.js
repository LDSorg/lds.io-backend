'use strict';

module.exports.create = function (DB, Logins) {
  function Oauth2Login() {
  }
  Oauth2Login.loginOrCreate = function (user) {
    var profile = user.profile || user.public;
    var uid = profile.provider + ':' + (profile.appScopedId || profile.uid || profile.id);

    // The default behaviour is to try to login
    // and create an account if the user does not exist
    return Logins.login({ uid: uid }).then(function ($login) {
      $login.set('profile', user.profile||user.public);
      $login.set('accessToken', user.accessToken);
      $login.set('refreshToken', user.refreshToken);
      $login.set('ts', Date.now());

      return $login.save().then(function ($login) {
        return $login;
      });
    });
  };
  Oauth2Login.create = Oauth2Login.loginOrCreate;

  return Oauth2Login;
};
