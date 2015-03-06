'use strict';

var _ = require('lodash')
  , utils = module.exports
  ;

_.str = require('underscore.string');

utils.str = _.str;
utils.toSnakeCase = function (attrs) {
  return _.reduce(attrs, function(memo, val, key) {
    memo[_.str.underscored(key)] = val;
    return memo;
  }, {});
};
utils.toSnakeCaseArr = function (keys) {
  return _.reduce(keys, function(memo, key, i) {
    memo[i] = _.str.underscored(key);
    return memo;
  }, []);
};

utils.toCamelCaseArr = function (keys) {
  return _.reduce(keys, function(memo, key, i) {
    memo[i] = _.str.camelize(key);
    return memo;
  }, []);
};

utils.toCamelCase = function (attrs) {
  return _.reduce(attrs, function(memo, val, key) {
    memo[_.str.camelize(key)] = val;
    return memo;
  }, {});
};

utils.inflateXattrs = function(xattrKey, keys, debug) {
  xattrKey = xattrKey || 'xattrs';
  keys = keys || [];

  return function (attrs) {
    if (debug) {
      console.log('[inflate.run]');
    }

    attrs = utils.toCamelCase(attrs);

    var xattrs = attrs[xattrKey] || {}
        // escape xattrKey?
      , keys = Object.keys(attrs)
      ;

    if ('string' === typeof xattrs) {
      if (-1 !== ['"','{','[','n','t','f','1','2','3','4','5','6','7','8','9'].indexOf(xattrs[0])) {
        xattrs = JSON.parse(xattrs);
      } else {
        console.warn("WARNING: Don't store strings in a json field");
      }
    }
    delete attrs[xattrKey];

    Object.keys(xattrs).forEach(function (key) {
      if (!attrs.hasOwnProperty(key) && -1 === keys.indexOf(key)) {
        attrs[key] = xattrs[key];
      }
    });

    return attrs;
  };
};

utils.zipXattrs = function(xattrKey, keys, emulate, debug) {
  if (debug) {
    console.log('[zipXattrs.new]', emulate);
    console.log(xattrKey);
    console.log(keys);
  }

  return function (attrs) {
    var xattrs = {}
      ;

    if (debug) {
      console.log('[zipXattrs.needles]');
      console.log(Object.keys(attrs));
      console.log('[zipXattrs.haystack]');
      console.log(keys);
    }
    Object.keys(attrs).forEach(function (key) {
      if (-1 === keys.indexOf(key)) {
        if (debug) {
          console.log('[zipXattrs.needle.missing]');
          console.log(key);
        }
        xattrs[key] = attrs[key];
        delete attrs[key];
      } else {
        if (debug) {
          console.log('[zipXattrs.needle.found]');
          console.log(key);
        }
      }
    });

    // This is VERY important because a fetch
    // should not be string-matching the json blob
    if (Object.keys(xattrs).length) {
      if ('text' === emulate) {
        attrs.xattrs = JSON.stringify(xattrs);
      } else {
        attrs.xattrs = xattrs;
      }
    }

    attrs = utils.toSnakeCase(attrs);
    if (debug) {
      console.log('[zipXattrs.snaked]');
      console.log(Object.keys(attrs));
    }
    return attrs;
  };
};

// format from model snake case in database
utils.format = function (emu, zipCol, colsMap, jsonCols, debug) {
  var camelFieldNames = utils.toCamelCaseArr(Object.keys(colsMap))
      // TODO find where created_at and updated_at are
      // not becoming camelized to createdAt and updated_at
      .concat(Object.keys(colsMap))
    ;

  if (debug) {
    console.log('[format.new]', camelFieldNames);
  }
  jsonCols = jsonCols || [];

  return function (attrs) {
    // TODO json cols
    attrs = utils.zipXattrs(zipCol, camelFieldNames, emu, debug)(attrs);

    if (debug) {
      console.log('[format.run]', Object.keys(colsMap));
      console.log(colsMap);
    }

    Object.keys(colsMap).forEach(function (key) {
      if ('datetime' === colsMap[key].type) {
        if (!attrs[key]) {
          return;
        }
        if ('number' === typeof attrs[key]) {
          attrs[key] = new Date(attrs[key]).toISOString();
        }
        if ('object' === typeof attrs[key]) {
          attrs[key] = attrs[key].toISOString();
        }
      }
    });
    jsonCols.forEach(function (col) {
      if (attrs[col] && 'text' === colsMap[col].type) {
        attrs[col] = JSON.stringify(attrs[col]);
      }
    });

    if (debug) {
      console.log('[format.return]', Object.keys(colsMap));
      console.log(attrs);
    }

    return attrs;
  };
};

// parse from database to camels in model
utils.parse = function (emu, zipCol, colsMap, jsonCols, debug) {
  jsonCols = jsonCols || [];

  if (debug) {
    console.log('[parse.new]');
  }

  return function (attrs) {
    attrs = utils.inflateXattrs(zipCol, emu, debug)(attrs);

    jsonCols.forEach(function (col) {
      if (attrs[col] && 'text' === colsMap[col].type) {
        attrs[col] = JSON.parse(attrs[col]);
      }
    });

    if (debug) {
      console.log('[parse.return]', Object.keys(colsMap));
      console.log(attrs);
    }

    return attrs;
  };
};
