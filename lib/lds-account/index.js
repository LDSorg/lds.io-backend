'use strict';

var PromiseA = require('bluebird').Promise;
var path = require('path');
var fs = PromiseA.promisifyAll(require('fs'));
var config = require('./config');
var passthru = require('./passthru-client').create(config);
var request = require('request');
var requestAsync = PromiseA.promisify(request);
var localLdsMobileApi = path.join(__dirname, 'api-endpoints.json');
var ldsMobileApiUrl = 'https://tech.lds.org/mobile/ldstools/config.json';
var mapSearchUrl = "https://www.lds.org/maps/services/search?query=%@&lang=eng";
var mapResultDetailsUrl = "https://www.lds.org/maps/services/layers/details?id=%@&layer=%@&lang=eng";
var ldsMobileApi;
/*
var cache = {};
var clearer;

function clearCache() {
  if (clearer) {
    return;
  }

  return setTimeout(function () {
    var now = Date.now();

    Object.keys(cache).forEach(function (key) {
      var data = cache[key];
      var fresh = data && (now - data.updatedAt < (60 * 1000));
      if (!fresh) {
        delete cache[key];
      }
    });

    if (Object.keys(cache).length) {
      clearTimeout(clearer);
      clearer = clearCache();
    } else {
      clearTimeout(clearer);
      clearer = null;
    }
  }, 10 * 1000);
}

function addToCache(id, data) {
  cache[id] = {
    data: data
  , updatedAt: Date.now()
  };
  clearCache();
}

function getFromCache(id) {
  var data = cache[id];
  if (!data) {
    return;
  }

  data.accessedAt = Date.now();

  return data.data;
}
*/

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
        var url;

        listing.some(function (item) {
          if (item.id && item.id.toString() === units.ward.id.toString()) {
            type = item.type;
            return true;
          }
        });

        if (!type) {
          return null;
        }

        units.ward.type = type;
        url = "https://www.lds.org/maps/services/layers/details?id=%@&layer=%@&lang=eng"
            .replace(/%@/, encodeURIComponent(units.ward.id))
            .replace(/%@/, encodeURIComponent(units.ward.type))
            ;
        return requestAsync({
          url: url 
        , gzip: true
        }).spread(function (resp, body) {
          try {
            results.meetinghouse = JSON.parse(body);
          } catch(e) {
            results.meetinghouse = { error: { message: "could not load meetinghouse from map" } };
          }
        });
      })
    , requestAsync({
        url: "https://www.lds.org/maps/services/search?query=%@&lang=eng"
          .replace(/%@/, encodeURIComponent(units.stake.name.split(/\s+/).shift() + ' ' + units.stake.id))
      , gzip: true
      }).spread(function (resp, body) {
        var listing = JSON.parse(body);
        var type;
        var url;

        listing.some(function (item) {
          if (item.id && (item.id.toString() === units.stake.id.toString())) {
            type = item.type;
            return true;
          }
        });

        if (!type) {
          return null;
        }

        units.stake.type = type;
        url = "https://www.lds.org/maps/services/layers/details?id=%@&layer=%@&lang=eng"
            .replace(/%@/, encodeURIComponent(units.stake.id))
            .replace(/%@/, encodeURIComponent(units.stake.type))
            ;
        return requestAsync({
          url: url
        , gzip: true
        }).spread(function (resp, body) {
          try {
            results.stakecenter = JSON.parse(body);
          } catch(e) {
            results.stakecenter = { error: { message: "could not load stakecenter map" } };
          }
        });
      })
    ]);
  }).then(function () {
    var profile = require('./basic').getDirectory(results.user, results.ward);
    Object.keys(profile).forEach(function (key) {
      results[key] = profile[key];
    });

    // { me: ..., callings: ..., stakesWithCalling: ..., wardsWithCalling: ..., leaders: ..., individuals: ..., homes: ...
    // , token: session.token, jar: session.jar, user: user, ward: ward };
    return results;
  });
}

