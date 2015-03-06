'use strict';

var Knex = require('knex')
  , path = require('path')
  ;

module.exports.create = function(thing) {
  var filename
    , knex
    , config
    ;

  // the thing might be a string, object, or knex instance
  if (thing) {
    if ('object' === typeof thing) {
      // the config object has thing.connection
      // the knex object does not (but it does have 'client')
      if (!thing.connection) {
        return thing;
      } else {
        config = thing;
      }
    }
    if ('string' === typeof thing) {
      filename = thing;
    }
  }

  knex = Knex.initialize(config || {
    client: 'sqlite3'
  //, debug: true
  , connection: {
      filename : path.join(__dirname, '..', 'priv', filename || 'knex.sqlite3')
    , debug: true
    }
  });
  
  return knex;
};
