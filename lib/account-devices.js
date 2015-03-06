'use strict';

var useragent = require('useragent')
  ;

module.exports.create = function (app, config) {

  // /me -> /accounts/:accountId
  function attachAccount(req, res, next) {
    req.me = req.user.account;
    if (!req.me) {
      res.error({ message: 'You have logged in, but you have not created and set a primary account.' });
      return;
    }
    next();
  }
  app.use(config.apiPrefix + '/me/devices', attachAccount);

  function route(rest) {
    var Devices = {}
      ;

    Devices.put = function (account, newDevice) {
      var devices = account.get('devices') || []
        , isDeviceAlreadyRegistered
        ;

      // If .some() returns true we already have that device 
      // so we update our array to catch any changes
      // otherwise we push the device onto the end of devices
      isDeviceAlreadyRegistered = devices.some(function (d, i) {
        if (d.id === newDevice.id || d.token === newDevice.token) {
          devices[i] = newDevice;
          return true;
        }
      });

      if (!isDeviceAlreadyRegistered) {
        newDevice.id = newDevice.id || 'dvc_' + (+new Date()).toString(36) + Math.random().toString(36).slice(2);
        newDevice.token = newDevice.token || 'tok_' + (+new Date()).toString(36) + Math.random().toString(36).slice(2);
        newDevice.enablePush = (false !== newDevice.enablePush);
        devices.push(newDevice);
      }

      account.set('devices', devices);
      return account.save().then(
        function () {
          return devices;
        }
      );
    };

    Devices.remove = function (account, oldToken) {
      var devices = account.get('devices') || []
        ;

      devices = devices.filter(function (d) {
        if (d.token !== oldToken) {
          return true;
        }
      });

      account.set('devices', devices);
      return account.save();
    };
    
    function listDevices (req, res) {
      res.send(req.me.get('devices'));
    } 
    
    function getDevice (req, res) {
      var device = req.me.get('devices').filter(function (d) {
        return (d.token === req.params.token);
      })[0] || null;
      res.send(device);
    }    
    
    function addOrUpdateDevice (req, res) {
      var body = req.body
        , agentString = req.headers['user-agent']
        , agent
        ;

      body.token = req.params.token || body.token || 'tok_' + (+new Date()).toString(36) + Math.random().toString(36).slice(2);
      
      if (!body.agent && agentString) {
        agent = useragent.parse(agentString);
        body.agent = agent.toJSON();
        body.agent.version = agent.toVersion();
        body.agent.os.version = agent.os.toVersion(); // for some reason this has no affect but osversion works
        body.agent.osversion = agent.os.toVersion();
      }
      Devices
      .put(req.me, body)
      .then(
        function (devices) {
          res.send(devices);
        }
        , function (err) {
          res.error({ message: err });
        }
      );
    }
    
    function removeDevice (req, res) {
      var account = req.me
        ;
      Devices
      .remove(account, req.params.token)
      .then(
        function () {
          res.send(account.get('devices'));
        }
        , function (err) {
          res.error({ message: err });
        }      
      );
    }

    rest.get('/me/devices', listDevices);
    rest.get('/me/devices:/token', getDevice);
    rest.post('/me/devices', addOrUpdateDevice);
    rest.post('/me/devices/:token', addOrUpdateDevice);
    rest.delete('/me/devices/:token', removeDevice);
  }
  
  return {
    route: route
  };
};
