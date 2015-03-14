'use strict';

// directory = temp1.logins[0].direcotry

function getDetails(details) {
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
        //console.log(ward.unitName);
      });
    });

    return {
      stake: { id: homeStake.unitNo, name: homeStake.unitName, typeId: homeStake.orgTypeId }
    , ward: { id: homeWard.unitNo, name: homeWard.unitName, typeId: homeWard.orgTypeId }
    };
  }

  return getUnit(details.units, details.homeUnitNbr);
}

function getDirectory(details, directory) {
  var individualsMap = {};
  var homesMap = {};
  var honchos = { membership: [] };

  function getHomeId(h) {
    return h.headOfHouse.individualId || h.headofHouseIndividualId;
  }

  /*
  function getHome(homesMap, id) {
    return homesMap[id];
    // return homesMap[h.headOfHouse && h.headOfHouse.individualId || h.headofHouseIndividualId || h.id || h];
  }
  */

  function getIndividual(individualsMap, p) {
    return individualsMap[p];
    // return individualsMap[h.headOfHouse && h.headOfHouse.individualId || h.headofHouseIndividualId || h.id || h];
  }

  function flattenHome(homesMap, h) {
    var homeId = h.headOfHouse.individualId || h.headofHouseIndividualId;
    var home = homesMap[homeId] = {
      id: homeId
    , phone: h.phone || h.headOfHouse.phone
    , email: h.emailAddress || h.headOfHouse.email
    , latitude: h.latitude
    , longitude: h.longitude
    , postalCode: h.postalCode
    , lines: ["", ""]
    };
    var cityState;

    if (h.desc1) {
      // normal street address
      home.lines[0] = h.desc1.replace(h.postalCode, '').trim();
    }
    if (h.desc2) {
      // building / suite number, etc
      home.lines[1] = h.desc2.replace(h.postalCode, '').trim();
    }
    if (h.desc3) {
      cityState = h.desc3.replace(h.postalCode, '').split(/,\s*/g);
      // just in case this zip doesn't exactly match the one above
      home.state = cityState.pop().replace(/\s+\d+(\s*-\s*\d+)?/g, '').trim();
      // not sure if the city is always present or if it may be sometimes missing
      home.city = (cityState.shift()||'').trim();
      // TODO I don't think there's ever a county on this line... I hope...
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

  function flattenHouseholds(directory, individualsMap, homesMap) {
    directory.households.forEach(function (h) {
      var individual;

      flattenHome(homesMap, h);

      // TODO get spouse
      if (h.headOfHouse && h.headOfHouse.individualId) {
        individual = individualsMap[h.headOfHouse.individualId] = {
          name: h.headOfHouse.preferredName.split(/,\s+/g).pop()
        , givennames: h.headOfHouse.givenName.split(/\s+/g)
        , surnames: h.headOfHouse.surname.split(/\s+/g)
        , id: h.headOfHouse.individualId
        // TODO emailPrivacyLevel
        // TODO phonePrivacyLevel
        , homeId: getHomeId(h)
        };

        assignContactNodes(individual, h.headOfHouse.phone, h.phone, h.headOfHouse.email, h.emailAddress);
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

  function getUnits(memberAssignments, unitNos) {
    (memberAssignments||[]).forEach(function (calling) {
      unitNos.push(calling.unitNo);
    });

    return unitNos;
  }

  // http://www.lds.org/maps/services/search?query=provo%20192&lang=eng
  // http://www.lds.org/maps/services/search?query=429686&lang=eng
  // https://www.lds.org/maps/services/layers/details?id=429686&layer=ward.ysa&lang=eng
  // https://www.lds.org/maps/services/layers/details?id=1940120&layer=stake.ysa&lang=eng
  function getRequestableUnits(details, stakeUnitNos, wardUnitNos) {
    var unitNos = [];

    getUnits(details.memberAssignments, unitNos);
    
    details.units.forEach(function (stake) {
      if (-1 !== unitNos.indexOf(stake.unitNo)) {
        stakeUnitNos.push({ stakeId: stake.unitNo });
      }
      stake.localUnits.forEach(function (ward) {
        if (-1 !== unitNos.indexOf(ward.unitNo)) {
          wardUnitNos.push({ stakeId: stake.unitNo, wardId: ward.unitNo });
        }
      });
    });
  }

  function getCallingsInGroup(unitInfo, callings, myId, heirarchy, myCallings) {
    callings.forEach(function (calling) {
      if (myId !== calling.individualId) {
        return;
      }

      //console.log(calling);
      myCallings.push({
        created: calling.dateActivated
      , setApart: calling.dateSetApart
      , isSetApart: calling.setApartFlg
      , title: calling.positionName
      , typeId: calling.positionTypeId
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

  flattenHouseholds(directory, individualsMap, homesMap);
  findLeaders(directory, individualsMap, honchos);
  var stakes = [];
  var wards = [];
  var myCallings = [];
  var me;

  getRequestableUnits(details, stakes, wards);
  // TODO for each stake and ward
  //console.log('leaders', honchos);
  //console.log('me', getIndividual(individualsMap, details.individualId));
  //console.log('stakes in which I have callings', stakes);
  //console.log('wards in which I have callings', wards);
  //console.log('my id', details.individualId);

  getCallings({ id: '' /*unitNo*/, type: 'ward' /*ward|stake*/ }, directory.callings, details.individualId, [], myCallings);
  //console.log('my callings', myCallings);

  // TODO normalize on server, group on client
  // TODO my callings (across multiple wards)
  me = getIndividual(individualsMap, details.individualId);
  return { 
    me: me
  , home: homesMap[me.homeId]

  , callings: myCallings
  , stakes: stakes
  , wards: wards

  , leaders: honchos
  , individuals: Object.keys(individualsMap).map(function (id) {
      return individualsMap[id];
    })
  , homes: Object.keys(homesMap).map(function (id) {
      return homesMap[id];
    })
  };
}

module.exports.getDetails = getDetails;
module.exports.getDirectory = getDirectory;
