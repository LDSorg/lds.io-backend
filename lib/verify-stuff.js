'use strict';

var PromiseA = require('bluebird').Promise;
//var UUID = require('uuid');
var secretutils = require('secret-utils');
//var rejectableRequest = require('./common').rejectableRequest;
var promiseRequest = require('./common').promiseRequest;

module.exports.createController = function (config, DB, ContactNodes) {
  var AuthCodes = require('./authcodes').create(DB);

  function Verifier() {
  }

  Verifier.getAndSendClaimCode = function (conf, type, node) {
    // TODO use per-app conf
    var messages = {};

    messages.subject = "{{ app }} EMAIL code: {{ code }}";
    messages.message = "Type {{ code }} into the EMAIL verification window"
      + " in the page on which you requested to verify your email address."
      // TODO could opening the link cause the desired tab to get focus on success?
      // + "\n\nIf you're no longer on the auth page you can click this link:"
      // + "\nhttps://local.helloworld3000.com/#validate-codes?uuid={{ uuid }}&code={{ code }}"
      + "\n\nIf you didn't request this verification code, please ignore this email."
      ;
    messages.sms = "{{ app }} SMS code: {{ code }}";

    return Verifier.getClaimCode(type, node).then(function ($code) {
      return Verifier.sendAuthCode(conf, messages, $code).then(function ($code) {
        return $code;
      });
    });
  };

  Verifier.sendEmailCode = function (mailconf, subject, message, $code) {
    var email = $code.get('loginNode');
    var mailer = require('./comms/mailer').Mailer.create(mailconf.service, mailconf.opts);

    // TODO provide link?
    return mailer.send({
      from: mailconf.defaults.system
    , to: email
    //, bcc: opts.mailer.defaults.bcc
    //, replyTo: (contact.name || texterName)
    //    + ' <' + texterEmail + '>'
    , subject: subject
        .replace(/{{\s*code\s*}}/ig, $code.get('code'))
        .replace(/{{\s*app\s*}}/ig, 'App')
    , text: message
        .replace(/{{\s*code\s*}}/ig, $code.get('code'))
        .replace(/{{\s*app\s*}}/ig, 'App')
        .replace(/{{\s*uuid\s*}}/ig, $code.get('uuid'))
    //, html: ""
    });
  };

  Verifier.sendPhoneCode = function (twilconf, sms, $code) {
    var phone = $code.get('loginNode');
    var texter = require('./comms/texter').Texter.create('twilio', twilconf);

    return texter.send({
      to: phone
    , from: twilconf.systemNumber || twilconf.number
    , body: sms
        .replace(/{{\s*code\s*}}/ig, $code.get('code'))
        .replace(/{{\s*app\s*}}/ig, 'App')
        .replace(/{{\s*uuid\s*}}/ig, $code.get('uuid'))
    });
  };

  Verifier.getClaimCode = function (type, node) {
    // TODO first check if this is the only login on another account
    var id;
    var fnode;
    var hriOpts;
    
    if ('email' === type) {
      // TODO implement this in hri module
      hriOpts = { format: '{{adj}}-{{n}}-{{#}}' };
    }

    if (!ContactNodes.validators[type]) {
      return PromiseA.reject(new Error("Did not understand " + type));
    }

    if (!ContactNodes.validators[type](node)) {
      return PromiseA.reject(new Error("That doesn't look like a valid " + type));
    }

    switch(type) {
      case 'email':
        fnode = ContactNodes.formatters.email(node);
        break;
      case 'phone':
        fnode = ContactNodes.formatters.phone(node);
        break;
      default:
        return PromiseA.reject(new Error("Could not handle " + type));
        //break;
    }

    id = secretutils.md5sum('claim-login:' + fnode);

    return AuthCodes.create({ checkId: id, hri: hriOpts }).then(function ($code) {
      $code.set('loginNode', fnode);
      $code.set('nodeType', type);

      return $code.save().then(function () {
        return $code;
      });
    });
  };

  Verifier.sendAuthCode = function (conf, messages, $code) {
    var mailconf;
    var twilconf;
    var type = $code.get('nodeType');

    switch(type) {
      case 'email':
        mailconf = conf.mailer || config.mailer;
        return Verifier.sendEmailCode(mailconf, messages.subject, messages.message, $code).then(function () {
          return $code;
        });
        //break;
      case 'phone':
        twilconf = conf.twilio || config.twilio;
        return Verifier.sendPhoneCode(twilconf, messages.sms, $code).then(function () {
          return $code;
        });
        //break;
      default:
        return PromiseA.reject(new Error("Could not handle " + type));
        //break;
    }
  };

  Verifier.validateClaimCode = function (type, node, id, code, opts) {
    opts = opts || {};
    var fnode = ContactNodes.formatters.phone(node)
          || ContactNodes.formatters.email(node)
          ;
    var checkId = secretutils.md5sum('claim-login:' + fnode);

    //opts.checkId = checkId;
    return AuthCodes.validate(
      id
    , code
    , { checkId: checkId
      , destroyOnceUsed: opts.destroyOnceUsed
      , skipSpeedCheck: opts.skipSpeedCheck
      }
    ).then(function (validated) {
      if (!validated) {
        return PromiseA.reject(new Error("code was not valid"));
      }

      return true;
    });
  };

  //Verifier.preClaimContactNodes;
  //Verifier.claimContactNodes

  return Verifier;
};

