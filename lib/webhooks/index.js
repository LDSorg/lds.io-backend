'use strict';

var scmp = require('scmp')
  , crypto = require('crypto')
  , myMailgun = {}
  ;

myMailgun.secureWebhooks = function (mailerConfig) {
  var mailgunTokens = {}
    , mailgunExpirey = 15 * 60 * 1000
    ;

  function testSignature(apiKey, timestamp, token, signature) {
    var adjustedTimestamp = parseInt(timestamp, 10) * 1000
      , fresh = (Math.abs(Date.now() - adjustedTimestamp) < mailgunExpirey)
      ;


    if (!fresh) {
      console.error('[mailgun] Stale Timestamp: this may be an attack');
      console.error('[mailgun] However, this is most likely your fault\n');
      console.error('[mailgun] run `ntpdate ntp.ubuntu.com` and check your system clock\n');
      console.error('[mailgun] System Time: ' + new Date().toString());
      console.error('[mailgun] Mailgun Time: ' + new Date(adjustedTimestamp).toString(), timestamp);
      console.error('[mailgun] Delta: ' + (Date.now() - adjustedTimestamp));
      return false;
    }

    if (mailgunTokens[token]) {
      console.error('[mailgun] replay attack');
      return false;
    }
    mailgunTokens[token] = true;

    setTimeout(function () {
      delete mailgunTokens[token];
    }, mailgunExpirey + (5 * 1000));


    return scmp(
      signature
    , crypto.createHmac('sha256', apiKey)
      .update(new Buffer(timestamp + token, 'utf-8'))
      .digest('hex')
    );
  }

  return function (req, res, next) {
    if (!testSignature(mailerConfig.apiKey, req.body.timestamp, req.body.token, req.body.signature)) {
      console.error('Request came, but not from Mailgun');
      res.send({ error: { message: 'Invalid signature. Are you even Mailgun?' } });
      return;
    }

    console.log('mailgun signature matches', req.url);
    next();
  };
};

module.exports.create = function (app, config) {
  var myTwilio = require('./twilio').create(config)
    ;

  app.use(config.webhookPrefix + '/twilio', myTwilio.secureWebhooks(config.mailer));
  app.use(config.webhookPrefix + '/twilio', myTwilio.session());

  app.use(config.webhookPrefix + '/mailgun', myMailgun.secureWebhooks(config.mailer));

  function route(rest) {
    var forwardSms
      ;
    forwardSms = require('./text').create({
      mailer: config.mailer
    , smsdomain: config.webhooks.text.smsdomain
    , host: config.host
    , href: config.href
    , twilio: config.twilio
    , subjectPrefixes: config.mailer.subjectPrefixes
    }).forward;

    rest.twilio = function (endpoint, fn) {
      rest.post(config.webhookPrefix + '/twilio' + endpoint, fn);
    };
    rest.twilio('/sms', forwardSms);
    rest.twilio('/sms/forward', forwardSms);
    rest.twilio('/text', forwardSms);

    // WARNING this dialout resource must require authorization
    // TODO rest.post('/api/twilio/voice/dialout', myTwilio.voice.dialout);
    // TODO send a text or email with a phone number to have it dial

    // Incoming Call
    rest.twilio('/voice', myTwilio.voice.create);
    rest.twilio('/voice/status', myTwilio.voice.status);
    rest.twilio('/voice/screen', myTwilio.voice.screen);
    rest.twilio('/voice/connect', myTwilio.voice.connect);
    //app.post('/twilio/voice/forward', twilio.voice.forward); // straight forward

    // Voicemail
    rest.twilio('/voicemail', myTwilio.voicemail.create);
    rest.twilio('/voicemail/forward', myTwilio.voicemail.forward);

    // Conference (there's just one right now)
    /*
    rest.twilio('/conference', myTwilio.conference.create);
    rest.twilio('/conference/join', myTwilio.conference.join);
    rest.twilio('/conference/leave', myTwilio.conference.leave);
    rest.twilio('/conference/end', myTwilio.conference.end);
    */

    rest.twilio('/voice/autoreply', require('./voice').create(
      { mailer: config.mailer
      , host: config.host
      , href: config.href
      , twilio: config.twilio
      , speakablePhone: config.webhooks.voice.speakablePhone
      , speakableBusiness: config.webhooks.voice.speakableBusiness
      }).autoreply
    );

    // email
    // https://local.ldsconnect.org/webooks/mailgun/catchall
    rest.mailgun = function (endpoint, fn) {
      console.log(config.webhookPrefix + '/mailgun' + endpoint);
      rest.post(config.webhookPrefix + '/mailgun' + endpoint, fn);
      rest.get(config.webhookPrefix + '/mailgun' + endpoint, function (req, res) {
        var err = { error: { message: "Right place, wrong METHOD. Try a POST", url: req.url } }
          ;

        res.statusCode = 400;
        console.log(err);
        res.send(err);
      });
    };
    rest.mailgun('/catchall', require('./email').create(
      { mailer: config.mailer
      , host: config.host
      , href: config.href
      , twilio: config.twilio
      , smsdomain: config.webhooks.text.smsdomain
      , emaildomain: config.mailer.emaildomain
      }).catchall
    );
  }

  return { route: route };
};
