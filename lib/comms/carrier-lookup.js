'use strict';

var formatNumber = require('./format-number')
  , TelCarrier = require('tel-carrier')
  ;

exports.create = function (telConfig) {
  var telCarrier = TelCarrier.create(telConfig)
    , me = {}
    ;

  me.lookup = function portcheck(nums, fn) {
    var things = {}
      , newNums
      , oldMaps
      , malformed = []
      ;

    nums.forEach(function (num, i) {
      nums[i] = num = formatNumber(num) || num;
      if (num) {
        things[num] = telConfig.check(num);
      } else {
        malformed.push(num);
      }
    });

    newNums = nums.filter(function (num) {
      return num && !things[num];
    });
    oldMaps = nums.filter(function (num) {
      return num && things[num];
    }).map(function (num) {
      return num && things[num];
    });

    console.log('newNums.length');
    console.log(newNums.length);

    if (0 === newNums.length) {
      fn(null, oldMaps, []);
      return;
    }

    console.log('about to lookup');
    telCarrier.lookup(newNums, function (err, maps) {
      console.log('lookup', maps.length);
      console.log(maps);
      // TODO check arr against nums and return the malformed
      maps.forEach(function (map) {
        telConfig.handle(formatNumber(map.number) || map.number, map);
      });
      fn(err, maps.concat(oldMaps), []);
    }, null, telConfig.raw);

  };

  return me;
};
