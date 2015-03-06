'use strict';

var connect = require('connect');
var urlrouter = require('urlrouter');

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
  var Logins = require('./lib/logins');
  var loginsController = Logins.createController(config, Db, ContactNodes);
  var routes = {};

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

  app.api = function (path, fn) {
    if (!fn) {
      fn = path;
      path = "";
    }

    app.use(config.apiPrefix + path, fn);
    return app;
  };

  app.lazyApi = function (pathname, fn) {
    var escapeRegExp = require('escape-string-regexp');
    // TODO test for break?
    var re = new RegExp('^' + escapeRegExp(pathname));

    if (!fn) {
      fn = pathname;
      pathname = "";
    }
    fn.__thingy_id = Math.random();

    app.use(config.apiPrefix, function (req, res, next) {

      console.log('[lazyApi]', pathname, 'req.url', req.url, re.test(req.url));
      if (!re.test(req.url)) {
        next();
        return;
      }

      if (!routes[fn.__thingy_id]) {
        routes[fn.__thingy_id] = fn();
      }

      routes[fn.__thingy_id](req, res, next);
    });
    return app;
  };

  app.lazyUse = function (pathname, fn) {
    var escapeRegExp = require('escape-string-regexp');
    // TODO test for break?
    var re = new RegExp('^' + escapeRegExp(pathname));

    if (!fn) {
      fn = pathname;
      pathname = "";
    }
    fn.__thingy_id = Math.random();

    app.use(function (req, res, next) {
      // TODO test for break?
      console.log('[lazyUse]', pathname, 'req.url', req.url, re.test(req.url));
      if (!re.test(req.url)) {
        next();
        return;
      }

      if (!routes[fn.__thingy_id]) {
        routes[fn.__thingy_id] = fn();
      }

      routes[fn.__thingy_id](req, res, next);
    });
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

  // TODO move attaching the account into a subsequent middleware?
  sessionLogic = require('./lib/sessionlogic').init(app, passport, config, Auth, loginsController);
  app.lazyUse('/api/session', function () {
    if (!sessionRouter) {
      sessionRouter = urlrouter(sessionLogic.route);
    }
    return sessionRouter;
  });
  app.lazyUse('/oauth', function () {
    if (!sessionRouter) {
      sessionRouter = urlrouter(sessionLogic.route);
    }
    return sessionRouter;
  });
  app.lazyUse('/oauth', function () {
    var oauth2Logic;
    oauth2Logic = require('./lib/provide-oauth2').create(passport, config, Db, Auth, loginsController);
    return urlrouter(oauth2Logic.route);
  });

  //
  // Generic App Routes
  //
  // TODO a way to specify that a database should be attached to /me
  app
    .lazyApi('/session', function () {
      console.log('[SESSION 1]');
      require('./lib/fixtures/root-user').create(ru, Auth);
      return urlrouter(require('./lib/session').createRouter().route);
    })
    .lazyApi('/accounts', function () {
      return urlrouter(require('./lib/accounts').createRouter(app, config, Db, Auth, loginsController).route);
    })
    .lazyApi('/logins', function () {
      var loginsRestful;
      loginsRestful = Logins.createRouter(app, config, Db, sessionLogic.manualLogin, ContactNodes);
      return urlrouter(loginsRestful.route);
    })
    ;

  //
  // Service Webhooks
  //
  /*
  app
    // should merge in twilio above?
    .use(urlrouter(require('./lib/webhooks').create(app, config).route))
    ;
  */

  //
  // App-Specific WebSocket Server
  //
  /*
  app
    .use(urlrouter(ws.create(app, config, wsport, [])))
    ;
  */

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
    /*
    .use(serveStatic(path.join(__dirname, 'priv', 'public')))
    .use(serveStatic(path.join(__dirname, 'frontend', 'dist')))
    .use(serveStatic(path.join(__dirname, 'frontend', 'app')))
    //.use(require('morgan')())
    .use(function (req, res, next) {
      console.log('['+req.method+']', req.url, req.body && Object.keys(req.body) || '');
      next();
    })
    */
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
  app.use('/setup', setup.route);

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
