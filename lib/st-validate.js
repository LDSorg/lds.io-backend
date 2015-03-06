'use strict';

var PromiseA = require('bluebird')
  ;

function typeOf(v) {
  return Object.prototype.toString.call(v).replace(/\[object (\w+)\]/, '$1');
}

function validate(schema, updates, restrict) {
  var err
    ;

  function validateHelper(path, sch, ups) {
    var keys = Object.keys(sch)
      , ekeys = Object.keys(ups)
      ;

    if (!ekeys.every(function (k) {
      if (-1 === keys.indexOf(k)) {
        err = new Error("'" + k + "' is not recognized or not allowed on this method");
        return false;
      }

      return true;
    })) {
      return false;
    }

    // TODO make recursive
    return keys.every(function (key) {
      var val = ups[key]
        , dt = typeOf(sch[key])
        , vt = typeOf(ups[key])
        ;

      if ('Undefined' === vt) {
        return true;
      }

      if (dt === vt) {
        if ('Array' === dt) {
          if ('Object' === typeOf(sch[key][0])) {
            return validateHelper(path + key + '[].', sch[key][0], ups[key][0]);
          } else {
            if (typeof(sch[key][0]) === typeOf(val[0])) {
              return true;
            }
          }
        } else if ('Object' === dt) {
          return validateHelper(path + key + '.', sch[key], ups[key]);
        }

        return true;
      }

      if ('Date' === dt && !/Invalid/.test(new Date(val).toString())) {
        return true;
      }

      err = new Error("'" + key + "' did not validate");
      return false;
    });
  }

  return new PromiseA(function (resolve, reject) {
    var s = schema
      ;

    // TODO allow subkeys to decend into schema
    if (restrict) {
      s = {};
      restrict.every(function (key) {
        s[key] = schema[key];
        if ('undefined' === typeof schema[key]) {
          reject(new Error("internal error: '" + key + "' was not recognized when generating schema validation"));
          return false;
        }

        return true;
      });
    }

    if (validateHelper("", s, updates)) {
      resolve();
    } else {
      reject(err);
    }
  });
}

module.exports.validate = validate;
