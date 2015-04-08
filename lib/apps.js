'use strict';

// NOTES
// create and delete require the parent
// get and getAll are done in the require, which requires the parent as context
// (the view bits do not)
// update needs schema

var PromiseA = require('bluebird').Promise;

module.exports.createController = function (/*config, Db*/) {
  function Apps() {
  }

  return Apps;
};

module.exports.createView = function (config, Db) {
  var Apps = module.exports.createController(config, Db);

  //
  // RESTful Apps
  //
  Apps.restful = {};

  // TODO update a static json file when OauthClients are created (in other file)
  Apps.restful.all = function (req, res) {
    // TODO filter by liveness?
    return Db.OauthClients.forge().fetchAll().then(function ($apps) {
      var promise = PromiseA.resolve();

      $apps.forEach(function ($client) {
        // TODO remove this after first run
        if (!$client.get('secret')) {
          promise = promise.then(function () {
            var crypto = require('crypto');
            $client.set('secret', crypto.randomBytes(264 / 8).toString('base64'));
            return $client.save();
          });
        }
      });

      return promise.then(function () {
        return $apps.filter(function (app) {
          // TODO put in db so that it can be filtered at retrieve time
          return !app.get('root'); // && app.get('live');
        }).map(function ($app) {
          // TODO id?
          return {
            name: $app.get('name')
          , desc: $app.get('desc')
          , keywords: $app.get('keywords')
          , urls: $app.get('urls')
          , logo: $app.get('logo')
          , repo: $app.get('repo')
          , live: $app.get('live')
          , secret: !!$app.get('secret')
          };
        });
      });
    }).then(function (apps) {
      res.send({ result: apps });
    }).catch(function (err) {
      // TODO common.handleError
      console.error("TODO handle apps error");
      console.error(err);
      res.end('ERROR: TODO handle the apps error');
    });
  };

  return Apps;
};

module.exports.createRouter = function (app, config, Db) {
  var Apps = module.exports.createView(config, Db);

  // 
  // ROUTES
  //
  Apps.route = function (rest) {
    rest.get(
      '/public/apps'
    , Apps.restful.all
    );
  };

  Apps.Apps = Apps;

  return Apps;
};
