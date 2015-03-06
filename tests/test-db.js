'use strict';

var AM = require('../lib/bookshelf-models')
    ;


AM.Logins.collection()
  .fetch({ withRelated: ['accounts'] })
  .then(function (login) {
    console.log(JSON.stringify(login.toJSON(), null, '  '));
  });
