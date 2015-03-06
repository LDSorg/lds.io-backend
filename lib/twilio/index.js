'use strict';

module.exports.create = function (app, config) {
  var Twilio = require('twilio')
    , myTwilio = require('../webhooks/twilio').create(config)
    , voice = {}
    , twilio = new Twilio.RestClient(config.twilio.id, config.twilio.auth)
    ;

  /*
   * PUBLIC API - SHOULD REQUIRE AUTHENTICATION
   *
   * WARNING these resources should require authorization
   */
  app.use(config.apiPrefix + '/twilio', myTwilio.session());
  // TODO dial -> voice/dial
  app.use(config.apiPrefix + '/twilio/dial', function (req, res, next) {
    if (-1 === ['admin', 'root'].indexOf(req.user.account.role)) {
      res.statusCode = 400;
      res.send({ error: { message: "Unauthorized to dial" } });
    }
    next();
  });

  // POST /api/twilio/voice/dialout
  // First use case: the rep is the initiator and caller
  // Second use case: the customer is the initiator, but requesting a call from a rep
  voice.dialout = function (req, res) {
    console.log('dialout (call rep, then call customer)');
    var caller = config.twilio.forwardIncomingCallsTo // the rep will call the customer // req.body.caller
      , callee = req.body.callee || req.body.number || req.body.phone
      , search = '?callee=' + encodeURIComponent(callee)
      ;

    //host = req.headers.host;
    twilio.calls.post(
      { to: caller
      , from: config.twilio.number
      // this is already recorded on the outbound side
      //, record: true
      , url: config.href + config.webhookPrefix + '/twilio/voice/screen' + search
      }
    , function (err, result) {
        // TODO link call ids and respond back to the browser when the rep has answered or has declined
        if (err) {
          console.error(err);
          res.send({ "error": { message: err.message || err.toString() } });
          return;
        }
        console.log('dialout', result.status, result.message, result.code);
        res.send({ "success": true });
      }
    );
  };

  function route(rest) {
    rest.post('/twilio/dial', voice.dialout);
  }

  return { route: route };
};
