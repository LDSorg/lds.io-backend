'use strict';

var config = require('../../priv/config')
  ;

module.exports = {
  mailer: require('./mailer').Mailer.create(config.mailer.service, config.mailer.opts)
, texter: require('./texter').Texter.create('twilio', config.twilio)
// TODO support nexmo, mogreet, smsglobal
// TODO snail mail via *lob*, postful, postalmethods, sendwrite, docsaway, *lmpost*, click2mail
//      http://stackoverflow.com/questions/4261981/any-snail-mail-apis-recommendations
// TODO Incoming snail mail https://www.earthclassmail.com/
};
module.exports.Comms = module.exports;
