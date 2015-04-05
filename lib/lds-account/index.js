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
  if (!unitName) {
    return PromiseA.reject(new Error("missing unitName"));
  }
  if (!unitId) {
    return PromiseA.reject(new Error("missing unitName"));
  }

  var unit;
  var meetinghouse;
  var orgs = {}; 
  var promises;
  
  // Stakes don't sort by organization
  // (and hence it is very difficult to determine gender of those filling stake callings)
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
      unit = body;
    })
  , module.exports.api.meetinghouse(ldsMobileApi, jar, unitName, unitId/*, opts*/).then(function (body) {
      meetinghouse = body;
    })
  ])).then(function () {
    var utils = require('./basic');
    var sorted = utils.getWard(unit);
    var orgsMaps = {};

    // can't remember what this does, but it looks like it
    // maps organizational names to member ids so that they
    // can be sorted in the next step
    if ('ward' === unitType) {
      // TODO merge in birthdays... from somewhere...
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

    // get calling info
    sorted.members.forEach(function (m) {
      //var heirarchy = [];
      m.callings = [];
      utils.getCallings({ id: unitId, type: unitType }, unit.callings, m.id, [], m.callings);
      m.callings.forEach(function (c) {
        // TODO create a function to merge calling list with individual to create heirarchy
        c.heirarchy = undefined;
      });

      // get elder, rs, priest, laurel, etc info
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
    , leaders: sorted.leaders // TODO move this to client
    , members: sorted.members
    //, membersMap: sorted.membersMap
    , homes: sorted.homes
    //, homesMap: sorted.homesMap
    , callings: sorted.callings
    //, callingsMap: sorted.callingsMap
    //, organizations: orgs
    , meetinghouse: meetinghouse
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

module.exports.api.meetinghouse = function (ldsMobileApi, jar, name, id/*, opts*/) {
  id = id && id.toString() || '';
  name = name && name.toString() || '';

  var unitSearchUrl = mapSearchUrl 
        .replace(/%@/, encodeURIComponent((name||'').split(/\s+/).shift() + ' ' + (id || '')))
        ;
  var meetinghouseType;

  return callApi({
    url: unitSearchUrl 
  }).then(function (listing) {
    var url;

    listing.some(function (item) {
      if (item.id && item.id.toString() === id.toString()) {
        meetinghouseType = item.type;
        return true;
      }
    });

    if (!meetinghouseType) {
      return null;
    }

    url = mapResultDetailsUrl 
            .replace(/%@/, encodeURIComponent(id))
            .replace(/%@/, encodeURIComponent(meetinghouseType))
            ;

    return callApi({
      url: url
    }).then(function (body) {
      body.meetinghouseType = meetinghouseType;
      return body;
    }).catch(function (/*e*/) {
      return { error: { message: "could not load meetinghouse map" } };
    });
  });
};

module.exports.api.user = function (ldsMobileApi, jar/*, opts*/) {
  return callApi({
    jar: jar
  , url: ldsMobileApi['current-user-detail']
  });
};

module.exports.api.profile = function (ldsMobileApi, jar, opts) {
  var results = { photos: [] };
  var individualId;

  return module.exports.api.user(ldsMobileApi, jar).then(function (body) {
    results.user = body;
    individualId = results.user.individualId;
  }).then(function () {
    // TODO look for profile in a cache

    var units = require('./basic').getHomeUnits(results.user);
    var individualPhotoUrl = ldsMobileApi['photo-url']
          .replace(/%@/, encodeURIComponent(individualId))
          .replace(/%@/, 'individual')
          ;
    var householdPhotoUrl = ldsMobileApi['photo-url']
          .replace(/%@/, encodeURIComponent(individualId))
          .replace(/%@/, 'household')
          ;

    function addPhoto(photo, type) {
      if (!photo || !(photo.originalUri || photo.thumbnailUri || photo.mediumUri || photo.largeUri)) {
        return;
      }

      results.photos.push({
        updatedAt: photo.submittedDate
      , type: type
      // approved: photo.available
      //, optedOut: photo.optedOut
      //, large: '500x375'
      //, medium: '200x150'
      //, thumbnail: '40x40'
      });
    }

    return PromiseA.all([
      module.exports.api.ward(ldsMobileApi, jar, units.ward.name, units.ward.id, opts).then(function (body) {
        results.ward = body;
        results.meetinghouse = body.meetinghouse;
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
    /*
    , module.exports.api.photo(ldsMobileApi, jar, results.user.individualId, 'individual', 'medium').then(function () {
      })
    , module.exports.api.photo(ldsMobileApi, jar, results.user.individualId, 'family', 'medium').then(function () {
      })
    , module.exports.api.meetinghouse(ldsMobileApi, jar, units.ward.name, units.ward.id).then(function (map) {
        results.meetinghouse = map;
      })
    */
    , module.exports.api.meetinghouse(ldsMobileApi, jar, units.stake.name, units.stake.id).then(function (map) {
        results.stakecenter = map;
      })
    ]);
  }).then(function () {
    //getCallings({
    //  id: '' /*unitNo*/, type: 'ward' /*ward|stake*/ }
    //, directory.callings, details.individualId, [], myCallings
    //);
    var stakesWithCalling = [];
    var wardsWithCalling = [];
    var utils = require('./basic');
    var homeUnits = utils.getHomeUnits(results.user);
    var stakes = utils.getUserStakes(results.user);
    var me = JSON.parse(JSON.stringify(results.ward.members.filter(function (m) {
      if (m.id === individualId) {
        return true;
      }
    })[0]));

    utils.getUnitsWithCalling(results.user, stakesWithCalling, wardsWithCalling);
    // { me: ..., callings: ..., stakes: ..., wards: ..., leaders: ..., individuals: ..., homes: ...
    // , home: ...
    // , token: session.token, jar: session.jar, user: user, ward: ward };
    

    // TODO displayName
    //, guest: !!me.guest
    // TODO area
    // delete me.id;
    me.individualId = me.id;
    me.stakecenter = results.stakecenter;
    me.meetinghouse = results.meetinghouse;
    me.photos = results.photos;

    me.home = results.ward.homes.filter(function (h) {
      if (h.id === me.homeId) {
        return true;
      }
    })[0];

    me.stakes = stakes;
    me.homeWardId = homeUnits.ward.id;
    me.homeWardName = homeUnits.ward.name;
    me.homeStakeId = homeUnits.stake.id;
    me.homeStakeName = homeUnits.stake.name;
    me.wardsWithCalling = wardsWithCalling;
    me.stakesWithCalling = stakesWithCalling;
    return me;
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
