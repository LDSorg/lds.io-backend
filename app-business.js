'use strict';

var path = require('path');
var connect = require('connect');
var serveStatic = require('serve-static');
var urlrouter = require('urlrouter');

function initApi(config, Db, app) {
  // TODO maybe a main DB for core (Accounts) and separate DBs for the modules?
  var oauth2Logic;
  var sessionLogic;
    //, ws = require('./lib/ws')
    //, wsport = config.wsport || 8282
  var ru = config.rootUser;
  var Auth = require('./lib/auth-logic').create(Db, config);
  var ContactNodes = require('./lib/contact-nodes').create(config, Db);
  var Passport = require('passport').Passport;
  var passport;
  var CORS = require('connect-cors');
  var Logins = require('./lib/logins');
  var loginsController = Logins.createController(config, Db, ContactNodes);
  var loginsRestful;

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

  require('./lib/fixtures/root-user').create(ru, Auth);

  app.api = function (path, fn) {
    if (!fn) {
      fn = path;
      path = "";
    }

    app.use(config.apiPrefix + path, fn);
    return app;
  };

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
  app
    .api(CORS({ credentials: false }))
    ;

  // initialize after all passport.use, but before any passport.authorize
  app
    .use(require('cookie-parser')())
    .use(require('express-session')({
      secret: config.sessionSecret
    , saveUninitialized: true // see https://github.com/expressjs/session
    , resave: true // see https://github.com/expressjs/session
    }))
    .use(passport.initialize())
    .use(passport.session())
    ;

  if (config.snakeApi) {
    app.use(require('./lib/connect-shims/snake')([config.apiPrefix]));
  }

  oauth2Logic = require('./lib/provide-oauth2').create(app, passport, config, Db, Auth, loginsController);
  sessionLogic = require('./lib/sessionlogic').init(app, passport, config, Auth, loginsController);
  loginsRestful = Logins.createRouter(app, config, Db, sessionLogic.manualLogin, ContactNodes);

  // TODO move attaching the account into a subsequent middleware?
  app.use(urlrouter(sessionLogic.route));
  app.use(urlrouter(oauth2Logic.route));

  //
  // Generic App Routes
  //
  // TODO a way to specify that a database should be attached to /me
  app
    .api(urlrouter(require('./lib/session').createRouter().route))
    .api(urlrouter(require('./lib/accounts').createRouter(app, config, Db, Auth, loginsController).route))
    .api(urlrouter(loginsRestful.route))
    .api(urlrouter(require('./lib/me').create(app, config, Db, Auth).route))
    .api(urlrouter(require('./lib/oauthclients').createRouter(app, config, Db, Auth).route))
    .api(urlrouter(require('./lib/contacts').create(app, config, Db).route))
    .api(urlrouter(require('./lib/account-addresses').createRouter(app, config).route))
    .api(urlrouter(require('./lib/account/contacts')
      .create(app, config, Db).route
    ))
    .api(urlrouter(require('./lib/account-payment-methods')
      .create(app, config, Auth, sessionLogic.manualLogin).route
    ))
    .api(urlrouter(require('./lib/account-devices').create(app, config).route))
    .api(urlrouter(require('./lib/public-contact').create(app, { mailer: config.mailer }).route))
    // should be merged with webhooks?
    .api(urlrouter(require('./lib/twilio').create(app, config).route))
    ;

  //
  // Service Webhooks
  //
  app
    // should merge in twilio above?
    .use(urlrouter(require('./lib/webhooks').create(app, config).route))
    ;

  //
  // App-Specific WebSocket Server
  //
  /*
  app
    .use(urlrouter(ws.create(app, config, wsport, [])))
    ;
  */

  //
  // 2nd Serve Static (catches loopback-close.html and such)
  //
  app
    .use(serveStatic(path.join(__dirname, 'priv', 'public')))
    .use(serveStatic(path.join(__dirname, 'frontend', 'dist')))
    .use(serveStatic(path.join(__dirname, 'frontend', 'app')))
    ;

  return app;
}

module.exports.create = function () {
  var app = connect();
  var setup;

  //
  // Generic Template API
  //
  app
    //.use(require('connect-jade')({ root: __dirname + "/views", debug: true }))
    .use(serveStatic(path.join(__dirname, 'priv', 'public')))
    .use(serveStatic(path.join(__dirname, 'frontend', 'dist')))
    .use(serveStatic(path.join(__dirname, 'frontend', 'app')))
    //.use(require('morgan')())
    .use(function (req, res, next) {
      console.log('['+req.method+']', req.url, req.body && Object.keys(req.body) || '');
      next();
    })
    .use(require('errorhandler')({
      dumpExceptions: true
    , showStack: true
    }))
    .use(require('./lib/connect-shims/query')())
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
    .use(require('compression')())
    .use(require('./lib/connect-shims/redirect'))
    .use(require('connect-send-error').error())
    .use(require('connect-send-json').json())
    .use(require('./lib/connect-shims/xend'))
    .use(urlrouter(require('./lib/vidurls').route))
    //.use(express.router)
    ;
    //route(app);

  setup = require('./lib/setup').create(app);
  app.use(urlrouter(setup.route));

  return setup.getConfig().then(function (config) {
    // this will not be called until setup has completed
    config.knexInst = require('./lib/knex-connector').create(config.knex);
    return require('./bookcase/bookshelf-models').create(config, config.knexInst)
      .then(function (Db) {
        return initApi(config, Db, app);
        //return app;
      });
  });
};
