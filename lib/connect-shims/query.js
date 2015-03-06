'use strict';

var qs = require('qs')
  ;

module.exports = function () {
  return function (req, res, next) {
    var index
      ;

    if (!req.query) {
      index = req.url.indexOf('?');
      req.query = qs.parse(req.url.substr(index + 1));
    }

    next();
  };
};
