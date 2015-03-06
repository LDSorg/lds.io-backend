'use strict';

var utils = require('./lib/bookshelf-utils')
  ;

console.log(utils.toCamelCaseArr(
  ['blah', 'BlahBlahBlah', 'blahBlah', 'foo_bar', 'foo_bar_baz', 'foo_barBaz', 'fooBar_baz']
));

console.log(utils.toSnakeCaseArr(
  ['blah', 'BlahBlahBlah', 'blahBlah', 'foo_bar', 'foo_bar_baz', 'foo_barBaz', 'fooBar_baz']
));
