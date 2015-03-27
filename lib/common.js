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
    if (result._cache) {
      res.setHeader('Cache-Control', 'public, max-age=' + (result._cache / 1000));
      res.setHeader('Expires', new Date(Date.now() + result._cache).toUTCString());
      result = result._value;
    }
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
