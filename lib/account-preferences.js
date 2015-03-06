'use strict';

module.exports.create = function (app, config, Auth) {

  // /me -> /accounts/:accountId
  function attachAccount(req, res, next) {
    console.log('ensuring req.me');
    if (req.me) {
      next();
      return;
    }

    if ('guest' === req.user.account.role) {
      res.send({ error: { message: "Sign in to your account to register a device" } });
      return;
    }

    req.me = req.me || {};
    req.me.get = req.me.get || function (attr) {
      var xattrs
        ;

      if ('xattrs' !== attr && req.user.account[attr]) {
        return req.user.account[attr];
      }

      if ('xattrs' !== attr) {
        throw new Error("'" + attr + "' not supported");
      }

      xattrs = req.user.account.xattrs = req.user.account.xattrs || {};
      xattrs.devices = xattrs.devices || [];
      xattrs.preferences = xattrs.preferences || {};
      xattrs.preferences.notifications = xattrs.preferences.notifications || [];
      return xattrs;
    };
    req.me.set = function (attr, val) {
      req.user.account[attr] = val;
    };
    req.me.save = function () {
      Auth.Accounts.save(req.user.account);
    };

    next();
  }
  app.use(config.apiPrefix + '/me/notifications', attachAccount);

  function route(rest) {
    var Preferences = {}
      ;

    Preferences.put = function (account, prefs) {
      account.get('xattrs').preferences.notifications = prefs.notifications;
    };

    rest.post('/me/preferences', function (req, res) {
      if (!req.body.notifications) {
        res.send({ error: { message: "only notifications are implemented at this time" } });
      }

      var x
        ;

      x = [
        { notifyOn: "auction-start" // auction start
        , ifIHave: "watched-item" // favorite-artist 
        , notifyThru: ['sms', 'email', 'push']
        }
      , { notifyOn: "auction-posted"
        , notifyThru: ['sms', 'email', 'push']
        }
      ];

      Preferences.put(req.me, req.body);
    });
  }

  return {
    route: route
  };
};
