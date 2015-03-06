'use strict';

var config = require('./config')
  ;

function init(Db) {
  //console.log('time to run tests...');
  //console.log(Db);
  require('./test-db-story').run(Db);
  //require('./test-get-logins-and-accounts.js').run(Db);
}

module.exports.create = function () {
  config.knexInst = require('./lib/knex-connector').create(config.knex);
  require('./lib/bookshelf-models').create(config.knexInst).then(init);
};

module.exports.create();
