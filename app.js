'use strict';

var urlrouter = require('urlrouter');
var express = require('express-lazy');

function initApi(config, Db, app) {
  // TODO maybe a main DB for core (Accounts) and separate DBs for the modules?
  var sessionLogic;
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
    /*
    .use(config.sessionPrefix, function (req, res, next) {
        req.skipAuthn = true;
        next();
      })
    */
    ;

  //
  // Generic Template Auth
  //
  passport = new Passport();

  // Allows CORS access to API with ?access_token=
  app.use('/api', CORS({ credentials: false, headers: [
    'X-Requested-With'
  , 'X-HTTP-Method-Override'
  , 'Content-Type'
  , 'Accept'
  , 'Authorization'
  ] }));

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
    app.use(require('connect-recase')({
      cancelParam: 'camel'
      // TODO allow explicit and or default flag
    , explicit: false
    , default: 'snake'
    , prefixes: [config.apiPrefix]
    , exceptions: {}
    }));
  }

  // TODO move attaching the account into a subsequent middleware?
  sessionLogic = require('./lib/sessionlogic').init(passport, config, Auth, loginsController);

  app.use(config.apiPrefix, sessionLogic.tryBearerSession);
  app.lazyMatch('/api/session', function () {
    if (!sessionRouter) {
      sessionRouter = urlrouter(sessionLogic.route);
    }
    return sessionRouter;
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
    ;

  app.lazyMatch('/oauth', function () {
    if (!sessionRouter) {
      sessionRouter = urlrouter(sessionLogic.route);
    }
    return sessionRouter;
  });
  app.lazyMatch('/oauth', function () {
    var oauth2Logic;
    oauth2Logic = require('./lib/provide-oauth2').create(passport, config, Db, Auth, loginsController);
    return urlrouter(oauth2Logic.route);
  });


  // ////////////////////////////////////////////////////////////////
  //
  // No Unauthenticated Sessions Beyond this point!!!
  //
  // ////////////////////////////////////////////////////////////////
  app.use(config.apiPrefix, sessionLogic.rejectUnauthorizedSessions);

  //
  // Routes provided by the framework
  //
  //
  app
    .lazyApi('/accounts', function () {
      return urlrouter(require('./lib/accounts').createRouter(app, config, Db, Auth, loginsController).route);
    })
    // TODO match patterns such as '/accounts/:accountId/clients'
    .lazyApi('/accounts', function () {
      return urlrouter(require('./lib/oauthclients').createRouter(app, config, Db).route);
    })



  // 
  // Product-Specific App Routes
  //
    .lazy(config.apiPrefix + '/ldsconnect', function () {
      var ldsConnectRestful = require('./lib/ldsconnect').createRouter(app, config, Db, ContactNodes.ContactNodes || ContactNodes);
      return urlrouter(ldsConnectRestful.route);
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
