'use strict';

var PromiseA = require('bluebird').Promise;
var UUID = require('uuid');
var secretutils = require('secret-utils');
var validate = require('./st-validate').validate;
var request = require('request');
var requestAsync = PromiseA.promisify(request);

function rejectableRequest(req, res, promise, msg) {
  return promise.error(function (err) {
    res.error(err);
  }).catch(function (err) {
    console.error('[ERROR] \'' + msg + '\'');
    console.error(err);

    res.error(err);

    throw err;
  });
}

function promiseRequest(req, res, promise, msg) {
  return promise.then(function (result) {
    res.send(result);
  }).error(function (err) {
    res.error(err);
  }).catch(function (err) {
    console.error('[ERROR] \'' + msg + '\'');
    console.error(err);

    res.error(err);

    throw err;
  });
}

module.exports.createController = function (config, DB, ContactNodes) {
  ContactNodes = ContactNodes.ContactNodes || ContactNodes;
  var AuthCodes = require('./authcodes').create(DB);
      // TODO make these maybe a little bit better
    //, salts = [secretutils.url64(192), secretutils.url64(192)]

  // used to create tokens that will expire every 30 minutes
  /*
  setInterval(function () {
    salts.pop();
    salts.unshift(secretutils.url64(192));
  }, 15 * 60 * 1000);
  */

  function Logins() {
  }

  Logins.sendEmailCode = function (mailconf, subject, message, $code) {
    var email = $code.get('loginNode')
      , mailer = require('./comms/mailer').Mailer.create(mailconf.service, mailconf.opts)
      ;

    // TODO provide link?
    // console.log('## AUTH CODE ID', $code.get('uuid'));
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

  Logins.sendPhoneCode = function (twilconf, sms, $code) {
    var phone = $code.get('loginNode')
      , texter = require('./comms/texter').Texter.create('twilio', twilconf)
      ;

    return texter.send({
      to: phone
    , from: twilconf.systemNumber || twilconf.number
    , body: sms
        .replace(/{{\s*code\s*}}/ig, $code.get('code'))
        .replace(/{{\s*app\s*}}/ig, 'App')
        .replace(/{{\s*uuid\s*}}/ig, $code.get('uuid'))
    });
  };

  Logins.getClaimCode = function (type, node) {
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

  Logins.sendAuthCode = function (conf, messages, $code) {
    var mailconf;
    var twilconf;
    var type = $code.get('nodeType');

    switch(type) {
      case 'email':
        mailconf = conf.mailer || config.mailer;
        return Logins.sendEmailCode(mailconf, messages.subject, messages.message, $code).then(function () {
          return $code;
        });
        //break;
      case 'phone':
        twilconf = conf.twilio || config.twilio;
        return Logins.sendPhoneCode(twilconf, messages.sms, $code).then(function () {
          return $code;
        });
        //break;
      default:
        return PromiseA.reject(new Error("Could not handle " + type));
        //break;
    }
  };

  Logins.validateClaimCode = function (type, node, id, code, opts) {
    opts = opts || {};
    var fnode = ContactNodes.formatters.phone(node)
          || ContactNodes.formatters.email(node)
      , checkId = secretutils.md5sum('claim-login:' + fnode)
      ;

    //opts.checkId = checkId;
    return AuthCodes.validate(
      id
    , code
    , { checkId: checkId, destroyOnceUsed: opts.destroyOnceUsed, skipSpeedCheck: opts.skipSpeedCheck }
    ).then(function (validated) {
      if (!validated) {
        return PromiseA.reject(new Error("code was not valid"));
      }

      return true;
    });
  };

  /*
  Logins.upsertContactNodes = function (type, node) {
    return DB.ContactNodes.forge({ type: type, node: node });
  };
  */

  // Verify that all claims are valid before actually claiming them
  Logins.preClaimContactNodes = function (contactnodes, opts) {
    var ps = [];

    // TODO provide ability to limit to one email, one phone, one username
    contactnodes.forEach(function (cn) {
      var p;

      if (!cn.type) {
        cn.type = ContactNodes.getNodeType(cn.node);
      }

      if (opts.skipExists) {
        // this option is for the case of proxying logins to remote systems
        // generally it should not be used
        p = PromiseA.resolve(true);
      } else if ('username' === cn.type) {
        //console.log('username');
        p = Logins.checkMultiauth(cn.type, cn.node).then(function (multiauth) {
          if (multiauth) {
            //console.log('username rr');
            return PromiseA.reject(new Error("username '" + cn.node + "' not available"));
          }
          //console.log('username done');
          return true;
        }).catch(function (err) {
          console.error('[ERROR username claim]');
          console.error(cn);
          throw err;
        });
      } else {
        //console.log('nodething');
        p = Logins.validateClaimCode(
          cn.type
        , cn.node
        , cn.uuid || cn.id
        , cn.code
        , { destroyOnceUsed: false, skipSpeedCheck: opts.skipSpeedCheck }
        ).catch(function (err) {
          console.error('[ERROR validate claim]');
          console.error(cn);
          throw err;
        });
      }

      ps.push(p);
    });

    return PromiseA.all(ps).then(function (claims) {
      ps = [];

      var err;

      if (!claims.every(function (c, i) {
        if (true !== c) {
          err = new Error(contactnodes[i] + ' did not pass claim validation ' + c);
          return false;
        }

        return true;
      })) {
        // if any fails, they all fail
        return PromiseA.reject(err);
      }

      // if none fail, continue
      return null;
    });
  };

  Logins.claimContactNodes = function (contactnodes, opts) {
    /*
    console.log('[LOG] Logins.claimContactNodes contactnodes');
    console.log(contactnodes);
    console.log('[LOG] Logins.claimContactNodes opts');
    console.log(opts);
    */

    opts = opts || {};

    var ps = [];

    return Logins.preClaimContactNodes(contactnodes, opts).then(function () {
      contactnodes.forEach(function (cn) {
        var p
          ;

        if ('username' === cn.type) {
          p = PromiseA.resolve();
        } else {
          p = Logins.validateClaimCode(
            cn.type
          , cn.node
          , cn.uuid
          , cn.code
          , { destroyOnceUsed: opts.destroyOnceUsed, skipSpeedCheck: true }
          );
        }

        p = p.then(function () {
          //console.log("[Login ContactNodes]", cn.type, cn.node);
          return ContactNodes.upsert(cn.type, cn.node).then(function ($cn) {
            //console.log("[Login ContactNodes] result", $cn.toJSON());
            return $cn;
          });
        });

        ps.push(p);
      });

      return PromiseA.all(ps);
    });
  };
  Logins.createLoginOnly = function (secret, recoverynodes, opts) {
    opts = opts || {};

    var $login = DB.Logins.forge()
        // TODO always be deterministic instead of random
      , loginId = opts.uid || UUID.v4()
      , creds = secretutils.createShadow(secret)
      ;

    console.log('[Logins] createLoginOnly loginId', loginId);

    //console.info('[Logins.createLoginOnly] secret');
    //console.log(secret);
    //console.info('[Logins.createLoginOnly] recoverynodes');
    //console.log(recoverynodes);
    if (!Array.isArray(recoverynodes) || !recoverynodes.length) {
      console.warn('TODO: reject unrecoverable logins');
    }

    return $login
      .save(
        { uid: loginId
        , type: 'local'
        , hashid: secretutils.md5sum('local:' + loginId)
        , shadow: creds.shadow
        , salt: creds.salt
        , hashtype: creds.hashtype
        , recoverynodes: recoverynodes
        , profile: opts.profile || {}
        }
      , { method: 'insert'
        }
      ).catch(function (err) {
        console.error(err);
        return PromiseA.reject(new Error('Unknown database error. See logs.'));
      });
  };

  Logins.addContactNodes = function ($login, $contactnodes, opts) {
    // TODO allow recovery-only nodes
    //return $login.related('contactnodes').attach($contactnodes);
    opts = opts || {};

    var ps = []
      ;

    $contactnodes.forEach(function ($cn) {
      var p
        ;
        
      //console.log('[ln] new $cn');
      //console.log($cn.toJSON());
      p = DB.LoginNodes.forge({ contactnodeId: $cn.id }).fetch().then(function ($ln) {
        if (!$ln) {
          //console.log('[ln] no existing loginnode');
          return null;
        }

        if ($ln.get('loginId') !== $login.id) {
          if (!opts.validated) {
            //console.log('[ln] already claimed, error: not switching');
            return PromiseA.reject(new Error($cn.get('node')
              + " is already claimed by another account. " // meaning login
              + "Please use the confirmation code to claim it. "
            ));
          }

          //console.log('[ln] already claimed, but switching claim');
          return $ln;
        }

        //console.log('[ln] already has cn');
        return $ln;
      });

      ps.push(p);
    });

    // TODO how to make this an atomic transaction?
    return PromiseA.all(ps).then(function ($lns) {
      var $cns = $contactnodes.slice(0)
        , ps2 = []
        ;

      $lns.forEach(function ($ln, i) {
        var $cn = $cns[i]
          , p2
          ;

        if (!$ln) {
          //console.log('[ln] double check none, creating');
          p2 = DB.LoginNodes.forge().save({
            id: UUID.v4() // todo nix the id
          , loginId: $login.id
          , contactnodeId: $cn.id
          , validatedAt: opts.validated && (new Date().toISOString()) || null
          }, { method: 'insert' });

          ps2.push(p2);
          return;
        }

        if ($ln.get('loginId') === $login.id && $ln.get('contactnodeId') === $cn.id) {
          //console.log('[ln] the same, leaving as is');
          $ln._processed = true;
          $ln._noChange = true;

          ps2.push(PromiseA.resolve($ln));
          return;
        } else {
          $ln._processed = true;
          $ln._oldLn = $ln.toJSON();

          //console.log('[ln] creating new L-' + $login.id, 'CN-' + $cn.id, $cn.get('node'));
          p2 = $ln.save({
            loginId: $login.id
          , contactnodeId: $cn.id
          , validatedAt: opts.validated && (new Date().toISOString()) || null
          }, { method: 'update' });

          ps2.push(p2);
          return;
        }
      });

      return PromiseA.all(ps2).then(function ($lns) {
        return $lns;
      }).error(function (err) {
        // TODO rollback
        // it's not likely that there would be a reason to rollback since everything
        // is double-checked before it is processed, however, it could happen that
        // two operations (an unprotected double-click take place simultaneously)
        // and in that instance the operation should succeed or fail completely.

        throw err;
      });
    });
  };
  Logins.removeContactNode = function ($login, type, node) {
    var fnode = ContactNodes.formatNode(type, node)
      , cnid = ContactNodes.getId(type, fnode)
      ;

    // TODO loop over and remove nodes, but don't allow the last
    // node to be removed

    // TODO when taking over a login, take over the accounts as well
    return $login.load(['loginnodes']).then(function () {
      var p
        ;

      if (!$login.related('loginnodes').some(function ($ln) {
        if (cnid === $ln.get('contactnodeId')) {
          p = $ln.destroy();
          return true;
        }
      })) {
        return PromiseA.reject(new Error("that contact is not associated with this login"));
      } else {
        return p;
      }
    });
  };

  Logins.upsert = function (/*contactnodes, secret, opts*/) {
    // check for login, return or create
    throw new Error('not yet implemented');
  };

  // NOTE to eliminate the possibility of partially created logins,
  // this is intentionally an all-or-nothing process
  Logins.create = function (contactnodes, secret, opts) {
    console.log('[Logins] create');
    opts = opts || {};

    // TODO allow adding unvalidated contacts?
    var minLen = opts.secretLen || 12;

    if (!opts.skipSecret && !(secret && secret.length >= minLen)) {
      // TODO move rules elsewhere (function in config? should be async)
      return PromiseA.reject(new Error('Must have a secret at least ' + minLen + ' characters long to create a login'));
    }

    return Logins.claimContactNodes(contactnodes, opts).then(function ($contactnodes) {
      return Logins.createLoginOnly(secret, opts.recoverynodes, opts).then(function ($login) {
        //console.log('[create Login Only]');
        //console.log($login.toJSON());

        // TODO uncreate login if adding nodes fails
        // TODO transaction or periodically delete partial logins
        //      or just required the userid? meh, it's close enough for now
        return Logins.addContactNodes(
          $login
        , $contactnodes
        , { validated: true }
        ).then(function (/*loginContactNodes (join table)*/) {
          return $login;
        });
      });
    });
  };

  /*
  Logins.addContactNode = function (contactnodes, secret) {
    return AuthCodes.validate(id, code, { checkId: checkId, destroyOnceUsed: true }).then(function (validated) {
    });
  };
  */

  Logins.getAndSendClaimCode = function (conf, type, node) {
    // TODO use per-app conf
    var messages = {}
      ;

    messages.subject = "{{ app }} EMAIL code: {{ code }}";
    messages.message = "Type {{ code }} into the EMAIL verification window"
      + " in the page on which you requested to verify your email address."
      // TODO could opening the link cause the desired tab to get focus on success?
      // + "\n\nIf you're no longer on the auth page you can click this link:"
      // + "\nhttps://local.helloworld3000.com/#validate-codes?uuid={{ uuid }}&code={{ code }}"
      + "\n\nIf you didn't request this verification code, please ignore this email."
      ;
    messages.sms = "{{ app }} SMS code: {{ code }}";

    return Logins.getClaimCode(type, node).catch(function (err) {
      console.error('[Logins.getClaimCode] cb 1', type, node, err);
      throw err;
    }).then(function ($code) {
      return Logins.sendAuthCode(conf, messages, $code).catch(function (err) {
        console.error('[Logins.sendAuthCode] cb 3', err);
        // TODO
        throw err;
      }).then(function ($code) {
        return $code;
      });
    });
  };

  Logins.checkMultiauthTypes = {};
  Logins.checkMultiauthTypes.ldsaccount = function (type, node) {
    return requestAsync({
      url: 'https://ldsaccount.lds.org/register/validateForm'
    , method: 'POST'
    , gzip: true
    , headers: {
        Origin: 'https://ldsaccount.lds.org'
      , 'Accept-Language': 'en-US'
      , 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.115 Safari/537.36'
      , 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      , Accept: 'application/json, text/javascript, */*; q=0.01'
      , Referer: 'https://ldsaccount.lds.org/register?friend=true&normalFlow=true'
      , 'X-Requested-With': 'XMLHttpRequest'
      }
    , form: {
        isMember: false
      , requireParentalConsent: false
      , parentalConsentType: ''
      , parentalConsentCountryCode: ''
      , smsRecover: false
      , emailRecover: false
      , 'userRegistrationInfo.personalInfo.sms.country': ''
      , 'userRegistrationInfo.userName': node
      , passwordInPlainText: false
      , acceptTandC: false
      }
    }).spread(function (resp, body) {
      try {
        body = JSON.parse(body);
      } catch(e) {
        return PromiseA.reject(new Error("json could not be parsed"));
      }

      // on LDS.org SUCCESS means the username can be created / doesn't exist
      if ('SUCCESS' === body.status) {
        return null;
      } else if ('ERROR' === body.status && /Username is not available/i.test(JSON.stringify(body.errors))) {
        return { nodes: [] };
      } else {
        console.error('[ERROR] Logins.checkMultiauthTypes.username - lds.org');
        console.error(body);
        return PromiseA.reject(new Error("could not check user id"));
      }
    });
  };
  Logins.checkMultiauthTypes.local = function (type, node) {
    var fnode = ContactNodes.formatNode(type, node);
    var cnid = ContactNodes.getId(type, fnode);

    if (!fnode) {
      return PromiseA.reject(new Error(node + " is not a valid contactnode"));
    }

    if (!cnid) {
      return PromiseA.reject(new Error(node + " could not be determined as email, phone, or username"));
    }

    return DB.LoginNodes
      .forge({ contactnodeId: cnid })
      //.on('query', function (q) { console.log(q); })
      .fetch({ withRelated: [/*'contactnode', */'login'] })
      .then(function ($ln) {
        return $ln && $ln.related('login').id && ($ln.related('login').get('multiauth') || { nodes: [] }) || null;
      });
  };
  Logins.checkMultiauthTypes.username = Logins.checkMultiauthTypes.local;
  Logins.checkMultiauthTypes.email = Logins.checkMultiauthTypes.local;
  Logins.checkMultiauthTypes.phone = Logins.checkMultiauthTypes.local;

  Logins.checkMultiauth = function (type, node) {
    type = type || ContactNodes.getNodeType(node);

    if ('username' === type) {
      // TODO check local and failover to checking ldsaccount
      // then report back with findings to show more detailed message
      type = 'ldsaccount';
    }

    if (!Logins.checkMultiauthTypes[type]) {
      return PromiseA.reject(new Error("unhandled check auth type '" + type + "'"));
    }

    return Logins.checkMultiauthTypes[type](type, node);
  };

  Logins.update = function ($login, accountsMap, updates) {
    var xattrs = updates.xattrs
      ;

    delete updates.xattrs;

    return validate({
      'primaryAccountId': ''
    , 'mostRecentAccountId': ''
    }, updates).then(function () {
      if (!accountsMap[updates.primaryAccountId]) {
        return PromiseA.reject(new Error("the specified account does not exist for this login"));
      }

      updates.xattrs = xattrs;
      return $login.save(updates);
    });
  };

  Logins.markAsChecked = function ($login) {
    $login.set('checketAt', parseInt(Date.now() / 1000, 10));
    return $login.save();
  };

  Logins.getByNode = function (type, node) {
    var fnode = ContactNodes.formatNode(type, node)
      , cnid = ContactNodes.getId(type, fnode)
      ;

    /*
    console.log('[Logins.getByNode]');
    console.log(type, node);
    console.log('cnid', cnid);
    */
    if (!cnid) {
      return PromiseA.reject(new Error("invalid login (could not be formatted)"));
    }

    return DB.LoginNodes
      .forge({ contactnodeId: cnid })
      //.on('query', function (q) { console.log(q); })
      .fetch({ withRelated: ['login', 'login.loginnodes', 'login.contactnodes', 'login.accounts'] })
      .then(function ($ln) {
        if (!$ln) {
          return PromiseA.reject(new Error("invalid login (could not be found)"));
        }

        //console.log('loginnode', $ln.toJSON());
        //console.log('login', $ln.related('login'));
        if (!$ln.related('login').id) {
          console.error(cnid, $ln.get('contactnodeId'), $ln.get('loginId'));
          return PromiseA.reject(new Error("invalid login (the contact node has no associated login)"));
        }

        return $ln.related('login');
      });
  };

  Logins.createLdsAccount = function (type, node, session) {
    // token, jar, user, ward
    //console.log(session);
    return Logins.create(
      [{ type: 'username', node: node }]
      // the real secret is not hashed on our system
      // but we create a bogus secret just to be safe
    , UUID.v4() // "" // null
    , { skipSecret: true
      , skipExists: true
      , uid: node
      , profile: { token: session.token, details: session.user, ts: Date.now() }
        // recovery is handled by lds.org
      , recoverynodes: []
        // multiauth should be handled by lds.org
      , multiauth: []
      }
    ).then(function ($login) {
      return $login;
    });
  };
  Logins.loginTypes = {};
  Logins.loginTypes.ldsaccount = function (type, node, secret/*, tokens*//*, opts*/) {
    // TODO handle account creation separately
    console.log('[Logins] loginTypes.ldsaccount');

    // TODO get less info on login?
    return require('./lds-account').login({ username: node, password: secret }).then(function (session) {
      secret = '[PROTECTED]';
      // TODO store data in database by email, phone number, ward, etc
      // TODO find or create user in our own system

      return Logins.getByNode('username', node).then(function ($login) {
        var profile = $login.get('profile');

        Object.keys(session).forEach(function (key) {
          if ('jar' === key) {
            return;
          }
          profile[key] = session[key];
        });
        /*
        profile.token = session.token;
        profile.details = session.user;
        profile.directory = session.ward;
        */
        profile.ts = Date.now();
        $login.set('profile', profile);

        /*
        // my details... ish (may not work for spouses)
        login.directory.households.forEach(function (h) {
          if (session.logins[0].details.individualId == h.headOfHouseIndividualId) {
            console.log({
              name: h.headOfHouse.preferredName
            , phone: h.phone
            , phone2: h.headOfHouse.phone
            , email: h.emailAddress
            , email2: h.headOfHouse.email
            });
          }
        });

        // my home stake / ward
        session.logins[0].details.units.forEach(function (stake) {
          console.log(stake);
          stake.localUnits.forEach(function (ward) {
            if (session.logins[0].details.homeUnitNbr === ward.unitNo) {
              homeStake = stake;
              homeWard = ward;
            }
            console.log(ward.unitName);
          });
        });

        // TODO my calling
        // TODO my bishop, ward clerk
        login.directory.households.forEach(function (h) {
          console.log(h.headOfHouse.individualId);
          if (!h.headOfHouse.individualId) { console.log(h); }
        });
        */

        return $login.save();
      }).error(function (err) {
        console.error('createLdsAccount');
        console.error(err);
        // catchable errors are due to the account not existing
        return Logins.createLdsAccount(type, node, session);
      });
    });
  };
  Logins.loginTypes.local = function (type, node, secret/*, opts*/) {
    // TODO email / phone go here
    return Logins.getByNode(type, node).then(function ($login) {
      var valid
        ;

      //console.log("getByNode $login", $login);
      // TODO could use tokens without secret?
      valid = secretutils.testSecret(
        $login.get('salt')
      , secret
      , $login.get('shadow') // hashed version
      , $login.get('hashtype')
      );

      if (!valid) {
        return PromiseA.reject(new Error("invalid secret"));
      }

      if (!$login.get('multiauth') || !Array.isArray($login.get('multiauth').nodes)) {
        $login.set('multiauth', { nodes: [] });
      }

      if (!$login.get('multiauth').length) {
        return $login;
      }

      // TODO figure out which codes to send
      return new Error('multi-factor auth not yet implemented');
    });
  };
  Logins.loginTypes.username = Logins.loginTypes.local;
  Logins.loginTypes.email = Logins.loginTypes.local;
  Logins.loginTypes.phone = Logins.loginTypes.local;

  Logins.login = function (type, node, secret/*, tokens*/, opts) {
    console.log('[Logins] login');
    // TODO 'type' should hint when guessing (i.e. #aj might be slack, instagram, etc)
    type = type || ContactNodes.getNodeType(node/*, type*/);

    if ('username' === type) {
      type = 'ldsaccount';
    }

    if (!Logins.loginTypes[type]) {
      return PromiseA.reject(new Error("unhandled login type '" + type + "'"));
    }

    return Logins.loginTypes[type](type, node, secret, opts);
  };

  //
  // TODO upsert by requesting reset on a non-existant account
  //

  Logins.getResetCode = function (type, node) {
    // Make sure the account exists
    return Logins.getByNode(type, node).then(function (/*$login*/) {
      return Logins.getClaimCode(type, node);
    });
  };

  Logins.updateLoginSecret = function ($login, secret) {
    var creds = secretutils.createShadow(secret)
      ;

    // updateSecret
    return $login.save(
      { shadow: creds.shadow
      , salt: creds.salt
      , hashtype: creds.hashtype
      }
    , { method: 'update'
      }
    );
  };

  Logins.validateResetCode = function (type, node, secret, id, code, opts) {
    // opts = {skipSpeedCheck, destroyOnceUsed}
    return Logins.getByNode(type, node).then(function ($login) {
      return Logins.validateClaimCode(type, node, id, code, opts).then(function (validated) {
        // already returns error if not true
        if (!validated) {
          throw new Error("unexpected validate claim code failure");
        }

        return Logins.updateLoginSecret($login, secret);
      });
    });
  };

  Logins.destroy = function ($login) {
    var ps = []
      ;

    // TODO destroy loginnode and login
    return $login.load(['loginnodes']).then(function () {
      $login.related('loginnodes').forEach(function ($ln) {
        ps.push($ln.destroy());
      });

      return PromiseA.all(ps).then(function () {
        return $login.destroy();
      });
    });
  };

  return Logins;
};
module.exports.createRestless = module.exports.createController;

module.exports.createView = function (config, DB, manualLogin, ContactNodes) {
  var Logins = module.exports.createController(config, DB, ContactNodes);

  // TODO create a custom strategy instead
  // I'm fairly certain that res.send() will never be called
  // because I'm overwriting passport's default behavior in
  // sessionlogic/local.js an provide my own handler in sessionlogic/index.js
  // 
  // Remember that passport was designed to be used with connect,
  // so if there's a bug where the promise is never fulfilled, it's worth
  // looking here to see if this is the culprit.
  function wrapManualLogin(req, res) {
    return function (uid, secret) {
      return new PromiseA(function (resolve, reject) {
        manualLogin(uid, secret, req, res, function (err, user) {
          if (err) {
            reject(err);
            return;
          }

          //console.log('[accounts] [user]');
          //console.log(user);
          resolve(user);
        }, { wrapped: true });
      });
    };
  }

  Logins.restful = {};

  Logins.restful.validateResetCode = function (req, res) {
    var secret = req.body.secret
      , node = req.body.node
      , type = req.body.type || ContactNodes.getNodeType(node)
        // TODO don't call it uuid, call it authid or something else
      , id = req.body.uuid
      , code = req.body.code
      ;

    var promise = Logins.validateResetCode(type, node, secret, id, code).then(function () {
      // TODO mail password changed notification here $login.get('public').emails
      console.log('[logins.js] TODO: Mail password changed notification');
      return { success: true };
    });
    
    return promiseRequest(req, res, promise, "validate reset code");
  };

  Logins.restful.getResetCode = function (req, res) {
    var messages = {}
      , node = req.body.node
      , type = req.body.type || ContactNodes.getNodeType(node)
      , conf = (req.user.$client || req.$client || req.client).get('config')
      ;

    messages.subject = "Your login reset code is {{ code }}";
    messages.message = "Type {{ code }} into the login reset window"
      + " in the page on which you requested to verify your email address."
      + "\n\nIf you didn't request this login reset code, please ignore this email."
      ;
    messages.sms = "Your login reset code is {{ code }}";

    var promise = Logins.getResetCode(type, node).then(function ($code) {
      return Logins.sendAuthCode(conf, messages, $code);
    }).then(function ($code) {
      return { uuid: $code.id };
    });

    return promiseRequest(req, res, promise, "get reset code");
  };

  Logins.restful.upsert = function (req, res) {
    console.log('[Logins] restful.upsert');

    var creds = req.body;
    var promises = [];

    if ('string' !== typeof creds.secret) {
      res.send({ error: { message: "missing secret" } });
      return;
    }

    if (!Array.isArray(creds.nodes)) {
      res.error({ message: "nodes should be an array of login nodes" });
      return;
    }

    creds.nodes.forEach(function (node) {
      // TODO allow backup email / phone that is not used for login
      promises.push(Logins.login(node.type, node.node, node.secret).catch(function () {
      }));
    });

    return PromiseA.all(promises).then(function () {
    }).catch(function (err) {
      res.error(err);
      throw err;
    });
  };

  Logins.restful.getClaimCode = function (req, res) {
    var node = req.body.node;
    var type = req.body.type || ContactNodes.getNodeType(node);
    var $client = (req.user && req.user.$client || req.$client || req.client);
    var conf = $client && ($client.get && $client.get('config') || $client.config) || {};

    var promise = Logins.getAndSendClaimCode(conf, type, node).then(function ($code) {
      return { uuid: $code.id };
    });

    return promiseRequest(req, res, promise, "Logins.restful.getClaimCode");
  };

  Logins.restful.getClaimCodes = function (req, res) {
    var $client = (req.user && req.user.$client || req.$client || req.client);
    //console.log("Logins.restful.getClaimCodes $client");
    //console.log($client);
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
        Logins.getAndSendClaimCode(conf, type, node.node)
          .then(function ($code) {
            return { uuid: $code.id };
          })
          .catch(function (err) {
            console.error("Logins.restful.getClaimCodes");
            console.error(err);
            throw err;
            //return { error: err.message || err.toString() };
          })
      );
    });

    return promiseRequest(req, res, PromiseA.all(promises), "getClaimCodes");
  };

  Logins.restful.create = function (req, res) {
    console.log('[Logins] restful.create');

    var secret = req.body.secret;
    var nodes = req.body.nodes;
    var recoverynodes;
    var loginnodes;
    var multiauth = req.body.multiauth || req.body.multifactor;
    
    if (!Array.isArray(nodes)) {
      res.error(new Error("nodes was not an array of contactnodes"));
      return;
    }

    if ('object' !== typeof multiauth || !Array.isArray(multiauth.nodes)) {
      res.error(new Error("multiauth was not specified. Use { nodes: [] } to explicitly set no multi-auth"));
      return;
    }


    recoverynodes = nodes.map(function (node) {
      return {
        type: node.type
      , node: node.node
      };
    });
    loginnodes = nodes.filter(function (node) {
      return 'username' === node.type || (node.code && node.claim);
    });

    var promise = Logins.create(
      loginnodes
    , secret
    , { recoverynodes: recoverynodes, multiauth: multiauth }
    ).then(function ($login) {
      var manualLoginWrapped;

      if ($login) {
        manualLoginWrapped = wrapManualLogin(req, res);
        return manualLoginWrapped(loginnodes[0].node, secret);
      }
    }).then(function () {
      res.redirect(303, config.apiPrefix + '/session');
    });
    
    return rejectableRequest(req, res, promise, "Logins.restful.create");
  };

  Logins.restful.check = function (req, res) {
    var promise;

    // TODO maybe return error on string null?
    if ('null' === req.params.type || 'undefined' === req.params.type || !req.params.type) {
      req.params.type = null;
    }

    if ('null' === req.params.type || 'undefined' === req.params.type || !req.params.node) {
      req.params.node = null;
    }

    if (!req.params.node) {
      res.error(new Error("please supply a username"));
    }

    // TODO check type
    promise = Logins.checkMultiauth(req.params.type, req.params.node).then(function (multiauth) {
      return { exists: !!multiauth || false };
    });
    
    return promiseRequest(req, res, promise, "Logins.restful.check");
  };

  Logins.restful.validateClaimCode = function (req, res) {
    var type = req.body.type;
    var node = req.body.node;
    var id = req.body.uuid || req.body.id;
    var code = req.body.code;

    var promise = Logins.validateClaimCode(type, node, id, code, { destroyOnceUsed: false }).then(function () {
      return {
        type: type
      , node: node
      , validated: true
      };
    });
    
    return promiseRequest(req, res, promise, "Logins.restful.validateClaimCode");
  };
  Logins.restful.validateClaimCodes = function (req, res) {
    var codes = req.body;
    var promises = [];

    codes.forEach(function (code) {
      var type = code.type;
      var node = code.node;
      var id = code.uuid || code.id;
      var _code = code.code;

      // TODO validate that all the required props are there (or give great error message)

      promises.push(Logins.validateClaimCode(type, node, id, _code, { destroyOnceUsed: false }).then(function () {
        return {
          type: type
        , node: node
        , validated: true
        };
      }).catch(function (err) {
        throw err;
        //return { error: { message: err.message || err.toString() } };
      }));
    });

    return promiseRequest(req, res, PromiseA.all(promises), "Logins.restful.validateClaimCodes");
  };

  // Yes, I am aware that I'm using passport exactly the wrong way here
  // and, yes, I do intend to fix it at some point
  Logins.restful.login = function (req, res) {
    console.log('[Logins] restful.login');

    var type = req.body.type;
    var node = req.body.node || req.body.uid;
    var secret = req.body.secret;
    var tokens = req.body.tokens || [];

    var promise = Logins.login(type, node, secret, tokens).then(function ($login) {
      var manualLoginWrapped;

      if ($login) {
        manualLoginWrapped = wrapManualLogin(req, res);
        return manualLoginWrapped(node, secret);
      }
    }).then(function () {
      res.redirect(303, config.apiPrefix + '/session');
    }).error(function (err) {
      if (!(err || err.message)) {
        err = err || {};
        err.message = "couldn't create login nor use the supplied credentials";
      }
      res.error(err);
    });

    return rejectableRequest(req, res, promise, "LOGIN LOGIN");
  };

  Logins.restful.reset = function (req, res) {
    var auth = { uid: req.body.uid };
    var promise = Logins.reset(auth).then(function ($code) {
      return { uuid: $code.id };
    });

    promiseRequest(req, res, promise, "RESET LOGIN");
  };

  Logins.restful.markAsChecked = function (req, res) {
    var $login = req.$login;
    var promise = Logins.markAsChecked($login).then(function () {
      return { success: true };
    });

    return promiseRequest(req, res, promise, "logins markAsChecked");
  };
  Logins.restful.update = function (req, res) {
    var $login = req.$login
      , updates = req.body
      , accountsMap = req.accountsMap
      ;

    var promise = Logins.update($login, accountsMap, updates).then(function () {
      return { success: true };
    });

    return promiseRequest(req, res, promise, "logins update");
  };

  Logins.restful.updateSecret = function (req, res) {
    var auth = { uid: req.body.uid, secret: req.body.secret, newSecret: req.body.newSecret }
      ;

    var promise = Logins.updateSecret(auth).then(function () {
      return { success: true };
    });

    return promiseRequest(req, res, promise, "LOGIN UPDATE SECRET");
  };

  Logins.restful.validateReset = function (req, res) {
    var authcode = { id: req.params.authid, code: req.params.authcode };
    var auth = { uid: req.body.uid, secret: req.body.secret };
    var promise = Logins.validateReset(auth, authcode).then(function () {
      var manualLoginWrapped = wrapManualLogin(req, res);

      return manualLoginWrapped(auth.uid, auth.secret).then(function () {
        res.redirect(303, config.apiPrefix + '/session');
      });
    });
    
    rejectableRequest(req, res, promise, "LOGIN VALIDATE RESET");
  };

  return Logins;
};
module.exports.createRestful = module.exports.createView;

