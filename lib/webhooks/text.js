'use strict';

var mailer = require('../comms/shared').mailer
  , multipartMessages = {}
  , formatNumber = require('../comms/format-number').formatNumber
  //, contacts = require('./contacts')
  ;

module.exports.create = function (opts) {
  if (!opts || !opts.mailer || !opts.smsdomain || !opts.twilio || !opts.host) {
    throw new Error('Missing fields from options for text-webhook');
  }

  var maxMsgWait = 15 * 1000
    ;

  function formatDetails(data) {
    return Object.keys(data).sort().map(function (k) {
      return k + ': ' + data[k];
    }).join('\n');
  }

  // TODO various strategies could include
  // * forward to single address
  // * forward to agent responsonsible for this customer
  function forwardSmsViaEmail(texter, sms, raw) {
    var subject
      , msg
      , contact
      , texterDisplay
      , texterName
      , texterEmail
      ;

    //TODO contact = contacts.lookupContactByPhone(texter) || {};
    contact = {};

    texterEmail = formatNumber(texter, '$2-$3-$4') + '@' + opts.smsdomain;
    texterDisplay = contact.name || formatNumber(texter, '($2) $3-$4');
    // NOTE you can't use ( or ) in the name part of an email address... who knew!?
    // Page 10 as defined by `ctext` in http://www.ietf.org/rfc/rfc2822.txt
    texterName = contact.name || formatNumber(texter, '$2.$3.$4');

    // 
    subject = (opts.subjectPrefixes.sms || "") + texterDisplay;
    msg = ""
      + "\n" + sms
        + "\n\nMessage sent by"
        + (contact.name && ("\n" + contact.name) || "")
        + "\n" + texterDisplay
        + (contact.email && ("\n" + contact.email) || "")
      ;

    /*
    if (contact.deal) {
      msg += "\n\n\n\nDeal Details:\n\n" + (formatDetails(contact.deal) || "");
    }
    */

    msg += "\n\n\n\nTechnical Details:\n\n" + raw;

    return mailer.send({
      from: (contact.name || texterName)
        + ' <' + texterEmail + '>'
    //, to: event.email
    , to: opts.mailer.defaults.replyTo
    , bcc: opts.mailer.defaults.bcc
    , replyTo: (contact.name || texterName)
        + ' <' + texterEmail + '>'
    , subject: subject
    , text: msg
    });
  }

  function forward(from, msg, details) {
    // test case
    // /^\((\d+)\/(\d+)\)/.exec("(2/5)and then we'll be able to live in peace.")
    // /^\((\d+)\/(\d+)\)/.exec("40% (2/5) and then we'll be able to live in peace.")
    var mpm // multi-part sms
      , x
      , total
      , parts = /^\((\d+)\/(\d+)\)/.exec(msg)
      ;

    if (!from || !msg) {
      return Promise.reject({ error: { message: "[SMS] missing from and or message" } });
    }

    // Forward via e-mail once all parts come in
    function send() {
      delete multipartMessages[from];
      return forwardSmsViaEmail(from, msg, formatDetails(details));
    }

    // Sometimes a message comes in many parts
    // if this message looks like it has many parts,
    // then wait to send it
    if (!parts) {
      return send();
    }

    mpm = multipartMessages[from] = multipartMessages[from] || { parts: [] };
    x = parseInt(parts[1], 10);
    total = parseInt(parts[2], 10);

    // clear the timeout, if any
    clearTimeout(mpm._timeout);

    // sometimes the messages come out-of-order
    // putting the messages in order causes the length to be incorrect
    // realLength is the cure
    mpm.parts.realLength = mpm.parts.realLength || 0;
    mpm.parts[x] = msg.split('').splice(parts[0].length).join('');
    mpm.parts.realLength += 1;

    // join all the parts together in case this is the last message
    msg = mpm.parts.join('\n');

    // sometimes message 1 and 3 come, but 2 gets lost in the ether
    // (at least that's been my experience with google voice)
    // this timeout sends the partial message parts
    if (mpm.parts.realLength === total) {
      return send();
    }

    return new Promise(function (resolve, reject) {
      mpm._timeout = setTimeout(function () {
        send().then(resolve, reject);
      }, maxMsgWait);
    });
  }

  return {
    forward: function (req, res) {
      // TODO say this is an automated system and prompt for a time to call
      res.xend('<Response></Response>');

      // NOTE since the message is validated as coming from Twilio (see webhooks/index.js),
      // it's probably safe enough to assume the right fields exist
      forward(req.body.From, req.body.Body, req.body).then(
        function (resp) {
          return resp;
        }
      , function (err) {
          if (err) {
            // TODO log the message that came in
            console.error('SMS forward / MAILER ERROR');
            console.error(err);
            //resolve({ error: err });
            return;
          }

          //resolve({ success: resp });
        }
      );
    }
  };
};
