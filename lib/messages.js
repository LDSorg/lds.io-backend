'use strict';

module.exports.create = function (Db/*app, config, Auth, manualLogin*/) {
  var _ = require('lodash')
    ;

  // set lodash template syntax to be like mustache
  _.templateSettings = {
    evaluate:    /\{\{(.+?)\}\}/g,
    interpolate: /\{\{=(.+?)\}\}/g,
    escape: /\{\{-(.+?)\}\}/g
  };

  function route(rest) {
    var Messages = {}
      ;
    
    // given a message such as 
    function messageBuilder (account) {
      return function (collection) {
        var messages = []
          ;
        collection.forEach(function (accountsMessage) {
          var message = accountsMessage.related('message')
            ;
          messages.push({
            id: message.get('uuid')
          , date: message.get('createdAt').toISOString()
          , text: _.template(message.get('template'), 
            {
              user: account || accountsMessage.related('acccount')
            })
          });
        });
        return messages;
      };
    }
    
    // add a single message to the system
    // accepts an object with a property `template` like "Hi {{user.fname}}, you've got mail!"
    // and optionally an accountId
    // in the future it may support groups
    // and create one raccounts_messages record for each recipient
    Messages.add = function (messageData) {
      return Db.Messages.forge({
        template: messageData.template
      }).save().then(function (message) {
        return Db.AccountsMessages.forge({
          messages_uuid: message.get('uuid')
        , accounts_uuid: messageData.accountId || null
        , sent: null
        , read: null
        });        
      });
    };
    
    // send all the unsent messages in the system
    // returns Promise
    Messages.send = function () {
      return Messages.findUnsent().then(function (messages) {
        // TODO: actually send via push, email, etc. and use Promise.all
      });
    };
    
    // find all the unread messages for the given account
    // returns Promise that will resolve with an array of messages like this:
    // { id: "123", date: "2014-08-07 00:00:00", text: "Hi Joe, you've got mail!" }
    Messages.findMine = function (account) {
      return Db.AccountsMessages.query(function (qb) {
        qb.whereNull('read')
          .andWhere('account_uuid', account.uuid)
        ;
      }).fetchAll({
        withRelated: ['message']
      }).then(messageBuilder(account));
    };
    
    // find all the unsent messages in the entire system
    // returns Promise that will resolve with an array of messages like this:
    // { id: "123", date: "2014-08-07 00:00:00", text: "Hi Joe, you've got mail!" }
    Messages.findUnsent = function () {
      return Db.AccountsMessages.query(function (qb) {
        qb.whereNull('sent');
      }).fetchAll({
        withRelated: ['message','account']
      }).then(messageBuilder());      
    };
    
    // find a message by accounts_messages.uuid
    // and mark it as read
    // returns Promise
    Messages.markAsRead = function (accountsMessagesId) {
      return new Db.AccountsMessages({ uuid: accountsMessagesId }).fetch(function (model) {
        model.set('read', new Date());
        return model.save();
      });      
    };
    
    function addMessage (req, res) {
      Messages.add(req.body).done(function () {
        res.send({ success: true });
      }
      , function (err) {
        res.send({ error: err });
      });
    }
    
    function sendQueuedMessages (req, res) {
      Messages.send().done(function () {
        res.send({ success: true });
      }
      , function (err) {
        res.send({ error: err });
      });      
    }
    
    function markAsRead (req, res) {
      Messages.markAsRead(req.params.messageId).done(function () {
        res.send({ success: true });
      }
      , function (err) {
        res.send({ error: err });
      });
    }
    
    function getMyMessages (req, res) {
      Messages.findMine(req.me).done(function (messages) {
        res.send(messages);
      }
      , function (err) {
        res.send({ error: err });
      });
    }
    
    rest.post('/messages', addMessage);
    rest.post('/messages/send', sendQueuedMessages);
    rest.post('/messages/:accountsMessagesId/read', markAsRead);
    rest.get('/me/messages', getMyMessages);
  }

  return {
    route: route
  };
};
