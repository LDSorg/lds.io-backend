'use strict';

var escapeRegexp = require('escape-string-regexp')
  , recase = require('recase').Recase.create({ exceptions: {} })
  ;

module.exports = function (prefixes, cancelParam) {
  cancelParam = cancelParam || 'camel';
  function restfulSnakify(req, res, next) {
    if (req.query[cancelParam]) {
      next();
      return;
    }
    // The webhooks, oauth and such should remain untouched
    // as to be handled by the appropriate middlewares,
    // but our own api should be transformed
    // + '$' /\/api(\/|$)/

    function matchesPrefix(prefix) {
      return new RegExp('^' + escapeRegexp(prefix) + '(\\/|$)').test(req.url) ;
    }

    if (!prefixes.some(matchesPrefix)) {
      next();
      return;
    }

    if ('object' === typeof req.body && !(req.body instanceof Buffer)) {
      req.body = recase.camelCopy(req.body);
    }

    res._oldJson = res.json;
    res.json = function (data, opts) {
      if ('object' === typeof data && !(data instanceof Buffer)) {
        res._oldJson(recase.snakeCopy(data), opts);
      } else {
        res._oldJson(data, opts);
      }
    };
    res.send = res.json;
    next();
    return;
  }
  return restfulSnakify;
};