module.exports.create = module.exports.createRouter = function (app, config, DB, manualLogin, ContactNodes) {
  var Logins
    ;

  Logins = module.exports.createView(config, DB, manualLogin, ContactNodes.ContactNodes || ContactNodes);

  function requireLogin(req, res, next) {
    var hashid = req.params.hashid
      //, uid = req.params.uid || req.body.uid
      , reqUser = req.user
      ;

    reqUser.logins.forEach(function ($login) {
      if (hashid === $login.id) {
        req.$login = $login;
      }
    });

    if (!req.$login) {
      res.error({ message: "invalid login id" });
      return;
    }

    req.accountsMap = {};
    req.$login.related('accounts').forEach(function ($acc) {
      req.accountsMap[$acc.id] = $acc;
    });

    next();
  }

  function route(rest) {
    // Create a new account
    //rest.post('/logins', Logins.restful.upsert);
    rest.post('/logins/login', Logins.restful.login);
    rest.post('/logins/create', Logins.restful.create);
    rest.post('/logins/code', Logins.restful.getClaimCode);
    rest.post('/logins/codes', Logins.restful.getClaimCodes);
    rest.post('/logins/code/validate', Logins.restful.validateClaimCode);
    rest.post('/logins/codes/validate', Logins.restful.validateClaimCodes);

    // TODO guard with AppID
    rest.get('/logins/check/:type/:node', Logins.restful.check);
    rest.get('/logins/check/:node', Logins.restful.check);

    rest.post('/logins/reset', Logins.restful.reset);
    rest.post('/logins/reset/:authid/:authcode', Logins.restful.validateReset);
    rest.post('/logins/:uid/reset', Logins.restful.reset);
    rest.post('/logins/:uid/reset/:authid/:authcode', Logins.restful.validateReset);

    rest.post('/logins/:hashid', requireLogin, Logins.restful.update);
    rest.post('/logins/:hashid/secret', requireLogin, Logins.restful.updateSecret);

    rest.post('/logins/ldsaccount/:hashid/mark-as-checked', requireLogin, Logins.restful.markAsChecked);
  }

  return {
    route: route
  , Logins: Logins
  };
};
