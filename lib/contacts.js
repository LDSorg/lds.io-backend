'use strict';

module.exports.create = function (app, config, Db) {
  var UUID = require('node-uuid')
    ;

  function Contacts() {
  }

  Contacts.restful = {};

  Contacts.restful.get = function (req, res) {
    var uuid = req.user.account.attributes.contactUuid
      ;

    if (!uuid) {
      Db.Contacts.forge({ uuid: UUID.v4(), accountUuid: req.user.account.id })
        .save().then(function (contact) {
          req.user.account
            .save({ contactUuid: contact.get('uuid') }, { patch: true })
            .then(function () {
              res.json({ nodes: [] });
            });
        });
    } else {
      Db.ContactNodes.forge({ contactUuid: uuid }).fetchAll()
        .then(function (nodes) {
          res.json({
            nodes: nodes.toJSON().filter(function (node) {
              return !node.deleted_at; // filter out deleted nodes
            })
          });
        });
    }
  };

  Contacts.restful.create = function (req, res) {
    var uuid = req.user.account.attributes.contactUuid
      ;

    if (!uuid) {
      res.error( 'Contact missing for some reason...someone needs to replace '
               + 'this with a better error message because it is way too '
               + 'long...and uninformative.'
               );
      // I also don't know if I should log this to the server but this scenario
      // shouldn't ever happen unless the user signs in while on the contacts
      // page; but in that case half of this app is broken so I'm not
      // considering that as a real scenario...
    } else {
      req.body.contact_uuid = uuid;
      Db.ContactNodes.forge({ uuid: UUID.v4() })
        .save(req.body, { method: 'insert' })
        .then(function (node) {
          res.json(node.toJSON());
        });
    }
  };

  Contacts.restful.delete = function (req, res) {
    Db.ContactNodes.forge({ uuid: req.params.uuid })
      .save({ deletedAt: new Date() }, { patch: true, method: 'update' })
      .then(function () {
        res.json({ success: true });
      });
  };

  return {
    route: function (rest) {
      rest.get('/me/contact', Contacts.restful.get);
      rest.post('/me/contact', Contacts.restful.create);
      // rest.post('/me/contact/:uuid', Contacts.restful.update);
      rest.delete('/me/contact/:uuid', Contacts.restful.delete);
    }
  };
};
