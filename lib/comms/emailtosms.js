'use strict';

// TODO also use twilio and nexmo
var carrierLookup = require('./carrier-lookup')
  , nodemailer = require('nodemailer')
  , formatNumber = require('./format-number')
  ;

function constructMsg(msg) {
  var max = 160
    , tail = ' ~ ldsconnect.org'
    , bodyMax = max - tail.length
    ;

  return msg.substr(0, bodyMax) + tail;
}

exports.create = function (telConfig, mailConfig) {
  var me = {}
      // TODO move mailer creation to a parent
    , mailer = nodemailer.createTransport(mailConfig.service, mailConfig.opts)
    , lookup = carrierLookup.create(telConfig).lookup
    ;

  me.mail = function (addresses, msg, fn) {
    if (!Array.isArray(addresses)) {
      addresses = [addresses];
    }
    if (0 === addresses.length) {
      fn(null);
      return;
    }

    var msgOpts = {}
      ;

    msgOpts.subject = '';
    msgOpts.text = constructMsg(msg);
    msgOpts.bcc = addresses.join(',');
    msgOpts.cc = mailConfig.defaults.from;
    msgOpts.from = mailConfig.defaults.from;
    msgOpts.replyTo = mailConfig.defaults.replyTo;
    // so that phones see the from address and not the bounce address
    msgOpts.headers = {
      'X-Mailgun-Native-Send': 'Yes'
    };

    if (0 === addresses.length) {
      fn(null);
      return;
    }

    mailer.sendMail(msgOpts, function (err) {
      if (!err) {
        fn(null);
        return;
      }

      console.error('\n[mailerConfig.opts]');
      console.error(mailConfig.opts);
      console.error('\n[mailerConfig.defaults]');
      console.error(mailConfig.defaults);
      console.error('\n[msgOpts]');
      console.error(msgOpts);

      console.error(err.toString());
      console.error(err);

      fn(err);
    });
  };

  me.sms = function (numbers, msg, cb) {
    var malformed = []
      ;

    if ('string' !== typeof msg) {
      cb(new Error('Empty message, what!?'));
      return;
    }
    if (!Array.isArray(numbers)) {
      numbers = [numbers];
    }
      
    console.log('nums');
    console.log(numbers);
    numbers = numbers.filter(function (num) {
      var n = formatNumber(num)
        ;

      if (!n) {
        malformed.push(num);
      } else if (/555\d{7}/.test(n)) {
        malformed.push(num);
      } else {
        return true;
      }
    });
    console.log('filter');
    console.log(numbers);

    if (!numbers.length) {
      cb(null, numbers, malformed, []);
      return;
    }

    lookup(numbers, function (err, nums, nonwireless) {
      var gateways
        , nosms = []
        , sendable
        ;

      nums = nums.filter(function (n) {
        if (n.smsGateway && !/qwest/i.test(n.smsGateway)) {
          return true;
        } else {
          // TODO add to nonwireless
          nosms.push(n);
          return false;
        }
      });

      gateways = nums.map(function (n) {
        return n.smsGateway;
      });

      sendable = nums.map(function (n) {
        return formatNumber(n.number);
      });

      if (0 === sendable.length) {
        cb(null, sendable, malformed, nosms, nonwireless);
        return;
      }

      me.mail(
        gateways
      , msg
      , function (err) {
          if (err) {
            cb(err);
            return;
          }
          cb(null, sendable, malformed, nosms, nonwireless);
        }
      );
    });
  };

  return me;
};
