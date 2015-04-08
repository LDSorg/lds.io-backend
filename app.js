'use strict';

var PromiseA = require('bluebird');
var urlrouter = require('urlrouter');
var express = require('express-lazy');
var recase;

function initApi(config, Db, app) {
  // TODO maybe a main DB for core (Accounts) and separate DBs for the modules?
  var sessionLogic;
  var sessionStrategies;
  var sessionRouter;
    //, ws = require('./lib/ws')
    //, wsport = config.wsport || 8282
  var ru = config.rootUser;
  var Auth = require('./lib/auth-logic').create(Db, config);
  var ContactNodes = require('./lib/contact-nodes').create(config, Db);
  var Passport = require('passport').Passport;
  var passport;
  var CORS = require('connect-cors');
  var Logins = require('./lib/lds-logins');
  var loginsController = Logins.createController(config, Db, ContactNodes);
  var ldsConnectRestful;

  Object.defineProperty(config, 'host', {
    get: function () {
      if (
          'http' === this.protocol && '80' === this.port.toString()
        ||'https' === this.protocol && '443' === this.port.toString()
      ) {
        return this.hostname;
      }

      return this.hostname + ':' + this.port;
    }
  , enumerable: true
  });

  Object.defineProperty(config, 'href', {
    get: function() {
      return this.protocol + '://' + this.host;
    }
  , enumerable: true
  });

  config.apiPrefix = config.apiPrefix || '/api';

  app
    .use(config.oauthPrefix, function (req, res, next) {
        req.skipAuthn = true;
        next();
      })
    .use(config.sessionPrefix, function (req, res, next) {
        req.skipAuthn = true;
        next();
      })
    ;

  //
  // Generic Template Auth
  //
  passport = new Passport();

  // Allows CORS access to API with ?access_token=
  app.use('/api', CORS({ credentials: true, headers: [
    'X-Requested-With'
  , 'X-HTTP-Method-Override'
  , 'Content-Type'
  , 'Accept'
  , 'Authorization'
  ], methods: [ "GET", "POST", "PATCH", "PUT", "DELETE" ] }));

  //
  // Session Logic
  //
  //

  // initialize after all passport.use, but before any passport.authorize
  app
    .use(require('express-session')({
      secret: config.sessionSecret
    , httpOnly: true
    , secure: true
    , saveUninitialized: true // see https://github.com/expressjs/session
    , resave: false           // see https://github.com/expressjs/session
    }))
    .use(passport.initialize())
    .use(passport.session())
    ;

  if (config.snakeApi) {
    app.use(function (req, res, next) {
      if (!recase) {
        recase = require('connect-recase')({
          cancelParam: 'camel'
          // TODO allow explicit and or default flag
        , explicit: false
        , default: 'snake'
        , prefixes: [config.apiPrefix]
        , exceptions: {}
        });
      }

      if (!req.url.match(config.oauthPrefix)) {
        recase(req, res, next);
        return;
      }

      next();
    });
  }

  //
  // Disallow insecure connetions
  //
  app.use(config.apiPrefix, function (req, res, next) {
    var rejectableRequest = require('./lib/common').rejectableRequest;
    var promise;

    function go() {
      var referer = req.headers.referer || req.headers.origin;
      // TODO allow browsers and curl ??
      //var browser = /mozilla|curl|safari|opera/i.test(req.headers['user-agent']);

      if (!req.secure) {
        return PromiseA.reject("[Sanity Check Fail] Connection is insecure. See https://letsencrypt.org");
      }

      if (!referer) {
        // Probably a server-side request
        return PromiseA.resolve();
      }

      if (!/^(https|spdy):\/\//.test(referer)) {
        return PromiseA.reject("The web app requesting API access is insecure. See https://letsencrypt.org");
      }

      return PromiseA.resolve();
    }

    promise = go().then(next);

    rejectableRequest(req, res, promise, "checking security of connection");
  });

  //
  // Public APIs
  //
  //
  app
    .lazyApi('/public/apps', function () {
      return urlrouter(require('./lib/apps').createRouter(app, config, Db).route);
    })
    ;

  //
  // Session Logic Stuff
  //
  //

  // TODO move attaching the account into a subsequent middleware?
  sessionLogic = require('./lib/sessionlogic').init(
    passport
  , config
  , Auth
  , Auth.AppLogin // OauthClients
  , Auth.AccessTokens
  , loginsController
  );
  app.use(config.apiPrefix, sessionLogic.tryBearerSession);
  app.lazyMatch('/api/session', function () {
    if (!sessionRouter) {
      sessionRouter = urlrouter(sessionLogic.route);
    }
    return sessionRouter;
  });

  sessionStrategies = {
    'facebook.com': function () { return require('./lib/sessionlogic/providers/facebook'); }
  , 'google.com': function () { return require('./lib/sessionlogic/providers/google'); }
  //, loopback: require('./lib/sessionlogic/providers/loopback')
  //, ldsconnect: require('./lib/sessionlogic/providers/ldsconnect')
  //, twitter: require('./lib/sessionlogic/providers/twitter')
  //, tumblr: require('./lib/sessionlogic/providers/tumblr')

  // TODO Oauth3 style
  //  'facebook.com': function () { return require('./lib/sessionlogic/providers/facebook') }
  //, 'google.com': function () { return require('./lib/sessionlogic/providers/google') }
  };

  Object.keys(sessionStrategies).forEach(function (providerUri) {
    // TODO nix this badness
    var requireStrategy = sessionStrategies[providerUri];
    var sessionRouters = {};

    // TODO regexp
    // /api/oauth3/:providerUri/xyz
    // vs
    // /api/oauth3/xyz/:providerUri
    app.lazyMatch(config.oauthPrefix, function () {
      var strategy;

      if (!sessionRouters[providerUri]) {
        // TODO
        // Since the API prefix is sometimes necessary,
        // it's probably better to always require the
        // auth providers to use it manually

        // TODO providerUri should be enforced by the requirer, not the requiree
        strategy = sessionLogic.strategies[providerUri] = requireStrategy();
        // TODO change all to use 'createRouter' instead of 'init'
        sessionRouters[providerUri] = urlrouter((strategy.createRouter||strategy.init)(passport, config, { login: sessionLogic.loginWrapper }));
      }

      return function (req, res, next) {
        if (req.url.match(providerUri)) {
          sessionRouters[providerUri](req, res, next);
        } else {
          next();
        }
      };
    });
  });

  //
  // Generic Session / Login / Account Routes
  //
  app
    .lazyApi('/session', function () {
      // TODO root app
      require('./lib/fixtures/root-user').create(ru, Auth);
      return urlrouter(require('./lib/session').createRouter().route);
    })
    .lazyApi('/logins', function () {
      var loginsRestful;
      loginsRestful = Logins.createRouter(app, config, Db, sessionLogic.manualLogin, ContactNodes);
      return urlrouter(loginsRestful.route);
    })
    // TODO don't allow users without login
    .lazyApi('/accounts', function () {
      return urlrouter(require('./lib/accounts').createRouter(app, config, Db, Auth, loginsController).route);
    })
    ;

  app.lazyMatch(config.oauthPrefix, function () {
    var oauth2Logic;
    oauth2Logic = require('./lib/provide-oauth2').create(passport, config, Db
      , Auth.AccessTokens, Auth.AppLogin, loginsController);

    return urlrouter(oauth2Logic.route);
  });


  // ////////////////////////////////////////////////////////////////
  //
  // No Unauthenticated Sessions Beyond this point!!!
  //
  // ////////////////////////////////////////////////////////////////
  // Tokens, Tokens, Apps, and Tokens
  // TODO disallow cookie sessions entirely and only allow tokens
  // TODO req.jwt
  app.use(config.apiPrefix, function controlApiAccess(req, res, next) {
    var rejectableRequest = require('./lib/common').rejectableRequest;
    var $token = (req.user && req.user.$token) || req.$token || null;
    var $client;
    var promise;

    if (!$token) {
      if (req.user) {
        res.error({
          message: "We don't serve your kind here!"
            + " (it looks like you're trying to access the API with a cookie rather than an API token)"
        , code: 401
        , class: "E_NO_TOKEN"
        });
      } else {
        res.error({
          message: "you must supply an API token to access API resources"
        , code: 401
        , class: "E_NO_TOKEN"
        });
      }
      return;
    }

    promise = $token.load('oauthclient').then(function () {
      var url = require('url');
      var referer = req.headers.referer || req.headers.origin;
      var ua = /mozilla|dillo/i.test(req.headers['user-agent']);
      var requestIp = require('request-ip');
      var ip = requestIp.getClientIp(req);
      var domains;
      var ips;

      $client = $token.related('oauthclient');
      // TODO
      // check live && production
      // check allowed domains
      /*
      if (!$client.get('live') && !$token.get('test')) {
        return PromiseA.reject("You are using a production token in a test environment.");
      }
      */

      if (referer && ua) {
        req.fromBrowser = true;
        // this is a browser token

        if ($token.get('test')) {
          domains = config.testDomains || $client.get('urls');
          if (!domains.some(function (domain) {
            var d = url.parse(domain.replace(/^((https?|spdy):\/\/)?/, 'https://'));
            var r = url.parse(referer);

            return d.hostname === r.hostname;
          })) {
            return PromiseA.reject(
              "The request origin/referer did not match any of the allowed **test** domains: '"
                + config.testDomains.join(' ') + "'"
            );
          }
        } else {
          domains = $client.get('urls');
          if (!domains) {
            console.log('$token.toJSON()');
            console.log($token.toJSON());
            console.log('$client.toJSON()');
            console.log($client.toJSON());
            return PromiseA.reject("no domains");
          }
          if (!domains.some(function (domain) {
            return url.parse(domain).host === url.parse(referer).host;
          })) {
            return PromiseA.reject(
              "The request origin/referer did not match the allowed **production** domains"
            );
          }
        }
      } else {
        req.fromServer = true;
        // this is a server token

        if ($token.get('test')) {

          ips = config.testDomains || $client.get('ips') || [];
          if (ips.length && !ips.some(function (allowedIp) {
            return allowedIp === ip;
          })) {
            return PromiseA.reject(
              "The request ip did not match the allowed **test** ips."
              + " Note: use the form 1.1.1.1 subnet checking (1.1.0.0/16) is not yet implemented)"
            );
          }
        } else {
          ips = $client.get('ips') || [];

          if (!ips.length && !ips.some(function (allowedIp) {
            return allowedIp === ip;
          })) {
            return PromiseA.reject(
              "The request origin/referer did not match the allowed **production** domains"
            );
          }
        }
      }
    }).then(function () {
      req.$client = $client;
      req.$token = $token;
      next();
    });
    rejectableRequest(req, res, promise, "checking token against app");
  });

  app.use(config.apiPrefix, function controlApiAccess(req, res, next) {
    var errMsg = "";

    // TODO link all logins to a client
    req.client = req.client || {};
    req.client.config = {
      stripe: config.stripe
    , twilio: config.twilio
    , mailer: config.mailer
    }; // TODO - for stripe token and such

    if (!req.user) {
      res.error({
        message: "Invalid login / Unauthorized access to " + config.apiPrefix
      , code: 401
      , class: "INVALID-AUTH-N"
      , superclasses: []
      });
      return;
    }

    // TODO remove
    if (!req.user.$account) {
      res.error({
        message: "Valid login, but Invalid account / Unauthorized access to " + config.apiPrefix
      , code: 401
      , class: "INVALID-AUTH-Z"
      , superclasses: []
      });
      return;
    }

    if (req.user.$token) {
      next();
      return;
    }

    // If the user is authenticating with cookies (not an access token)
    // then they must have the correct browser origin
    if (config.trustedOrigins.some(function (origin) {
      var escapeRegExp = require('escape-string-regexp');
      var re = new RegExp("^(https?|spdy):\\/\\/([^\\/]+\\.)?" + escapeRegExp(origin) + "(:\\d+)?($|\\/|\\?)");
      var matches = re.test(req.headers.origin || req.headers.referer);

      return matches;
    })) {
      next();
      return;
    }
    if (req.headers.origin) {
      errMsg = "Invalid Origin '" + encodeURI(req.headers.origin) + "'";
    } else if (req.headers.referer) {
      errMsg = "Invalid Referer '" + encodeURI(req.headers.referer) + "'";
    }

    res.error({
      message: errMsg + " for " + encodeURI(config.apiPrefix) + " access"
    , code: 401
    , class: "INVALID-ORIGIN"
    , superclasses: []
    });
  });

  //
  // Routes provided by the framework
  //
  //
  app
    // TODO match patterns such as '/accounts/:accountId/clients'
    .lazyApi('/accounts', function () {
      return urlrouter(require('./lib/oauthclients').createRouter(app, config, Db).route);
    })
    ;

  // 
  // Product-Specific App Routes
  //
  app
    .lazy(config.apiPrefix + '/ldsio', function () {
      if (!ldsConnectRestful) {
        ldsConnectRestful = urlrouter(require('./lib/ldsconnect')
          .createRouter(app, config, Db, ContactNodes.ContactNodes || ContactNodes).route)
          ;
      }
      return ldsConnectRestful;
    })
    .lazy(config.apiPrefix + '/ldsconnect', function () {
      if (!ldsConnectRestful) {
        ldsConnectRestful = urlrouter(require('./lib/ldsconnect')
          .createRouter(app, config, Db, ContactNodes.ContactNodes || ContactNodes).route)
          ;
      }
      return ldsConnectRestful;
      /*
      return function (req, res, next) {
        res.redirect(config.apiPrefix + '/ldsio' + req.url);
      };
      */
    })
    ;

  return app;
}

module.exports.create = function () {
  var app = express();
  var setup;

  //
  // Generic Template API
  //
  app
    .use(require('body-parser').json({
      strict: true // only objects and arrays
    , inflate: true
    , limit: 100 * 1024
    , reviver: undefined
    , type: 'json'
    , verify: undefined
    }))
    .use(require('body-parser').urlencoded({
      extended: true
    , inflate: true
    , limit: 100 * 1024
    , type: 'urlencoded'
    , verify: undefined
    }))
    //.use(require('compression')())
    .use(require('connect-send-error').error())
    ;

  setup = require('./lib/setup').create(app);
  app.use('/setup', setup.route);

  return setup.getConfig().then(function (config) {
    app.set('apiPrefix', config.apiPrefix);
    // this will not be called until setup has completed
    // TODO setup should attach sql passphrase for this db
    config.knexInst = require('./lib/knex-connector').create(config.knex);
    return require('./bookcase/bookshelf-models').create(config, config.knexInst)
      .then(function (Db) {
        return initApi(config, Db, app);
        //return app;
      });
  });
};
