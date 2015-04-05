'use strict';

// directory = temp1.logins[0].direcotry

function getHomeUnits(details) {
  function getUnit(units, homeUnitNbr) {
    var homeStake;
    var homeWard;

    // my home stake / ward
    units.forEach(function (stake) {
      stake.localUnits.forEach(function (ward) {
        if (homeUnitNbr === ward.unitNo) {
          homeStake = stake;
          homeWard = ward;
        }
      });
    });

    return {
      stake: { id: homeStake.unitNo, name: homeStake.unitName, typeId: homeStake.orgTypeId, type: 'stake' }
    , ward: { id: homeWard.unitNo, name: homeWard.unitName, typeId: homeWard.orgTypeId, type: 'ward' }
    };
  }

  return getUnit(details.units, details.homeUnitNbr);
}


function getIndividual(individualsMap, p) {
  return individualsMap[p];
  // return individualsMap[h.headOfHouse && h.headOfHouse.individualId || h.headOfHouseIndividualId || h.id || h];
}

function getHomeId(h) {
  // I believe headOfHouseIndividualId is sometimes the spouse
  return h.headOfHouse.individualId || h.headOfHouseIndividualId; // || h.spouse && h.individualId;
}

function flattenHouseholds(directory, individualsMap, homesMap) {
  directory.households.forEach(function (h) {
    var individual;

    flattenHome(homesMap, h);

    // TODO memberId
    // TODO don't include house phone
    function parseIndividual(adult, tag) {
      individual = individualsMap[adult.individualId] = {
        name: adult.preferredName.split(/,\s+/g).pop()
      , givennames: adult.givenName.split(/\s+/g)
      , surnames: adult.surname.split(/\s+/g)
      , id: adult.individualId
      // TODO make sure this is taken out before caching
      , memberId: adult.memberId
      // TODO emailPrivacyLevel
      // TODO phonePrivacyLevel
      , homeId: getHomeId(h)
      };
      individual[tag] = true;

      assignContactNodes(individual, adult.phone, null/*h.phone*/, adult.email, null/*h.emailAddress*/);
    }

    if (h.headOfHouse && h.headOfHouse.individualId) {
      parseIndividual(h.headOfHouse, 'headOfHouse');
    }

    if (h.spouse && h.spouse.individualId) {
      parseIndividual(h.spouse, 'spouse');
    }

    if (Array.isArray(h.children)) {
      h.children.forEach(function (child) {
        parseIndividual(child, 'child');
      });
    }

    return [];
  });
}

function handleBishopric(bishopric, individualsMap, honchos) {
  bishopric.assignmentsInGroup.forEach(function (calling) {
    if ("Bishopric" === calling.positionName || 4 === calling.positionTypeId) {
      honchos.bishop = getIndividual(individualsMap, calling.individualId);
    }
    if ("Bishopric First Counselor" === calling.positionName || 54 === calling.positionTypeId) {
      honchos.first = getIndividual(individualsMap, calling.individualId);
    }
    if ("Bishopric Second Counselor" === calling.positionName || 55 === calling.positionTypeId) {
      honchos.second = getIndividual(individualsMap, calling.individualId);
    }
    if ("Ward Executive Secretary" === calling.positionName || 56 === calling.positionTypeId) {
      honchos.secretary = getIndividual(individualsMap, calling.individualId);
    }
    if ("Ward Clerk" === calling.positionName || 57 === calling.positionTypeId) {
      honchos.clerk = getIndividual(individualsMap, calling.individualId);
    }
    /*
    if ("Ward Assistant Clerk" === calling.positionName || 58 === calling.positionTypeId) {
      honchos.assistant = getIndividual(individualsMap, calling.individualId);
    }
    */
    if ("Ward Assistant Clerk--Membership" === calling.positionName || 787 === calling.positionTypeId) {
      honchos.membership.push(getIndividual(individualsMap, calling.individualId));
    }
  });
}

