'use strict';

var Cache = require('ldsorg/cache').LdsOrgCache
  , LdsOrg = require('ldsorg').LdsOrg
  , path = require('path')
  , secretutils = require('secret-utils')
  ;

module.exports.create = function (Logins) {
  // TODO rip this out into a completely separate service great with crytographic security
  //
  // The "authenticator" will accept public-key encrypted passwords on create or "bitcrypt"-arbitrated tokens on login
  // "bitcrypt" will store the encrypted password, encrypted yet again with an off-disk key
  // both the authenticator and the bitcrypt will have key-only passphrased encryption and
  // the data encryption keys will be stored on two separate 3rd party systems (such as a phone and laptop)
  // which do not have ssh access to the authenticator or bitcrypt
  // in this way at least 3 systems would have to be physically compromised in order to retrieve
  // the password and 2 systems would have to be physically compromised to use it by proxy

  var secrets = {}
    ;

  function LdsLogin() {
  }
  LdsLogin.login = function (auth) {
    var badsalt = secretutils.url64(32)
      , token = secretutils.md5sum(badsalt + ':' + auth.uid + ':' + auth.secret)
      ;

    if (secrets[token]) {
      return Logins.login(secrets[token].logindata);
    }

    return new Promise(function (resolve, reject) {
      var ldsorg
        ;

      ldsorg = LdsOrg.create({
        node: true
      , Cache: Cache
      , cacheOpts: { cacheDir: path.join(__dirname, '..', 'data') }
      , prefetch: true
      // TODO authenticated abstracted object with get / post / getImage
      });

      // TODO don't store password unencrypted, even in memory
      ldsorg.signin(
        function (err) {
          console.log('[signin] complete');
          if (err) {
            if (/username|password/.test(err.message)) {
              // NOTE: we're not rendering the jade file, so this message does nothing
              // instead it's handled via a hash/anchor in the failureRedirect
              resolve(null); // , false, { message: 'Invalid Username or Password' });
              return;
            }
            reject(err);
            return;
          }

          ldsorg.init(function (data) {
            var serializableUser
              ;
 
            serializableUser = {
              username: auth.uid
            , password: auth.secret
            , meta: data
            , ldsorg: ldsorg
            , id: data.currentUserId
            , authenticatedAt: Date.now()
            };
            resolve(serializableUser);
          }, null);
        }
      , { username: auth.uid, password: auth.secret }
      );
    }).then(function (ldsprofile) {
      var logindata
        ;

      if (!ldsprofile) {
        return null;
      }

      logindata = {
        uid: ldsprofile.id
      , token: token, authenticatedAt: Date.now()
      , public: ldsprofile.meta
      };

      secrets[token] = {
        ldsorg: ldsprofile.ldsorg
      , username: auth.uid
      , password: auth.secret
      , logindata: logindata
      };

      // TODO make sure that this login replaces the old data
      return Logins.login(logindata);
    });
  };

  return LdsLogin;
};
