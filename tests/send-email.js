'use strict';

var mailer = require('../lib/comms/shared').mailer
  , config = require('../config')
  ;

console.log(config.mailer.defaults.bcc);
console.log(config.mailer.defaults.from);

mailer.send({
  to: 'AJ ONeal (Work) <awesome@coolaj86.com>'
, bcc: config.mailer.defaults.bcc
, from: config.mailer.defaults.from
, subject: 'This is a test of the emeregency broadcast system'
, text: 'This is a real test. Repeat, this is not a drill.'
}).then(function () {
  console.log('SUCCESS');
}, function (err) {
  console.error(err);
});