function flattenHome(homesMap, h) {
  var homeId = h.headOfHouse.individualId || h.headOfHouseIndividualId;
  var home = homesMap[homeId] = {
    id: homeId
  , phone: h.phone || h.headOfHouse.phone
  , email: h.emailAddress || h.headOfHouse.email
  , latitude: h.latitude
  , longitude: h.longitude
  , postalCode: h.postalCode
  , lines: ["", ""]
  };
  var lines = [h.desc2, h.desc3];
  var cityState;

  if (h.desc1) {
    // normal street address
    home.lines[0] = h.desc1.replace(h.postalCode, '').trim();
  }

  function parseCityState(line) {
    cityState = line.replace(h.postalCode, '').split(/,\s*/g);
    // just in case this zip doesn't exactly match the one above
    home.state = cityState.pop().replace(/\s+\d+(\s*-\s*\d+)?/g, '').trim();
    // not sure if the city is always present or if it may be sometimes missing
    home.city = (cityState.shift()||'').trim();
    // TODO I don't think there's ever a county on this line... I hope...
  }

  lines = lines.filter(function (line) {
    return (line||'').trim();
  });

  // Ugh... so nasty
  if (lines.length > 1) {
    parseCityState(h.desc3)
    if (home.state && home.city && !/\d/.test(home.city) && !/\d/.test(home.state)) {
      home.lines[1] = h.desc2;
      return;
    }

    home.city = '';
    home.state = '';
    parseCityState(h.desc2)

    if (home.state && home.city && !/\d/.test(home.city) && !/\d/.test(home.state)) {
      home.lines[1] = h.desc3;
    } else {
      home.city = '';
      home.state = '';
      home.lines[1] = h.desc2;
      home.lines[2] = h.desc3;
    }
  } else if (lines.length) {
    parseCityState(lines[0])
    if (!home.city || /\d/.test(home.city) || /\d/.test(home.state)) {
      home.city = '';
      home.state = '';
      home.lines[1] = lines[0];
    }
  }
}

function assignContactNodes(individual, phone, phone2, email, email2) {
  if (!phone2) {
    phone2 = undefined;
  }
  if (!email2) {
    email2 = undefined;
  }

  if (!phone) {
    phone = phone2;
  }
  if (!email) {
    email = email2;
  }

  if (phone === phone2) {
    phone2 = undefined;
  }
  if (email === email2) {
    email2 = undefined;
  }

  individual.phones = [];
  if (phone) {
    individual.phones.push({ value: phone });
  }
  if (phone2) {
    individual.phones.push({ value: phone2 });
  }
  individual.emails = [];
  if (email) {
    individual.emails.push({ value: email });
  }
  if (email2) {
    individual.emails.push({ value: email2 });
  }
}


function findLeaders(directory, individualsMap, honchos) {
  directory.callings.forEach(function (calling) {
    var bishopric;
    if (1179 === calling.orgTypeId || /Bishopric/.test(calling.name)) {
      bishopric = calling;
      handleBishopric(bishopric, individualsMap, honchos);
    }
  });

  return honchos;
}

function getUnitsWithCallingHelper(memberAssignments, unitsWithCallingIds) {
  (memberAssignments||[]).forEach(function (calling) {
    unitsWithCallingIds.push(calling.unitNo);
  });

  return unitsWithCallingIds;
}

// http://www.lds.org/maps/services/search?query=provo%20192&lang=eng
// http://www.lds.org/maps/services/search?query=429686&lang=eng
// https://www.lds.org/maps/services/layers/details?id=429686&layer=ward.ysa&lang=eng
// https://www.lds.org/maps/services/layers/details?id=1940120&layer=stake.ysa&lang=eng
function getUnitsWithCalling(rawUser, stakesWithCalling, wardsWithCalling) {
  var unitsWithCallingIds = [];

  getUnitsWithCallingHelper(rawUser.memberAssignments, unitsWithCallingIds);
  
  rawUser.units.forEach(function (rawStake) {
    if (-1 !== unitsWithCallingIds.indexOf(rawStake.unitNo)) {
      stakesWithCalling.push({
        stakeId: rawStake.unitNo
      , type: 'stake'
      , typeId: rawStake.orgTypeId
      });
    }
    rawStake.localUnits.forEach(function (rawWard) {
      if (-1 !== unitsWithCallingIds.indexOf(rawWard.unitNo)) {
        wardsWithCalling.push({
          stakeId: rawStake.unitNo
        , wardId: rawWard.unitNo
        , type: 'ward'
        , typeId: rawWard.orgTypeId
        });
      }
    });
  });
}

function getCallingsInGroup(unitInfo, callings, myId, heirarchy, myCallings) {
  callings.forEach(function (calling) {
    if (myId !== calling.individualId) {
      return;
    }

    myCallings.push({
      created: calling.dateActivated
    , setApart: calling.dateSetApart
    , isSetApart: calling.setApartFlg
    , title: calling.positionName
    , typeId: calling.positionTypeId
    , parentTypeId: heirarchy[heirarchy.length - 1].typeId
    , heirarchy: heirarchy
    });
  });
}

function getCallings(unitInfo, callings, myId, heirarchy, myCallings) {
  callings.forEach(function (org) {
    var h = heirarchy.slice(0);
    h.push({ typeId: org.orgTypeId, name: org.name});
    if (Array.isArray(org.assignmentsInGroup)) {
      getCallingsInGroup(unitInfo, org.assignmentsInGroup, myId, h, myCallings);
    }
    if (Array.isArray(org.children)) {
      getCallings(unitInfo, org.children, myId, h, myCallings);
    }
  });

  return myCallings;
}

