'use strict';

var PromiseA = require('es6-promise').Promise;
var nodemailer = require('nodemailer');
//var mg = require('nodemailer-mailgun-transport');

module.exports.Mailer = {
  create: function (service, serviceOpts) {
    /*
    var mtService;
    if (/mailgun/i.test(service)) {
      mtService = mg(serviceOpts);
    }
    */
    var transport = nodemailer.createTransport(service, serviceOpts);

    function send(opts) {
      return new PromiseA(function (resolve, reject) {
        transport.sendMail(opts, function (err, resp) {
          if (err) {
            reject(err);
            return;
          }

          resolve(resp);
        });
      });
    }

    return {
      send: send
    , mail: send
    };
  }
};

if (require.main === module) {
  var mailer = module.exports.Mailer.create('mailgun', { auth: {
    "user": "postmaster@hellabit.com"
  , "pass": "2ttl70oheb79"
  } });
  mailer.send({
    from: 'aj+test@hellabit.com'
  , to: 'coolaj86@gmail.com'
  //, bcc: opts.mailer.defaults.bcc
  , replyTo: 'aj+reply-to@hellabit.com'
  //    + ' <' + texterEmail + '>'
  , subject: "test subject"
  , text: "test body"
  //, html: ""
  }).then(function () {
    console.log('mailed');
  }).catch(function (err) {
    console.error('mail failed');
    console.error(err);
    throw err;
  });
}
