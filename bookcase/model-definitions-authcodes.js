'use strict';
//
// AuthCodes
//
module.exports.create = function (config, Models/*, Db*/) {
  var models
    ;

  models = {
    AuthCodes:
    { tableName: 'authcodes'
    , idAttribute: 'uuid'
    , hasTimestamps: ['createdAt', 'updatedAt']
    }
  };

  Object.keys(models).forEach(function (key) {
    Models[key] = models[key];
  });
};
