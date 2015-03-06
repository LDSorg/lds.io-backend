'use strict';

module.exports.create = function (knex) {
  return require('./migrate').create(knex);
};