function flattenCallings(callings, callingsMap) {
  callings.forEach(function (org) {
    var typeId = org.orgTypeId;

    // TODO how many nines in fake typeId?
    if (!typeId || /^(9{3,10}|0{3,10})$/.test(typeId.toString())) {
      typeId = (org.name||'').toLowerCase()
    }

    callingsMap[typeId] = { typeId: typeId, name: org.name};

    if (Array.isArray(org.assignmentsInGroup)) {
      // ignore
      //getCallingsInGroup(org.assignmentsInGroup, myId, h, myCallings);
    }

    if (Array.isArray(org.children)) {
      flattenCallings(org.children, callingsMap);
    }

    return callingsMap;
  });

  return callingsMap;
}

function getIndividualIds(rawWardDirectory, ids) {
  if (!ids) {
    ids = [];
  }

  rawWardDirectory.households.forEach(function (h) {
    if (h.headOfHouse && h.headOfHouse.individualId) {
      ids.push(h.headOfHouse.individualId);
    }
    if (h.spouse && h.spouse.individualId) {
      ids.push(h.spouse.individualId);
    }
    if (h.children) {
      h.children.forEach(function (c) {
        if (c.individualId) {
          ids.push(c.individualId);
        }
      });
    }
  });

  return ids;
}

function getHomeIds(rawWardDirectory, ids) {
  if (!ids) {
    ids = [];
  }

  rawWardDirectory.households.forEach(function (h) {
    if (h.headOfHouse && h.headOfHouse.individualId) {
      ids.push(h.headOfHouse.individualId);
    } else if (h.headOfHouseIndividualId) {
      ids.push(h.headOfHouseIndividualId);
    }
  });

  return ids;
}

function getWard(rawWardDirectory) {
  var individualsMap = {};
  var homesMap = {};
  var honchos = { membership: [] };
  var callingsMap = {};

  flattenHouseholds(rawWardDirectory, individualsMap, homesMap);
  findLeaders(rawWardDirectory, individualsMap, honchos);

  // TODO flatten callings list
  flattenCallings(rawWardDirectory.callings, callingsMap);

  return { 
    leaders: honchos
  , membersMap: individualsMap
  , members: Object.keys(individualsMap).map(function (id) {
      return individualsMap[id];
    })
  , homesMap: homesMap 
  , homes: Object.keys(homesMap).map(function (id) {
      return homesMap[id];
    })
  , callingsMap: callingsMap
  , callings: Object.keys(callingsMap).map(function (id) {
      return callingsMap[id];
    })
  };
}

function getProfile(details, directory) {
  var stakesWithCalling = [];
  var wardsWithCalling = [];
  var myCallings = [];

  getUnitsWithCalling(details, stakesWithCalling, wardsWithCalling);

  getCallings({ id: '' /*unitNo*/, type: 'ward' /*ward|stake*/ }, directory.callings, details.individualId, [], myCallings);
  //console.log('my callings', myCallings);

  // TODO normalize on server, group on client
  // TODO my callings (across multiple wards)
  return { 
    callings: myCallings
  , stakesWithCalling: stakesWithCalling
  , wardsWithCalling: wardsWithCalling
  };
}

function buildPhotoUrls(photoUrl, ids, type, limit, urls) {
  var maxNum = limit || 300;
  var maxLen = 2000;
  var baseLen = photoUrl.replace(/%@/, '').replace(/%@/, type);
  var batch = [];
  // starts at -1 because there is no comma on first element
  var batchLen = -1;

  if (!urls) {
    urls = [];
  }

  if (!ids.length) {
    return urls;
  }

  ids.forEach(function (id) {
    id = id.toString();
    // NOTE +1 is for comma
    if (baseLen + batchLen + id.length + 1 < maxLen || batch.length < maxNum) {
      batch.push(id);
      batchLen += id.length + 1;
    } else {
      urls.push(photoUrl.replace(/%@/, batch.join(',')).replace(/%@/, type));
      batch = [];
      batchLen = -1;
    }
  });

  if (batch.length) {
    urls.push(photoUrl.replace(/%@/, batch.join(',')).replace(/%@/, type));
  }

  return urls;
}

function getUserStakes(user) {
  return user.units.map(function (stake) {
    var myStake = {
      id: stake.unitNo
    , name: stake.unitName
    , typeId: stake.orgTypeId
    , type: 'stake'
    , wards: []
    };

    stake.localUnits.forEach(function (ward) {
      myStake.wards.push({
        id: ward.unitNo
      , name: ward.unitName
      , typeId: ward.orgTypeId
      , type: 'ward'
      });
    });

    return myStake;
  });
}

module.exports.getHomeUnits = getHomeUnits;
module.exports.getUserStakes = getUserStakes;
module.exports.getProfile = getProfile;
module.exports.getWard = getWard;
module.exports.getHomeIds = getHomeIds;
module.exports.getIndividualIds = getIndividualIds;
module.exports.getCallings = getCallings;
module.exports.buildPhotoUrls = buildPhotoUrls;
