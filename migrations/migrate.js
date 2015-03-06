'use strict';

var Promise = require('bluebird')
  ;

module.exports.create = function (knex) {
  require('./pre-migrate');
  var meta
      // TODO migrations rather than just tables
    , files = require('./migrations')
    , tables = []
    ;

  // convert all entries to arrays
  files.forEach(function (file) {
    if (!Array.isArray(file)) {
      file = [file];
    }
    file.forEach(function (table) {
      tables.push(table);
    });
  });

  meta = {
    tablename: '_st_meta_'
  , timestamps: true
  , xattrs: true
  , columns: {
      name: { type: 'string', length: 255 }
    }
  };

  function createTable(props) {
    return knex.schema.createTable(props.tablename, function (t) {
      var columns
        , primaries = []
        ;

      if (props.uuid) {
        t.uuid('uuid').unique().index().notNullable();
        t.primary('uuid');
      }
      if (props.xattrs) {
        t.json('xattrs').notNullable().defaultTo(knex.raw("'{}'"));
      }
      if (props.timestamps) {
        t.timestamps(); //.notNullable();
      }

      if (!props.columns) {
        return;
      }

      if (Array.isArray(props.columns)) {
        columns = props.columns;
      } else {
        columns = [];
        Object.keys(props.columns).forEach(function (colname) {
          var col = props.columns[colname]
            ;

          if ('string' === typeof col) {
            col = { type: col };
          }
          col.name = col.name || colname;
          columns.push(col);
        });
      }

      columns.forEach(function (col) {
        var cur
          ;

        switch (col.type) {
          case 'string':
            col.length = col.length || 255;
            cur = t.string(col.name, col.length);
            break;
          case 'uuid':
            cur = t.uuid(col.name);
            break;
        }

        cur = cur || t;
        if (col.references) {
          cur.references(col.references[1]).inTable(col.references[0]);
        }

        if (col.unique) {
          cur.unique();
        }

        // TODO maybe this is best elswhere so that it isn't done twice?
        if (col.primary) {
          primaries.push(col.name);
        }
      });

      if (primaries.length) {
        t.primary.apply(t, primaries);
      }
    }).then(function (data) {
      console.info('[table] [created]', props.tablename);
      return data;
    }, function (err) {
      console.error('[table] [create-fail]');
      console.error(props);
      console.error(err);
      throw err;
    });
  }

  function getTable(props) {
    return knex(props.tablename).columnInfo().then(function (info) {
      if (!Object.keys(info).length) {
        return createTable(props).then(function () {
          return getTable(props);
        });
      }

      /*
      console.log('\n[tablename]', props.tablename);
      console.log(props);
      console.log(info);
      */
      return { name: props.tablename, meta: info };
    }, function (err) {
      console.error('[ERROR] migrate.js');
      console.error(err);
      props._errorCount = props._errorCount || 0;
      if (props.errorCount > 3) {
        throw new Error('life sucks becaues the error count reached >3');
      }
      props._errorCount += 1;
      return createTable(props).then(function () {
        return getTable(props);
      });
    });
  }

  return getTable(meta).then(function (info) {
    var ps = [{ name: meta.tablename, meta: info }]
      ;

    // TODO determine if table needs creating or not
    tables.forEach(function (table) {
      ps.push(getTable(table));
    });

    // whatever calls this can't return from this promise with a promise...
    // stupid es6 promises... that I'm stupidly deciding to use...
    return Promise.all(ps);
  });
};
