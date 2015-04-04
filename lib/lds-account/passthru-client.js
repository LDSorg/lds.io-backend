'use strict';

module.exports.create = function (config) {
  var PromiseA = require('bluebird').Promise;
  var https = require('https');
  var request = require('request');
  var requestAsync = PromiseA.promisify(request);
  var agentOptions;
  var agent;

  agentOptions = {
    host: config.hostname
  , port: config.port
  , path: '/'
  , ca: config.cas
  , key: config.key
  , cert: config.cert
  };

  agent = new https.Agent(agentOptions);

  return function (opts) {
    var endpoint;
    var password;

    if ('object' !== typeof opts) {
      return PromiseA.reject(new Error("no options object was supplied"));
    }

    // I'll take that, thank you very much
    // (just so if you're console.error()ing, you won't have it anymore
    if (opts.password) {
      password = opts.password;
      opts.password = '[PROTECTED]';
    }

    if ('string' !== typeof opts.token) {
      endpoint = '/api/login';
      if ('string' !== typeof opts.username) {
        return PromiseA.reject(new Error("no options.username was supplied"));
      }
      if (opts.username.length <= 4) {
        return PromiseA.reject(new Error("options.username was too short"));
      }
      if ('string' !== typeof password) {
        return PromiseA.reject(new Error("no options.password was supplied"));
      }
    } else {
      endpoint = '/api/passthru';
      if (opts.token.length <= 100) {
        return PromiseA.reject(new Error("options.token was too short"));
      }
      if ('undefined' !== typeof opts.username) {
        return PromiseA.reject(new Error("options.username was given with a token when it shouldn't be"));
      }
      if ('undefined' !== typeof password) {
        return PromiseA.reject(new Error("options.password was given with a token when it shouldn't be"));
      }
    }

    return requestAsync({
      url: config.proxyUrl + endpoint
    , method: 'POST'
      // TODO secrets.unlock(password)
    , json: { token: opts.token, username: opts.username, password: password }
    , agent: agent
    }).spread(function (resp, body) {
      password = null;

      if (!body.jar) {
        console.error(body);
        return PromiseA.reject(new Error('Response is Missing Token Session. Bad Credentials?'));
      }

      // body = { jar: (always), token: (if via user/pass) }
      return body;
    }).error(function (err) {
      password = null;
      return PromiseA.reject(err);
    }).catch(function (err) {
      password = null;
      throw err;
    });
  };
};
