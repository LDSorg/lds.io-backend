  /*


  , request = require('request')
function formatProfile(token, profile) {
  return {
    type: profile.provider || 'local'
  , uid: profile.id
  , public: profile
  , accessToken: token
  //, refreshToken: refreshToken
  };
}




   *
    if (users[token]) {
      done(null, formatProfile(token, users[token]));
      return;
    }

    , users = {}
    , fakeProfileUrl = 'http://randomuser.coolaj86.com/api/?randomapi'
    request.get(fakeProfileUrl, function (err, xreq, data) {
      var profile = JSON.parse(data).results[0]
        , user = profile.user
        ;

      user.name = profile.user.name.first + ' ' + profile.user.name.last[0];
      user.id = profile.seed;
      user.test = true;

      if (/test-.*(admin)/i.test(token)) {
        // can read and write privileged things
        user.test = true;
        user.role = 'admin';
      } else if (/test-.*(president)/i.test(token)) {
        // can read privileged things, but no write access
        user.test = true;
        user.role = 'president';
      } else if (/test-.*(user)/i.test(token)) {
        // can read and write
        user.test = true;
        user.role = 'user';
      } else if (/test-.*(guest)/i.test(token)) {
        // can read public stuff
        user.test = true;
        user.role = 'guest';
      }

      users[user.id] = user;
      users[token] = user;
      // TODO users[id+':'+'secret] = user;
      
      done(null, formatProfile(token, user));
    });
  */
