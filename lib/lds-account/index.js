'use strict';

var PromiseA = require('bluebird').Promise;
var path = require('path');
var fs = PromiseA.promisifyAll(require('fs'));
var config = require('./config');
var passthru = require('./passthru-client').create(config);
var request = require('request');
var requestAsync = PromiseA.promisify(request);
var localLdsMobileApi = path.join(__dirname, 'lds-config.json');
var ldsMobileApiUrl = 'https://tech.lds.org/mobile/ldstools/config.json';
var ldsMobileApi;

function getConfig() {
  if (ldsMobileApi) {
    return PromiseA.resolve(ldsMobileApi);
  }

  return requestAsync({ url: ldsMobileApiUrl }).spread(function (resp, body) {
    var json = JSON.parse(body);

    ldsMobileApi = json;

    if (json['auth-url']) {
      return fs.writeFileAsync(localLdsMobileApi, body, 'utf8');
    } else {
      return fs.readFileAsync(localLdsMobileApi, 'utf8').then(function (body) {
        ldsMobileApi = JSON.parse(body);
      });
    }
  }).then(function () {
    // TODO move mixed cases / dashes / underscores all to camelCase
    return ldsMobileApi;
  });
}

function testSession(session) {
  var results = {};
  var jarObj;

  return getConfig().then(function (/*ldsMobileApi*/) {
    var JarSON = require('jarson');
    jarObj = JarSON.fromJSON(session.jar);

    results.token = session.token;
    results.jar = session.jar;

    return requestAsync({
      //url: 'https://www.lds.org/directory/services/ludrs/mem/current-user-info/'
      url: ldsMobileApi['current-user-detail']
    , jar: jarObj
    , gzip: true
    }).spread(function (resp, body) {
      var user = JSON.parse(body);

      results.user = user;
    });
  }).then(function () {
    var units = require('./basic').getDetails(results.user);
    console.log('\n\n');
    console.log(units);
    console.log('\n\n');

    return PromiseA.all([
      requestAsync({
        url: ldsMobileApi['unit-members-and-callings-v2'].replace(/%@/, results.user.homeUnitNbr)
      , jar: jarObj
      , gzip: true
      }).spread(function (resp, body) {
        results.ward = JSON.parse(body);
      })
    , requestAsync({
        url: "https://www.lds.org/maps/services/search?query=%@&lang=eng"
          .replace(/%@/, encodeURIComponent(units.ward.name.split(/\s+/).shift() + ' ' + units.ward.id))
      , gzip: true
      }).spread(function (resp, body) {
        var listing = JSON.parse(body);
        var type;

        console.log(encodeURIComponent(units.ward.name + ' ' + units.ward.id));
        listing.some(function (item) {
          console.log('ward item');
          console.log(item);
          if (item.id && item.id.toString() === units.ward.id.toString()) {
            type = item.type;
            return true;
          }
        });

        if (!type) {
          return null;
        }

        units.ward.type = type;
        return requestAsync({
          url: "https://www.lds.org/maps/services/layers/details?id=%@&layer=%@&lang=eng"
            .replace(/%@/, encodeURIComponent(units.ward.id))
            .replace(/%@/, encodeURIComponent(units.ward.type))
        , gzip: true
        }).spread(function (resp, body) {
          console.log('meetinghouse', body);
          results.meetinghouse = JSON.parse(body);
        });
      })
    , requestAsync({
        url: "https://www.lds.org/maps/services/search?query=%@&lang=eng"
          .replace(/%@/, encodeURIComponent(units.stake.name.split(/\s+/).shift() + ' ' + units.stake.id))
      , gzip: true
      }).spread(function (resp, body) {
        var listing = JSON.parse(body);
        var type;

        listing.some(function (item) {
          console.log('stake item');
          console.log(item);
          if (item.id && (item.id.toString() === units.stake.id.toString())) {
            type = item.type;
            return true;
          }
        });

        if (!type) {
          return null;
        }

        units.stake.type = type;
        return requestAsync({
          url: "https://www.lds.org/maps/services/layers/details?id=%@&layer=%@&lang=eng"
            .replace(/%@/, encodeURIComponent(units.stake.id))
            .replace(/%@/, encodeURIComponent(units.stake.type))
        , gzip: true
        }).spread(function (resp, body) {
          console.log('stakecenter', body);
          results.stakecenter = JSON.parse(body);
        });
      })
    ]);
  }) 
  /*.then(function () {
    return requestAsync({
      url: ldsMobileApi['callings-with-dates'].replace(/%@/, results.user.homeUnitNbr)
    , jar: jarObj
    , gzip: true
    }).spread(function (resp, body) {
      console.log('callings-with-dates');
      console.log(body);
      try {
        var callings = JSON.parse(body);
        results.callings = callings;
      } catch(e) {
        results.callingsError = body;
      }
    });
  }).then(function () {
    return requestAsync({
      url: ldsMobileApi['membership-record'].replace(/%@/, results.user.individualId)
    , jar: jarObj
    , gzip: true
    }).spread(function (resp, body) {
      console.log('membership-record');
      console.log(body);
      try {
        var callings = JSON.parse(body);
        results.record = callings;
      } catch(e) {
        results.recordError = body;
      }
    });
  })*/.then(function () {
    var profile = require('./basic').getDirectory(results.user, results.ward);
    //console.log(Object.keys(profile));
    Object.keys(profile).forEach(function (key) {
      results[key] = profile[key];
    });

    // { me: ..., calling: ..., stakes: ..., wards: ..., leaders: ..., individuals: ..., homes: ...
    // , token: session.token, jar: session.jar, user: user, ward: ward };
    return results;
  });
}

function check(opts) {
  return passthru(opts).then(function (body) {
    if (body.error) {
      console.error('Error with login');
      console.error(body.error);
      return PromiseA.reject(body.error);
    }

    console.log(body);
    if (!body.jar) {
      return PromiseA.reject(new Error("bad credentials"));
    }

    return body;
  });
}

function checkUserPass(username, password) {
  return check({ username: username, password: password });
}

/*
function checkToken(token) {
  return check({ token: token });
}
*/

function run(secrets) {
  return checkUserPass(secrets.username, secrets.password).then(function (body) {
    return testSession(body).then(function (session) {
      return session;
    });
  })/*.then(function (body) {
    return checkToken(body.token).then(function (body) {
      return testSession(body.jar).then(function () {
        return body;
      });
    });
  })*/;
}

module.exports.login = run;
