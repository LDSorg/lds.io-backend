'use strict';

var UUID = require('node-uuid')
  , PromiseA = require('bluebird').Promise
  ;

module.exports.createController = function (defaultConfig, DB) {
  function Addresses() {
  }

  Addresses.add = function (config, $account, $addresses, newAddr) {
    // TODO addresses should not be constrained by state
    // (and an address should be able to be both shipping and billing, etc)
    if ($addresses.some(function ($address) {
      if ($address.get('type') && $address.get('type') === newAddr.type) {
        return true;
      }
    })) {
      return PromiseA.reject({ message: "you already have a shipping address" });
    }

    newAddr.uuid = newAddr.uuid || UUID.v4();
    newAddr.accountUuid = $account.id;

    return DB.Addresses.forge().save(newAddr, { method: 'insert' }).then(function ($addr) {
      $account.related('addresses').models.push($addr);
      $account.related('addresses').length += 1;
      return $addr;
    });
  };

  Addresses.remove = function (config, $account, $addresses, addrId) {
    var $addr
      ;

    return new PromiseA(function (resolve) {
      resolve();
    }).then(function () {
      addrId = addrId && addrId.id || addrId;

      if (addrId === $account.get('shippingAddressId')) {
        return PromiseA.reject(new Error("cannot delete address because it is the shipping address."));
      }

      if (addrId === $account.get('billingAddressId')) {
        return PromiseA.reject(new Error("cannot delete address because it is the billing address."));
      }

      $addresses.forEach(function ($a) {
        if ($a.id === addrId) {
          $addr = $a;
        }
      });
    }).then(function () {
      var json = $addr.toJSON()
        ;

      return $addr.set('accountUuid', null).save().then(function () {
        return json;
        //return null;
      });
    });
  };

  Addresses.update = function (config, $account, $addresses, updates, addrId) {
    var $address
      ;

    // TODO add types that are data-related 'residential|commercial|pobox',

    //address = new DB.Addresses(req.body.addrId)
    //address.save(req.body, { patch: true }).then(function (address)

    $addresses.some(function ($_address) {
      if ($_address.id === addrId) {
        $address = $_address;
        return true;
      }
    });

    if (!$address) {
      return PromiseA.reject({ message: "address does not exist '" + addrId + "'" });
    }

/*
    Object.keys(updated).forEach(function (key) {
      address.set(key, updated[key]);
    });
*/

    return $address.save(updates, { patch: true }).then(function ($addr) {
      //$account.related('addresses').models.push($addr);
      //$account.related('addresses').length += 1;
      return $addr;
    });
  };

  Addresses.upsert = function (config, $account, $addresses, updates, addrId) {
    if (addrId) {
      updates.id = addrId;
      return Addresses.update(config, $account, $addresses, updates, addrId);
    } else {
      return Addresses.add(config, $account, $addresses, updates);
    }
  };

  Addresses.upsertShipping = function (config, $account, $addresses, updates, addrId) {
    return Addresses.upsert(config, $account, $addresses, updates, addrId).then(function ($addr) {
      if ($account.get('shippingAddressId') !== $addr.id) {
        return $account.set('shippingAddressId', $addr.id).save().then(function () {
          return $addr;
        });
      }
    });
  };

  Addresses.upsertBilling = function (config, $account, $addresses, updates, addrId) {
    //delete updates.type;

    return Addresses.upsert(config, $account, $addresses, updates, addrId).then(function ($addr) {
      if ($account.get('billingAddressId') !== $addr.id) {
        return $account.set('billingAddressId', $addr.id).save().then(function () {
          return $addr;
        });
      }
    });
  };

  return Addresses;
};

module.exports.createView = function (defaultConfig, DB) {
  var Addresses = module.exports.createController(defaultConfig, DB)
    , r
    ;

  r = Addresses.restful = {};

  r.add = function (req, res) {
    var newAddr = req.body
      , $account = req.user.account
      , $addresses = $account.related('addresses')
      ;

    Addresses.add(req.config, $account, $addresses, newAddr).then(function (address) {
      res.send(address.toJSON());
    }).error(function (err) {
      res.error(err);
    }).catch(function (err) {
      res.error(err);
      console.error("ERROR Addr Add");
      console.error(err);
      throw err;
    });
  };

  r.update = function (req, res) {
    var $account = req.user.account
      , $addresses = $account.related('addresses')
      , addrId = req.params.addressId
      , updates = req.body
      ;

    Addresses.update(req.config, $account, $addresses, updates, addrId).then(function (address) {
      res.send(address.toJSON());
    }).error(function (err) {
      res.error(err);
    }).catch(function (err) {
      res.error(err);
      console.error("ERROR Addr Update");
      console.error(err);
      throw err;
    });
  };

  r.remove = function (req, res) {
    var $account = req.user.account
      , $addresses = $account.related('addresses')
      , addrId = req.params.addressId
      ;

    Addresses.remove(req.config, $account, $addresses, addrId).then(function (addresses) {
      res.send((addresses && addresses.toJSON() || []));
    }).error(function (err) {
      res.error(err);
    }).catch(function (err) {
      res.error(err);
      console.error("ERROR Addr Rm");
      console.error(err);
      throw err;
    });
  };

  r.upsertShipping = function (req, res) {
    var $account = req.user.account
      , $addresses = $account.related('addresses')
      , addrId = req.params.addressId
      , addr = req.body
      ;

    return Addresses.upsertShipping(req.config, $account, $addresses, addr, addrId)
      .then(function () {
        res.send({ success: true });
      }).error(function (err) {
        res.error(err);
      }).catch(function (err) {
        console.error("ERROR upsert addresses");
        console.error(err);
        res.error(err);
        throw err;
      });
  };

  r.upsertBilling = function (req, res) {
    var $account = req.user.account
      , $addresses = $account.related('addresses')
      , addrId = req.params.addressId
      , addr = req.body
      ;

    return Addresses.upsertBilling(req.config, $account, $addresses, addr, addrId)
      .then(function () {
        res.send({ success: true });
      }).error(function (err) {
        res.error(err);
      }).catch(function (err) {
        console.error("ERROR upsert addresses");
        console.error(err);
        res.error(err);
        throw err;
      });
  };

  return Addresses;
};

module.exports.createRouter = function (app, defaultConfig, DB) {
  var Addresses = module.exports.createView(defaultConfig, DB)
    , r = Addresses.restful
    ;

  function requireAddresses(req, res, next) {
    req.user.account.load(['addresses']).then(function () {
      next();
    });
  }

  app.use(defaultConfig.apiPrefix + '/me/addresses', requireAddresses);
  app.use(defaultConfig.apiPrefix + '/me/billing-addresses', requireAddresses);
  app.use(defaultConfig.apiPrefix + '/me/shipping-addresses', requireAddresses);

  function route(rest) {
    rest.post('/me/addresses/billing-address', r.upsertBilling);
    rest.post('/me/addresses/billing-address/:addressId', r.upsertBilling);

    rest.post('/me/addresses/shipping-address', r.upsertShipping);
    rest.post('/me/addresses/shipping-address/:addressId', r.upsertShipping);

    rest.post('/me/addresses', r.add);
    rest.post('/me/addresses/:addressId', r.update);

    rest.post('/me/billing-address', r.upsertBilling);
    rest.post('/me/billing-address/:addressId', r.upsertBilling);

    rest.post('/me/shipping-address', r.upsertShipping);
    rest.post('/me/shipping-address/:addressId', r.upsertShipping);

    rest.delete('/me/addresses/:addressId', r.remove);
  }

  return  {
    route: route
  };
};

module.exports.create = module.exports.createRouter;
