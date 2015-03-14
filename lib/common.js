'use strict';

module.exports.rejectableRequest = function rejectableRequest(req, res, promise, msg) {
  return promise.error(function (err) {
    res.error(err);
  }).catch(function (err) {
    console.error('[ERROR] \'' + msg + '\'');
    console.error(err);

    res.error(err);

    throw err;
  });
};

module.exports.promiseRequest = function promiseRequest(req, res, promise, msg) {
  return promise.then(function (result) {
    res.send(result);
  }).error(function (err) {
    res.error(err);
  }).catch(function (err) {
    console.error('[ERROR] \'' + msg + '\'');
    console.error(err);

    res.error(err);

    throw err;
  });
};
