'use strict';

var Promise = require('es6-promise').Promise
  , Twilio = require('twilio')
  ;

module.exports.Texter = {
  create: function (service, opts) {
    if ('twilio' !== service) {
      throw new Error("'" + service + "' is not supported. 'twilio' is the only supported service at the moment");
    }

    var twilio = new Twilio.RestClient(opts.id, opts.auth)
      ;

    function send(opts) {
      return new Promise(function (resolve, reject) {
        twilio.sendSms(opts, function (err, resp) {
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
    , sms: send
    , mms: function () { throw new Error('MMS Not Implemented'); }
    };
  }
};
