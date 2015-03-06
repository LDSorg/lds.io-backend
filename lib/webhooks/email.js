'use strict';

var texter = require('../comms/shared').texter
  , mailer = require('../comms/shared').mailer
  , formatNumber = require('../comms/format-number').formatNumber
  , Promise = require('es6-promise').Promise
  ;

module.exports.create = function (opts) {
  function forwardViaEmail(message) {
    return mailer.send({
      from: opts.mailer.defaults.system
    , to: opts.mailer.defaults.forwardEmailTo
    , bcc: opts.mailer.defaults.bcc
    , replyTo: message.From
    , subject: message.Subject
    , text: message['stripped-html']
    });
  }

  function forwardViaSms(message) {
    return new Promise(function (resolve, reject) {
      var number
        , error = {}
        ;

      // TODO how to verify that the supposed sender is the actual sender?

      if (message['X-Mailgun-SFlag'] || message['X-Mailgun-SScore']) {
        // don't allow spaminess
        error.message = '[SMS] sender looks like spam';
        console.error(error.message);
        reject(error);
        return;
      }

      if (!(new RegExp('^coolaj86@gmail.com$|' + opts.emaildomain + '$|@coolajthedj.com$').test(message.sender))) {
        // don't allow spaminess
        error.message = "[SMS] sender '" + message.sender + "' isn't allowed";
        console.error(error.message);
        reject(error);
        return;
      }

      number = formatNumber(message.recipient.replace(/@.*/, ''));
      if (!number) {
        error.message = "[SMS] invalid phone number prefix '" + message.recipient + "'";
        console.error(error.message);
        reject(error);
        return;
      }

      if (message['stripped-text'].trim() !== message['stripped-text'].trim().substr(0, 160)) {
        error.message = "[SMS] message too long: " + message['stripped-text'].length;
        error.code = "MSG_LENGTH";
        console.error(error.message);
        reject(error);
        return;
      }

      // return texter.sms(...)
      // Apparently es6 promises aren't very composable...
      return texter.sms(
        { to: number
        , from: opts.twilio.number
        , body: message['stripped-text'].trim()
        }
      ).then(resolve, reject);
    });
  }

  return {
    catchall: function (req, res) {
      var number = formatNumber(req.body.recipient.replace(/@.*/, ''))
        ;
      console.log('[catchall] Caught something...', number, req.body.recipient);
      // NOTE since the message is validated as coming from Twilio (see webhooks/index.js),
      // it's probably safe enough to assume the right fields exist

      // TODO check recipient as opts.smsdomain
      if (number) {
        forwardViaSms(req.body).then(
          function (resp) {
            res.send({ success: true });
            return resp;
          }
        , function (err) {
            console.error('[MALING ERROR via SMS]');
            console.error(err);
            res.statusCode = 406;
            res.send({ error: err });
            return;
          }
        );
        return;
      }

      res.statusCode = 500;
      res.send({ error: { message: "not implemented: only sms-forwarding works right now" } });
      /*
      forwardViaEmail(req.body).then(
        function (resp) {
          res.send({ success: true });
          return resp;
        }
      , function (err) {
          console.error('[MALING ERROR via EMAIL]');
          console.error(err);
          res.statusCode = 406;
          res.send({ error: err });
          return;
        }
      );
      */
    }
  };
};
