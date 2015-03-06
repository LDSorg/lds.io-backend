'use strict';

var UUID = require('node-uuid')
  ;

module.exports.create = function (app, config, Db) {
  app.use(config.apiPrefix + '/me/contacts', function (req, res, next) {
    Db.AddressBook.forge({ accountUuid: req.me.account.uuid }).fetch(function (book) {
      req.contacts = book;

      if (req.contacts) {
        next();
        return;
      }

      book = Db.AddressBook.forge().save({
        accountUuid: req.me.account.uuid
      , contacts: {}
      , dummy: true
      }).then(function () {
        req.contacts = book;
        next();
      });

    });
  });

  function route(rest) {
    // TODO sort by (tx * 2 + rx) where tx is times used and rx is times used by
    rest.get('/me/contacts', function (req, res) {
      console.log(req.me.account);
      Db.AddressBook.forge({ uuid: req.me.account.uuid }).fetch(function (book) {
        res.send(book.toJSON());
      });
    });

    /*
    function notImplemented(req, res) {
      res.statusCode = 501;
      res.send({ error: { message: 'Not Implemented' } });
    }
    */

    function insertContact(req, res) {
      var id = UUID.v4()
        ;

      req.account.contacts[id] = req.body;
      req.body.id = id;
      req.account.save().then(function () {
        res.send({ id: id });
      });

      // TODO validate
      /*
      Db.Contact.forge().save(req.body).then(function (contact) {
        res.send({ value: contact.toJSON() });
      });
      */
    }
    /*
     TODO validation schema

      { contact: {
          numbers: [String]
          relationships: [
            { isType: function () {}
            , type: 'family'
            , value: {
                name: String
              }
            }
          , { isType: function () {}
            , type: 'co-worker'
            , value: {
                name: String
                position: { type: 'enum', values: ['minion'] }
              }
            }
          ]
        }
      }
     */
    function updateContact(id, req, res) {
      var delta = req.body
        , contact = req.account.contacts[id] || {}
        ;

      if (!contact) {
        res.statusCode = 422;
        res.send({ error: { message: "contact not found" } });
      }

      Object.keys(delta).forEach(function (k) {
        var v = delta[k]
          ;

        if (null === v) {
          delete delta[k];
        } else {
          contact[k] = delta[k];
        }
      });
      contact.id = id;

      req.account.save().then(function () {
        res.send({ success: true });
      });

      /*
      Db.Contact.forge({ id: id }).save(req.body).then(function (contact) {
        res.send({ value: contact.toJSON() });
      });
      */
    }
    function upsertContact(req, res) {
      var id = req.params.id || req.body.id
        ;

      if (id) {
        updateContact(id, req, res);
      } else {
        insertContact(req, res);
      }
    }
    rest.post('/me/contacts', upsertContact);
    rest.post('/me/contacts/:id', upsertContact);
  }

  return {
    route: route
  };
};