function check(opts) {
  return passthru(opts).then(function (body) {
    if (body.error) {
      return PromiseA.reject(body.error);
    }

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

function callApi(thingy) {
  var opts = {
    //url: 'https://www.lds.org/directory/services/ludrs/mem/current-user-info/'
    url: thingy.url
  , gzip: true
  , encoding: 'utf8'
  };

  if (thingy.jar) {
    opts.jar = require('jarson').fromJSON(thingy.jar);
  }

  return requestAsync(opts).spread(function (resp, body) {
    if ((!body || !body.length) && opts.nullOnEmpty) {
      return null;
    }

    try {
      return JSON.parse(body);
    } catch(e) {
      if (opts.jar) {
        return PromiseA.reject(new Error("could not parse result (session may have expired and returned html in redirect)"));
      } else {
        return PromiseA.reject(new Error("could not parse result (might be an lds.org error)"));
      }
    }
  });
}

function run(secrets) {
  return checkUserPass(secrets.username, secrets.password).then(function (body) {
    return testSession(body).then(function (session) {
      return session;
    });
  });
}

function getNewSession(token) {
  return passthru({ token: token }).then(function (body) {
    if (body.error) {
      return PromiseA.reject(body.error);
    }

    if (!body.jar) {
      return PromiseA.reject(new Error("bad credentials (token)"));
    }

    return body;
  });
}

module.exports.login = run;
module.exports.api = {};
module.exports.createSession = checkUserPass;
module.exports.refreshSession = getNewSession;
module.exports.callApi = callApi;

// This crazy wrapper automatically retries to exchange the token for a new session
// if the session is expired and hands the new session back to the caller with a  warning
function wrapApiWithRetry(api) {
  module.exports[api] = function () {
    var args = Array.prototype.slice.call(arguments);
    var ldsAccount = args[0];

    return getConfig().then(function (ldsMobileApi) {
      args.unshift(ldsMobileApi);

      function retry(opts, result, err) {
        if (opts.tried) {
          console.error('[LDS CallAPI] Error: retry failed');
          console.error(typeof result);
          console.error(result);
          console.error(err);
          return PromiseA.reject(err || new Error("[ERROR] LDS CallAPI retry failed"));
          //new Error("login expired and cannot be renewed with token (new login required)"));
        }
        return getNewSession(ldsAccount.token).then(function (session) {
          if (session.token) {
            ldsAccount.token = session.token;
          }

          ldsAccount.jar = session.jar;
          return makeRequest({ tried: true });
        });
      }

      function makeRequest(opts) {
        args[1] = ldsAccount.jar;
        return module.exports.api[api].apply(null, args).then(function (result) {
          if ('object' !== typeof result) {
            return retry(opts, result);
          }

          // TODO check session staleness
          return {
            result: result
          , jar: ldsAccount.jar
          , token: ldsAccount.token
          , warning: opts.tried && { message: "login expired and was renewed with token" }
          };
        }).error(function (err) {
          if (/session/.test(err.message)) {
            return retry(opts, null, err);
          }

          return PromiseA.reject(err);
        }).catch(function (err) {
          // TODO more specific error test (maybe a code like 'E_SESSION_EXPIRED'?)
          if (/session/.test(err.message)) {
            return retry(opts);
          }

          throw err;
        });
      }

      return makeRequest({ tried: false });
    });
  };
}

function callApiBinary(thingy) {
  var opts = {
    //url: 'https://www.lds.org/directory/services/ludrs/mem/current-user-info/'
    url: thingy.url
  , encoding: null
  };

  /*
  if (!thiny.binary) {
    opts.gzip = true;
  }
  */

  if (thingy.jar) {
    opts.jar = require('jarson').fromJSON(thingy.jar);
  }

  return requestAsync(opts).spread(function (resp, body) {
    if (!body || !body.length) {
      return null;
    }

    return body;
  });
}

function getOrganizationUrls(wardId) {
  var organizationUrl = "https://www.lds.org/directory/services/ludrs/1.1/unit/roster/%@/%@";
  var urls = [];

  [ "HIGH_PRIEST"
  , "ELDER"
  , "RELIEF_SOCIETY"
  , "PRIEST"
  , "TEACHER"
  , "DEACON"
  , "LAUREL"
  , "MIA_MAID"
  , "BEEHIVE"
  , "ADULTS"
  ].forEach(function (orgname) {
    urls.push({
      name: orgname.toLowerCase()
    , url: organizationUrl.replace(/%@/, wardId).replace(/%@/, orgname)
    });
  });

  return urls;
}

function getUnit(ldsMobileApi, jar, unitType, unitName, unitId/*, opts*/) {
  if (!unitType) {
    return PromiseA.reject(new Error("missing unitType"));
  }
  /*
  if (!unitName) {
    return PromiseA.reject(new Error("missing unitName"));
  }
  */
  if (!unitId) {
    return PromiseA.reject(new Error("missing unitName"));
  }
  // TODO cache

  var unit  = {};
  var unitSearchUrl = mapSearchUrl
    .replace(/%@/, encodeURIComponent((unitName||'').split(/\s+/).shift() + ' ' + unitId))
    ;
  var orgs = {}; 
  var promises;
  
  if ('ward' === unitType) {
    promises = getOrganizationUrls(unitId).map(function (meta) {
      return callApi({
        url: meta.url
      , jar: jar
      }).then(function (data) {
        orgs[meta.name] = data;
      });
    });
  } else {
    promises = [];
  }

  return PromiseA.all(promises.concat([
    callApi({
      url: ldsMobileApi['unit-members-and-callings-v2'].replace(/%@/, unitId)
    , jar: jar
    }).then(function (body) {
      unit.unit = body;

      /* TODO

      // batch out in groups of 50
      var sorted = require('./basic').getIndividualIds(ward.ward);
      var sorted = require('./basic').getHomeIds(ward.ward);
      var individualPhotoUrl = ldsMobileApi['photo-url']
            .replace(/%@/, encodeURIComponent(individualIds.join(',')))
            .replace(/%@/, 'individual')
            ;
      var householdPhotoUrl = ldsMobileApi['photo-url']
            .replace(/%@/, encodeURIComponent(homeIds.join(',')))
            .replace(/%@/, 'household')
            ;
      , callApi({
          url: individualPhotoUrl 
        , jar: jar
        }).then(function (photo) {
          addPhoto(photo, 'individual');
        }).catch(function (err) {
          // ignore missing photo
        })

     */
    })
  , callApi({
      url: unitSearchUrl 
    }).then(function (listing) {
      var layerType;
      var url;

      listing.some(function (item) {
        if (item.id && item.id.toString() === unitId.toString()) {
          layerType = item.type;
          return true;
        }
      });

      if (!layerType) {
        return null;
      }

      url = mapResultDetailsUrl 
        .replace(/%@/, encodeURIComponent(unitId))
        .replace(/%@/, encodeURIComponent(layerType))
        ;

      return callApi({
        url: url
      }).then(function (body) {
        unit.meetinghouse = body || {};
      }).catch(function (/*e*/) {
        unit.meetinghouse = { error: { message: "could not load meetinghouse map" } };
      });
    })
  ])).then(function () {
    var utils = require('./basic');
    var sorted = utils.getWard(unit.unit);
    var orgsMaps = {};

    if ('ward' === unitType) {
      // TODO merge in birthdays
      Object.keys(orgs).forEach(function (_orgname) {
        var orgname = _orgname.replace(/_/g, '');
        if (!orgsMaps[orgname]) {
          orgsMaps[orgname] = {};
        }

        orgs[_orgname].forEach(function (om) {
          orgsMaps[orgname][om.individualId] = om;
        });
      });
    }

    sorted.members.forEach(function (m) {
      m.callings = [];
      utils.getCallings({ id: unitId, type: unitType }, unit.unit.callings, m.id, [], m.callings);
      m.callings.forEach(function (c) {
        // TODO create a function to merge calling list with individual to create heirarchy
        c.heirarchy = undefined;
      });
      if ('ward' === unitType) {
        Object.keys(orgsMaps).forEach(function (orgname) {
          if (orgsMaps[orgname][m.id]) {
            if ('adults' === orgname) {
              orgname = 'adult';
            }
            m[orgname] = true;
          }
        });
      }
    });

    return {
      // TODO organization (elder, rs, priest)
      fake: false
    , leaders: sorted.leaders
    , members: sorted.members
    //, membersMap: sorted.membersMap
    , homes: sorted.homes
    //, homesMap: sorted.homesMap
    , callings: sorted.callings
    //, callingsMap: sorted.callingsMap
    //, organizations: orgs
    };
  });
}

function getUnitPhotos(ldsMobileApi, jar, unitId/*, opts*/) {
  return callApi({
    url: ldsMobileApi['unit-members-and-callings-v2'].replace(/%@/, unitId)
  , jar: jar
  }).then(function (unit) {
    // batch out in groups of 50
    var utils = require('./basic');
    var iids = utils.getIndividualIds(unit);
    var hids = utils.getHomeIds(unit);
    var promises = [];
    var results = { members: [], families: [] };

    var individualPhotoUrls = utils.buildPhotoUrls(ldsMobileApi['photo-url'], iids, 'individual', 50, []);
    var householdPhotoUrls = utils.buildPhotoUrls(ldsMobileApi['photo-url'], hids, 'household', 50, []);

    function addPhotos(photos) {
      if ('object' !== typeof photos) {
        console.error('[ERROR] mass photo fail');
        console.error(photos);
        return;
      }
      
      // a single photo is not returned in an array :-/
      if (!Array.isArray(photos)) {
        photos = [photos];
      }

      photos.forEach(function (photo) {
        var collection;
        var type;

        if (!photo || !(photo.originalUri || photo.thumbnailUri || photo.mediumUri || photo.largeUri)) {
          return;
        }

        if (/individual/i.test(photo.photoType)) {
          collection = results.members;
          type = 'member';
        } else {
          collection = results.families;
          type = 'family';
        }

        collection.push({
          id: photo.individualId
        , approved: photo.available
        , updatedAt: photo.submittedDate
        , type: type
        });
      });
    }

    individualPhotoUrls.forEach(function (photoUrl) {
      promises.push(callApi({
        url: photoUrl
      , jar: jar
      }).then(addPhotos).catch(function (err) {
        console.error('[INVIDIDUAL PHOTOS ERR]');
        console.error(err);
        // ignore
      }));
    });

    householdPhotoUrls.forEach(function (photoUrl) {
      promises.push(callApi({
        url: photoUrl
      , jar: jar
      }).then(addPhotos).catch(function (err) {
        console.error('[HOUSEHOLD PHOTOS ERR]');
        console.error(err);
        // ignore
      }));
    });

    return PromiseA.all(promises).then(function () {
      return results;
    });
  });
}

//
//
// Wrappable API
//
//

module.exports.api.ward = function (ldsMobileApi, jar, wardName, wardId, opts) {
  return getUnit(ldsMobileApi, jar, 'ward', wardName, wardId, opts);
};

module.exports.api.stake = function (ldsMobileApi, jar, stakeName, stakeId, opts) {
  return getUnit(ldsMobileApi, jar, 'stake', stakeName, stakeId, opts);
};

module.exports.api.stakePhotos = function (ldsMobileApi, jar, stakeId, opts) {
  return getUnitPhotos(ldsMobileApi, jar, stakeId, opts);
};
module.exports.api.wardPhotos = function (ldsMobileApi, jar, wardId, opts) {
  return getUnitPhotos(ldsMobileApi, jar, wardId, opts);
};

module.exports.api.photo = function (ldsMobileApi, jar, id, type, size/*, opts*/) {
  if (!size) {
    size = 'original';
  }

  if ('member' === type) {
    type = 'individual';
  }
  if ('family' === type) {
    type = 'household';
  }

  var url =  ldsMobileApi['photo-url']
    .replace(/%@/, encodeURIComponent(id))
    .replace(/%@/, type)
    ;

  return callApi({
    jar: jar
  , url: url
  , nullOnEmpty: true
  }).then(function (json) {
    if (!json) {
      return PromiseA.reject(new Error("invalid photo query"));
      //return null;
    }

    var sizeUrl = json[size + 'Uri'];
    // sizeUrl is in the format of /bcs/content?token=...

    if (!sizeUrl) {
      return PromiseA.reject(new Error("could not get valid photo uri '"
        + encodeURIComponent(type + '-' + size + '-' + size) + "'"));
    }

    return callApiBinary({
      jar: jar
    , url: 'https://www.lds.org' + sizeUrl
    });
  });
};

module.exports.api.profile = function (ldsMobileApi, jar/*, opts*/) {
  var results = { photos: [] };

  return callApi({
    jar: jar
  , url: ldsMobileApi['current-user-detail']
  }).then(function (body) {
    results.user = body;
  }).then(function () {
    // TODO look for profile in a cache

    var units = require('./basic').getDetails(results.user);
    var stakeSearchUrl = mapSearchUrl 
          .replace(/%@/, encodeURIComponent(units.stake.name.split(/\s+/).shift() + ' ' + units.stake.id))
          ;
    var wardSearchUrl = mapSearchUrl
          .replace(/%@/, encodeURIComponent(units.ward.name.split(/\s+/).shift() + ' ' + units.ward.id))
          ;
    var individualPhotoUrl = ldsMobileApi['photo-url']
          .replace(/%@/, encodeURIComponent(results.user.individualId))
          .replace(/%@/, 'individual')
          ;
    var householdPhotoUrl = ldsMobileApi['photo-url']
          .replace(/%@/, encodeURIComponent(results.user.individualId))
          .replace(/%@/, 'household')
          ;

    function addPhoto(photo, type) {
      if (!photo || !(photo.originalUri || photo.thumbnailUri || photo.mediumUri || photo.largeUri)) {
        return;
      }

      results.photos.push({
        approved: photo.available
      , updatedAt: photo.submittedDate
      , type: type
      //, optedOut: photo.optedOut
      //, large: '500x375'
      //, medium: '200x150'
      //, thumbnail: '40x40'
      });
    }

    return PromiseA.all([
      callApi({
        url: ldsMobileApi['unit-members-and-callings-v2'].replace(/%@/, results.user.homeUnitNbr)
      , jar: jar
      }).then(function (body) {
        results.ward = body;
      })
    , callApi({
      url: individualPhotoUrl 
      , jar: jar
      }).then(function (photo) {
        addPhoto(photo, 'member');
      }).catch(function (/*err*/) {
        // ignore missing photo
      })
    , callApi({
        url: householdPhotoUrl 
      , jar: jar
      }).then(function (photo) {
        addPhoto(photo, 'family');
      }).catch(function (/*err*/) {
        // ignore missing photo
      })
    , callApi({
        url: wardSearchUrl 
      }).then(function (listing) {
        var type;
        var url;

        listing.some(function (item) {
          if (item.id && item.id.toString() === units.ward.id.toString()) {
            type = item.type;
            return true;
          }
        });

        if (!type) {
          return null;
        }

        units.ward.type = type;
        url = mapResultDetailsUrl 
                .replace(/%@/, encodeURIComponent(units.ward.id))
                .replace(/%@/, encodeURIComponent(units.ward.type))
                ;

        return callApi({
          url: url
        }).then(function (body) {
          results.meetinghouse = body;
        }).catch(function (/*e*/) {
          results.meetinghouse = { error: { message: "could not load meetinghouse map" } };
        });
      })
    , callApi({
        url: stakeSearchUrl
      }).then(function (listing) {
        var type;
        var url;

        listing.some(function (item) {
          if (item.id && (item.id.toString() === units.stake.id.toString())) {
            type = item.type;
            return true;
          }
        });

        if (!type) {
          return null;
        }

        units.stake.type = type;
        url = mapResultDetailsUrl
                .replace(/%@/, encodeURIComponent(units.stake.id))
                .replace(/%@/, encodeURIComponent(units.stake.type))
                ;

        return callApi({
          url: url 
        }).then(function (stakecenter) {
          results.stakecenter = stakecenter;
        }).catch(function (/*e*/) {
          results.stakecenter = { error: { message: "could not load stakecenter map" } };
        });
      })
    ]);
  }).then(function () {
    var utils = require('./basic');
    var profile = utils.getDirectory(results.user, results.ward);
    // { me: ..., callings: ..., stakes: ..., wards: ..., leaders: ..., individuals: ..., homes: ...
    // , home: ...
    // , token: session.token, jar: session.jar, user: user, ward: ward };
    var me = profile.me;
    var units = utils.getDetails(results.user);
    var stakes;

    Object.keys(profile).forEach(function (key) {
      results[key] = profile[key];
    });

    stakes = utils.getUserStakes(results.user);

    return {
      individualId: me.individualId || me.id
    , name: me.name
    // TODO displayName
    // TODO organization (elder, rs, priest)
    , guest: !!me.guest
    , givennames: me.givennames
    , surnames: me.surnames
    , phones: me.phones
    , emails: me.emails
    , home: me.home
    , photos: results.photos
    , stakes: stakes 

    // TODO area
    , homeWardId: units.ward.id
    , homeWardName: units.ward.name
    , homeStakeId: units.stake.id
    , homeStakeName: units.stake.name
    , callings: results.callings
    , wardsWithCalling: results.wardsWithCalling
    , stakesWithCalling: results.stakesWithCalling
    };
  });
};

// This must only be accessed by test tokens, not production tokens
module.exports.api.raw = function (ldsMobileApi, jar, url, params/*, opts*/) {
  if ('string' !== typeof url) {
    return PromiseA.reject(new Error('url argument must be a string'));
  }

  if (!Array.isArray(params)) {
    return PromiseA.reject(new Error('params argument must be an array'));
  }

  if (ldsMobileApi[url]) {
    url = ldsMobileApi[url];
  }

  url = 'https://' + url.replace(/^(https?|spdy):\/\//i, '');

  params.forEach(function (param) {
    // whitelist
    // %@ %d %.0f
    // %@ - character?
    // %d - integer?
    // %.0f - int with leading 0?
    //url = url.replace(/%(@|d|\.0f)/, encodeURIComponent(param));
    // work with any future templaces
    url = url.replace(/%[^\/\&\?\-]+/, encodeURIComponent(param));
  });
  // ldsMobileApi['unit-members-and-callings-v2'].replace(/%@/, results.user.homeUnitNbr)

  return callApi({
    url: url
  , jar: jar
  });
};

// Initialize API wrapper
Object.keys(module.exports.api).forEach(wrapApiWithRetry);
