'use strict';

var crypto = require('crypto');
var cipherEncoding = 'base64'; // 'hex'
var cipherType = 'aes-128-cbc'; // 'des-ede3-cbc'
var fauxIv = new Buffer([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);

//
// Note: these "ciphers" are meant to produce predictable always-identical output from a given input
// they are also intended to be fast, not slow
// they are sude for the purpose of ciphering ids, but they still need to function as ids
//
module.export.weakDecipher = module.exports.decipher = function (crypted, secret) {
  var secbuf =  crypto.createHash('sha1').update(secret).digest().slice(0, 16);
  var decipherer = crypto.createDecipheriv(cipherType, secbuf, fauxIv);
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

module.export.weakCipher = module.exports.cipher = function (val, secret) {
  var secbuf =  crypto.createHash('sha1').update(secret).digest().slice(0, 16);
  var cipherer = crypto.createCipheriv(cipherType, secbuf, fauxIv);
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
