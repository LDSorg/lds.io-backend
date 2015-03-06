'use strict';

var fs = require('fs')
  , path = require('path')
  , nodes
  , migrations = []
  , filename = path.join(__dirname, 'migrations.js')
  ;

nodes = fs.readdirSync(__dirname);
nodes.forEach(function (node) {
  if (/\.json$/.test(node)) {
    migrations.push(", require('./" + node + "')\n");
  }
});

if (migrations.length) {
  migrations[0] = migrations[0].replace(/^,/, ' ');
}

migrations = migrations.join('');

migrations = ''
  + "'use strict';\n"
  + "\n"
  + "module.exports = [\n"
  + migrations
  + "];\n"
  ;

fs.writeFileSync(filename, migrations, 'utf8');
