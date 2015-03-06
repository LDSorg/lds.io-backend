'use strict';

module.exports.create = function () {
  var fs = require('fs')
    , path = require('path')
    , config
    , configFile = path.join(__dirname, '..', 'priv', 'config.json')
    , clientConfigFile = path.join(__dirname, '..', 'priv', 'client-config.json')
    , clientConfigJs = path.join(__dirname, '..', 'app', 'scripts', 'client-config.js')
    , clientConfig = require(clientConfigFile)
    , defaultConfigFile = path.join(__dirname, '..', 'priv', 'default-config.json')
    , defaultConfig = require(defaultConfigFile)
    //, defaultClientConfigFile = path.join(__dirname, '..', 'priv', 'default-client-config.json')
    //, defaultClientConfig = require(defaultConfigFile)
    , PromiseA = require('bluebird').Promise
    , p = {}
    ;

  try {
    config = require(configFile);
    if (!Object.keys(config).length) {
      throw new Error('bad config');
    }
  } catch(e) {
    config = {
      apiPrefix: ''
    , root: true
    };
  }

  function getClientConfig() {
    [ 'apiPrefix'
    , 'oauthPrefix'
    , 'sessionPrefix'
    , 'apiPrefix'
    , 'snakeApi'
    , 'superUserApi'
    , 'adminApi'
    , 'userApi'
    , 'publicApi'
    ].forEach(function (k) {
      clientConfig[k] = config[k];
    });

    // TODO some automated way to get public keys for oauth?
    /*
    [ 'facebook'
    , 'twitter'
    , 'stripe'
    ]
    */

    return clientConfig;
  }

  function getConfig(req, res) {
    if (config.root) {
      req.root = true;
    }

    if (!req.root) {
      res.error({ message: "only the root can access setup" });
    }

    res.send({ config: config, defaults: defaultConfig });
  }

  function updateConfig(req, res) {
    var clientConfigStr
      ;

    if (config.root) {
      req.root = true;
    }

    if (!req.root) {
      res.error({ message: "only the root can access setup" });
    }

    clientConfigStr = ''
      + '(function () {\n'
        + "'use strict';\n"
        + '\n'
        + 'window.StClientConfig = \n'
        + JSON.stringify(getClientConfig(), null, '  ')
        + ';\n'
      + '}());\n'
      ;

    Object.keys(req.body).forEach(function (k) {
      config[k] = req.body[k];
    });

    config.sessionSecret = config.sessionSecret || require('secret-utils').url64(80);

    fs.writeFile(clientConfigFile, JSON.stringify(getClientConfig(), null, '  '), 'utf8', function (error) {
      fs.writeFile(clientConfigJs, clientConfigStr, 'utf8', function (error) {
        if (error) {
          res.error(error);
          return;
        }

        delete config.root;

        fs.writeFile(configFile, JSON.stringify(req.body), 'utf8', function (err) {
          if (err) {
            res.error(err);
            return;
          }

          res.send({ success: true });
        });
      });
    });
  }

  function route(rest) {
    rest.get(config.apiPrefix + '/setup', getConfig);
    rest.post(config.apiPrefix + '/setup', updateConfig);
  }

  return {
    route: route
  , getConfig: function () {
      if (!config.root) {
        return PromiseA.resolve(config);
      }

      return new PromiseA(function (res, rej) {
        p.resolve = res;
        p.reject = rej;
      });
    }
  };
};
