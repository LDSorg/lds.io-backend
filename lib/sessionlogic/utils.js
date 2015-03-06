'use strict';

function createShadow(secret, hashtype) {
  hashtype = hashtype || 'md5';

  var crypto = require('crypto')
    , salt = crypto.randomBytes(32).toString('base64')
    , hash = crypto.createHash(hashtype)
    , shadow
    ;

  hash.update(salt);
  hash.update(secret);
  shadow = hash.digest('hex');

  // TODO rename secretHash -> shadow everywhere
  return { salt: salt, secret: shadow, shadow: shadow, type: hashtype, hashtype: hashtype };
}

function testSecretHash(salt, secret, shadow, type) {
  type = type || 'md5';

  var crypto = require('crypto')
    , hash = crypto.createHash(type)
    ;

  hash.update(salt);
  hash.update(secret);

  return shadow === hash.digest('hex');
}

module.exports.createSecretHash = createShadow;
module.exports.createShadow = createShadow;
module.exports.testSecretHash = testSecretHash;
module.exports.testShadow = testSecretHash;
module.exports.testSecret = testSecretHash;
