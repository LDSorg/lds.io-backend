"use strict";

var mailer = require('../../comms/shared').mailer
  ;

module.exports.create = function (config) {
  var myTwilio = {}
    , tdb = {}
    , MAX_CALL_TIME = 3 * 60 * 60 * 1000
    , SESSION_CLEANUP_INTERVAL = 1 * 60 * 60 * 1000
    , Twilio = require('twilio')
    , opts = {}
    ;

  // prevent the parent from getting stuff that maybe it shouldn't
  Object.keys(config.twilio).forEach(function (key) {
    opts[key] = config.twilio[key];
  });

  if (!/^http/.test(opts.voicemailWav)) {
    // TODO get from vhost
    opts.voicemailWav = config.href + config.voicemailWav;
  }

  opts.voicemail = config.webhooks.voicemail;
  console.log('VOICEMAIL CONFIG');
  console.log(opts.voicemail);
  opts.client = new Twilio.RestClient(config.twilio.id, config.twilio.auth);
  opts.api = myTwilio;
  opts.webhookPrefix = '/webhooks/twilio';
  opts.subjectPrefixes = config.mailer.subjectPrefixes;
  //myTwilio.sms = require('./sms').create(opts);
  myTwilio.voice = require('./voice').create(opts);
  myTwilio.voicemail = require('./voicemail').create(opts);
  //myTwilio.conference = require('./conference').create(opts);

  // clear stale sessions from memory
  function cleanSessions() {
    var now = Date.now
      ;

    Object.keys(tdb).forEach(function (key) {
      tdb[key] = tdb[key] || { touchedAt: 0 };

      if (tdb[key].completed) {
        delete tdb[key];
      } else if ((now - tdb[key].touchedAt) > MAX_CALL_TIME) {
        delete tdb[key];
      }
    });
  }
  setInterval(cleanSessions, SESSION_CLEANUP_INTERVAL);
  
  function attachSession(req, res, next) {
    var callSid
      , smsSid
      ;

    if (!req.body) {
      console.log('[EMPTY] no body');
      next();
      return;
    }

    callSid = req.body.CallSid;
    if (req.body.CallSid) {
      tdb[callSid] = tdb[callSid] || { sid: callSid, ops: [] };
      req.call = tdb[callSid];
      req.call.touchedAt = Date.now();
    }

    smsSid = req.body.smsSid;
    if (req.body.SmsSid) {
      tdb[smsSid] = tdb[smsSid] || { sid: smsSid, ops: [] };
      req.sms = tdb[smsSid];
      req.sms.touchedAt = Date.now();
    }

    next();
  }

  myTwilio.session = function () {
    return attachSession;
  };

  myTwilio.secureWebhooks = function () {
    return function (req, res, next) {
      // TODO use `(req._encryptedSomethingOrOther ? https : http) + req.host` instead of opts.href
      var fullUrl = config.href + (req.originalUrl || req.url)
        , signature = req.headers['x-twilio-signature']
        ;

      // TODO create passport module for twilio auth-ing itself (with a user token too)?

      if (!Twilio.validateRequest(config.twilio.auth, signature, fullUrl, req.body)) {
        console.error('Request came, but not from Twilio');
        res.statusCode = 400;
        res.xend('<Error>Invalid signature. Are you even Twilio?</Error>');
        return;
      }
      
      next();
    };
  };

  // TODO create a default sendIn and sendOut in shared
  myTwilio.mailIn = function (fromNumber, subject, msg) {
    // TODO lookup in contacts

    mailer.send({
      from: fromNumber.replace(/[\-\)\(\.\+]/g, '').replace(/\+?1?(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')
        + ' <' + fromNumber + '@' + config.webhooks.text.smsdomain + '>'
    , to: config.mailer.defaults.forwardTo
    , bcc: config.mailer.defaults.bcc
    , replyTo: fromNumber.replace(/[\-\)\(\.\+]/g, '').replace(/\+?1?(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')
        + ' <' + fromNumber + '@' + config.webhooks.text.smsdomain + '>'
    , subject: subject
    , text: msg
    });
  };

  return myTwilio;
};
