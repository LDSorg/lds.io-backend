'use strict';

// A dummy ws server for swimming drills or laps or something
var WebSocketServer = require('ws').Server
  , utils = require('./utils')
  ;

module.exports.create = function (app, config, wsport/*, middlewares*/) {
  var state = {}
    , wss
    , clientsMap = {}
    , idCount = 0
    ;

  wsport = wsport || 8080;
  wss = new WebSocketServer({ port: wsport });

  // del
  app.use(config.apiPrefix + '/ws', function (req, res, next) {
    var user = req.user && req.user.account
      ;

    if (!user) {
      res.send(utils.errorinate('INVALID-AUTHENTICATION', 'use a token or log in first'));
      return;
    }

    console.log('[check user]');
    console.log(user.role);

    req.userProfile = user;
    next();
  });

  function init() {
    state = {
      endtime: new Date(Date.now() + (1 * 60 * 1000)).toISOString()
    , starttime: new Date(Date.now() + (11 * 60 * 1000)).toISOString()
    };
  }

  wss.on('connection', function (ws) {
    idCount += 1;
    ws.myid = idCount;
    clientsMap[ws.myid] = ws;

    /*
    if ('http://0.0.0.0:3000' !== ws.upgradeReq.headers.origin) {
      ws.send('[ERROR] [CSWSH] Are you evil?');
      ws.close();
      console.error('[CSWSH] The client may be evil. Access Denied.');
      return;
    }
    forEachAsync(middlewares, function (next, mw) {
      // parseAuth(ws.upgradeReq, {}, function () {})
      mw(ws.upgradeReq.headers, {}, next);
    });
    */

    ws.on('message', function (message) {
      console.log('received ws: %s', message);
    });

    ws.on('close', function () {
      console.log('delete ws');
      delete clientsMap[ws.myid];
    });

    singlecast('state', state, ws);
  });

  function joinRoom(req, res) {
    res.send(utils.massage('info', {
      user: req.userProfile
    , ws: 'ws://' + req.headers.host.replace(/:\d+/, ':' + wsport) + '/api/ws'
        + '&access_token=' + req.userProfile.accessToken
    }));
  }

  function singlecast(type, msg, client) {
    client.send(JSON.stringify(utils.wsMassage(type, msg)));
  }

  function broadcast(type, msg) {
    var str = JSON.stringify(utils.wsMassage(type, msg), function (key, val) {
            // TODO what to keep private?
            if ('private' === key || 'secret' === key) {
              return null;
            } else {
              return val;
            }
          })
      ;

    Object.keys(clientsMap).forEach(function (key) {
      var client = clientsMap[key]
        ;

      client.send(str);
    });
  }

  function controlState(req, res) {
    var ctrl = req.body
      ;

    switch (ctrl.control) {
      case 'start':
        state.starttime = new Date().toISOString();
        state.started = new Date().toISOString();
        state.active = true;
        break;
      case 'pause':
        // TODO log pauses
        state.active = false;
        break;
      case 'resume':
        // TODO log resumes
        state.active = true;
        break;
      case 'warn':
        state.endtime = new Date(Date().now + (1 * 60 * 1000)).toISOString();
        break;
      case 'end':
        state.active = false;
        state.ended = new Date().toISOString();
        break;
      default:
        res.send(utils.errorinate('unsupportedcmd', 'Hmmm.... the command you issue, know not do I....'));
        return;
    }

    // rxts isn't really part of state, I guess
    ctrl.rxts = new Date().toISOString();
    // ctrl.txts // client should send its transmit time

    Object.keys(state).forEach(function (k) {
      ctrl[k] = state[k];
    });

    broadcast('state', ctrl);
    res.send(utils.massage('stateaccepted', { ok: true }));
  }

  function leaveRoom(req, res) {
    req.userProfile.present = false;
    res.send(utils.massage('ok', null));
  }

  function initServer(req, res) {
    init();
    res.send(utils.massage('ok', null));
  }

  function updateState(req, res) {
    req.body.control = 'state';
    controlState(req, res);
  }

  function route(rest) {
    rest.post(config.apiPrefix + '/ws/init', initServer);
    rest.post(config.apiPrefix + '/ws/state', updateState);
    rest.post(config.apiPrefix + '/ws/users', joinRoom);
    rest.delete(config.apiPrefix + '/ws/me', leaveRoom);
  }

  // mock
  // initServer({ body: { }}, { send: function () {} });

  return route;
};