module.exports.createView = function (config, DB, ContactNodes) {
  var Verifier = module.exports.createController(config, DB, ContactNodes);

  Verifier.restful = {};

  Verifier.restful.getClaimCode = function (req, res) {
    var promise = PromiseA.resolve().then(function () {
      var node = req.body.node;
      var type = req.body.type || ContactNodes.getNodeType(node);
      var $client = req.oauth3.$client;
      var conf = $client.get('config') || {};

      return Verifier.getAndSendClaimCode(conf, type, node).then(function ($code) {
        return { uuid: $code.id };
      });

    });

    return promiseRequest(req, res, promise, "Verifier.restful.getClaimCode");
  };

  Verifier.restful.getClaimCodes = function (req, res) {
    var $client = (req.user && req.user.$client || req.$client || req.client);
    var conf = $client && ($client.get && $client.get('config') || $client.config) || {};
    var promises = [];
    var nodes = req.body;
    
    if (!Array.isArray(nodes)) {
      res.error(new Error("bad request: no nodes array"));
      return;
    }

    nodes.forEach(function (node) {
      var type = ContactNodes.getNodeType(node.node);

      promises.push(
        Verifier.getAndSendClaimCode(conf, type, node.node).then(function ($code) {
          return { uuid: $code.id };
        })
      );
    });

    return promiseRequest(req, res, PromiseA.all(promises), "getClaimCodes");
  };

  Verifier.restful.validateClaimCode = function (req, res) {
    var type = req.body.type;
    var node = req.body.node;
    var id = req.body.uuid || req.body.id;
    var code = req.body.code;

    var promise = Verifier.validateClaimCode(type, node, id, code, { destroyOnceUsed: false }).then(function () {
      return {
        type: type
      , node: node
      , validated: true
      };
    });
    
    return promiseRequest(req, res, promise, "Verifier.restful.validateClaimCode");
  };

  Verifier.restful.validateClaimCodes = function (req, res) {
    var codes = req.body;
    var promises = [];

    codes.forEach(function (code) {
      var type = code.type;
      var node = code.node;
      var id = code.uuid || code.id;
      var _code = code.code;

      // TODO validate that all the required props are there (or give great error message)

      promises.push(
        Verifier.validateClaimCode(type, node, id, _code, { destroyOnceUsed: false }).then(function () {
          return {
            type: type
          , node: node
          , validated: true
          };
        })
      );
    });

    return promiseRequest(req, res, PromiseA.all(promises), "Verifier.restful.validateClaimCodes");
  };

  return Verifier;
};
