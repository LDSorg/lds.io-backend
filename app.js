'use strict';

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
        })
      }

      if (!req.url.match(config.oauthPrefix)) {
        recase(req, res, next);
        return;
      }

      next();
    });
  }

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
  sessionLogic = require('./lib/sessionlogic').init(passport, config, Auth, loginsController);
  app.use(config.apiPrefix, sessionLogic.tryBearerSession);
  app.lazyMatch('/api/session', function () {
    if (!sessionRouter) {
      sessionRouter = urlrouter(sessionLogic.route);
    }
    return sessionRouter;
  });

  sessionStrategies = {
    facebook: function () { return require('./lib/sessionlogic/providers/facebook') }
  //, loopback: require('./lib/sessionlogic/providers/loopback')
  //, ldsconnect: require('./lib/sessionlogic/providers/ldsconnect')
  //, twitter: require('./lib/sessionlogic/providers/twitter')
  //, tumblr: require('./lib/sessionlogic/providers/tumblr')
  };

  Object.keys(sessionStrategies).forEach(function (strategyName) {
    // TODO nix this badness
    var requireStrategy = sessionStrategies[strategyName];
    var sessionRouters = {};

    app.lazyMatch(config.oauthPrefix + '/' + strategyName, function () {
      var strategy;

      if (!sessionRouters[strategyName]) {
        // TODO
        // Since the API prefix is sometimes necessary,
        // it's probably better to always require the
        // auth providers to use it manually

        // TODO strategyName should be enforced by the requirer, not the requiree
        strategy = sessionLogic.strategies[strategyName] = requireStrategy();
        // TODO change all to use 'createRouter' instead of 'init'
        sessionRouters[strategyName] = urlrouter((strategy.createRouter||strategy.init)(passport, config, { login: sessionLogic.loginWrapper }));
      }

      return sessionRouters[strategyName];
    });
  });

  //
  // Generic Session / Login / Account Routes
  //
  app
    .lazyApi('/session', function () {
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
    oauth2Logic = require('./lib/provide-oauth2').create(passport, config, Db, Auth, loginsController);
    return urlrouter(oauth2Logic.route);
  });


  // ////////////////////////////////////////////////////////////////
  //
  // No Unauthenticated Sessions Beyond this point!!!
  //
  // ////////////////////////////////////////////////////////////////
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
  app.use('/oauth', function (req, res, next) {
    res.redirect('/api/oauth3' + req.url);
  });
  app.use(function (req, res, next) {
    // TODO update these strings

    // various styles for authorization dialog
    if (-1 !== [
      '/dialog/authorize'
    , '/api/oauth3/dialog/authorize'
    , '/api/oauth3/dialog'
    , '/dialog/oauth'                 // facebook style
    ].indexOf(req.url)) {
      res.redirect('/api/oauth3/authorization_dialog');
      return;
    }

    // various styles for authorization decision
    if (-1 !== [
      '/dialog/authorize/decision'
    , '/api/oauth3/dialog/authorize/decision'
    ].indexOf(req.url)) {
      res.redirect('/api/oauth3/authorization_decision');
      return;
    }

    // various styles for access_token
    if (-1 !== [
      '/api/oauth3/token'
    , '/oauth/access_token'         // facebook style
    ].indexOf(req.url)) {
      res.redirect('/api/oauth3/access_token');
      return;
    }

    // various styles for profile
    if (-1 !== [
      '/me'
    , '/profile'
    ].indexOf(req.url)) {
      res.redirect('/api/ldsio/accounts');
      return;
    }

    next();
  });

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
