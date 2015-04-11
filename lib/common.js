'use strict';

var crypto = require('crypto');
var cipherEncoding = 'base64'; // 'hex'
var cipherType = 'aes-256-cbc'; // 'des-ede3-cbc'

module.exports.decipher = function (crypted, secret) {
  var decipherer = crypto.createDecipher(cipherType, secret);
  var decrypted;

  crypted = crypted
    .replace(/\-/g, '+') // Convert '-' to '+'
    .replace(/\_/g, '/') // Convert '_' to '/'
    ;

  try {
    decrypted = decipherer.update(crypted, cipherEncoding, 'utf8') + decipherer.final('utf8');
  } catch(e) {
    console.error(e.message);
    console.error(e.stake);
    return null;
  }

  return decrypted;
};

module.exports.cipher = function (val, secret) {
  var cipherer = crypto.createCipher(cipherType, secret);
  var crypted;

  try {
    crypted = (cipherer.update(val.toString(), 'utf8', cipherEncoding) + cipherer.final(cipherEncoding))
      .replace(/\+/g, '-') // Convert '+' to '-'
      .replace(/\//g, '_') // Convert '/' to '_'
      .replace(/=+$/, '') // Remove ending '='
      ;
  } catch(e) {
    console.error('[e] cipher');
    console.error(e);
    return null;
  }

  return crypted;
};

module.exports.rejectableRequest = function rejectableRequest(req, res, promise, msg) {
  return promise.error(function (err) {
    res.error(err);
  }).catch(function (err) {
    console.error('[ERROR] \'' + msg + '\'');
    console.error(err.message);
    console.error(err.stack);

    res.error(err);
  });
};

module.exports.promiseRequest = function promiseRequest(req, res, promise, msg) {
  return promise.then(function (result) {
    if (result._cache) {
      res.setHeader('Cache-Control', 'public, max-age=' + (result._cache / 1000));
      res.setHeader('Expires', new Date(Date.now() + result._cache).toUTCString());
    }
    if (result._mime) {
      res.setHeader('Content-Type', result._mime);
    }
    if (result._value) {
      result = result._value;
    }
    res.send(result);
  }).error(function (err) {
    res.error(err);
  }).catch(function (err) {
    console.error('[ERROR] \'' + msg + '\'');
    console.error(err.message);
    console.error(err.stack);

    res.error(err);
  });
};
