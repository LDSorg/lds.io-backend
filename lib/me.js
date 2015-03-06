'use strict';

module.exports.create = function (/*app, config, DB, Auth*/) {
  /*
  var Promise = require('bluebird').Promise
    ;
  */

  function Me() {
  }
  Me.restful = {};
  Me.restful.getSelected = function (req, res) {
    var account
      ;

    req.user.accounts.forEach(function (a) {
      if (a.id === req.user.selectedAccountId) {
        account = a;
      }
    });

    if (!account) {
      res.error(400, "You must select an account");
      return;
    }

    res.send(account.toJSON());
  };

  Me.restful.switchSelected = function (req, res) {
    var id = req.params.selectedAccountId
      ;

    req.user.accounts.forEach(function (a) {
      if (a.id === id) {
        req.user.selectedAccountId = id;
      }
    });

    if (req.user.selectedAccountId !== id) {
      res.error(400, "Your current session doesn't have access to that account. Try logging in again.");
      return;
    }

    res.send({});
  };


  function route(rest) {
    rest.get('/me', Me.restful.getSelected);
    rest.get('/me/switch/:selectedAccountId', Me.restful.switchSelected);
  }

  return {
    route: route
  };
};
