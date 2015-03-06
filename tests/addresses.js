'use strict';

function init(config, DB) {
  var Addrs = require('../lib/account-addresses').createController(config, DB)
    , Accounts = require('../lib/accounts').createController(config, DB)
    , PromiseA = require('bluebird').Promise
    , tests
    , shared = {}
    ;

  function getMaryAddr() {
    return {
      addressee: "Mary Jane"
    , streetAddress: "000 Nowhere Ave"
    , extendedAddress: null
    , locality: "Burlington"
    , region: "Vermont"
    , pastalCode: "05401"
    , countryCode: "US"
    };
  }
  
  function getJohnAddr() {
    return {
      addressee: "John Doe"
    , streetAddress: "123 Sesame St"
    , extendedAddress: ["Claims Office", "Bldg 1 Ste B"]
    , locality: "Baywatch"
    , region: "California"
    , pastalCode: "90210"
    , countryCode: "US"
    };
  }

  function getBobAddr() {
    return {
      addressee: "Bob"
    , streetAddress: "Mario Circuit"
    , extendedAddress: ["Finance"]
    , locality: "Boston"
    , region: "Massachusetts"
    , pastalCode: "02128"
    , countryCode: "US"
    };
  }

  function setup() {
    var p
      ;

    //shared.accId = '310b4365-4359-434f-9224-5421158d7502';
    if (shared.accId) {
      p = Accounts.get(null, shared.accId);
    } else {
      p = Accounts.create(config, {});
    }

    return p.then(function ($acc) {
      return $acc.load(['addresses']).then(function () {
        shared.accId = $acc.id;
        shared.$acc = $acc;
        return $acc;
      });
    });
  }

  function teardown() {
    return PromiseA.resolve();
  }

  function finalTeardown() {
    var ps = []
      ;

    shared.$acc.related('addresses').forEach(function ($addr) {
      ps.push($addr.destroy());
    });

    return PromiseA.all(ps).then(function () {
      return shared.$acc.destroy();
    });
  }

  tests = [
    //
    //
    function addAddresses($account) {
      Promise.all(Addrs.add(
          null
        , $account
        , $account.related('addresses')
        , getJohnAddr()
        ).then(function ($addr) {
          shared.johnDoeAddr = $addr.id;

          if (1 !== $account.related('addresses').length) {
            throw new Error("should be exactly 1 address, not " + $account.related('addresses').length);
          }

          if ("John Doe" !== $addr.get('addressee')) {
            throw new Error("Didn't properly create address");
          }
        })
      , Addrs.add(
          null
        , $account
        , $account.related('addresses')
        , getBobAddr()
        ).then(function ($addr) {
          shared.bobAddr = $addr.id;

          if (2 !== $account.related('addresses').length) {
            throw new Error("should be exactly 2 addresses not " + $account.related('addresses').length);
          }

          if ("John Doe" !== $addr.get('addressee')) {
            throw new Error("Didn't properly create address");
          }
        })
      ).then(function () {
        if (2 !== $account.related('addresses').length) {
          throw new Error("should be exactly 2 addresses, instead has " + $account.related('addresses').length);
        }
      });
    }

    //
    //
  , function addShippingAddress($account) {
      return Addrs.upsertShipping(
        null
      , $account
      , $account.related('addresses')
      , getMaryAddr()
      ).then(function ($addr) {
        shared.maryJaneAddr = $addr.id; // $addr.get('uuid');

        if (shared.maryJaneAddr !== $account.get("shippingAddressId")) {
          throw new Error("Should have a shipping address on account");
        }

        if (shared.maryJaneAddr === $account.get("billingAddressId")) {
          throw new Error("Shouldn't yet have a billing address on account");
        }
      });
    }

    //
    //
  , function addBillingAddress($account) {
      return Addrs.upsertBilling(
        null, $account
      , $account.related('addresses')
      , {}
      , shared.maryJaneAddr
      ).then(function (/*$addr*/) {

        if (3 !== $account.related('addresses').length) {
          throw new Error("should be exactly 3 addresses, instead has " + $account.related('addresses').length);
        }

        if (!$account.get("billingAddressId")) {
          throw new Error("Should have a billing address id on account");
        }

        if (shared.maryJaneAddr !== $account.get("shippingAddressId")) {
          throw new Error("Should still have a shipping address id on account");
        }
      });
    }

    //
    //
  , function deleteImportantAddress($account) {
      return Addrs.upsertShipping(
        null
      , $account
      , $account.related('addresses')
      , {}
      , shared.maryJaneAddr
      ).then(function () {
        return Addrs.remove(
          null
        , $account
        , $account.related('addresses')
        , shared.maryJaneAddr
        ).then(function () {
          throw new Error("should have thrown an error");
        }).catch(function (err) {
          if (!/cannot/.test(err.message)) {
            throw new Error("error should have been 'cannot delete'");
          }

          return null;
        });
      });
    }

    //
    //
  , function deleteAddress($account) {
      console.log("DELETE");
      console.log('billingAddressId', $account.get('billingAddressId'));
      console.log('shippingAddressId', $account.get('shippingAddressId'));
      console.log('MJ', shared.maryJaneAddr);
      console.log('JD', shared.johnDoeAddr);
      return Addrs.remove(
        null
      , $account
      , $account.related('addresses')
      , shared.johnDoeAddr
      ).then(function (addr) {
        if (!addr) {
          throw new Error("should return deleted address");
        }

        if (!addr.addressee) {
          throw new Error("returned address should be plain json");
        }
      });
    }

    //
    //
  , function updateBillingAddress($account) {
      console.log("UPDATE");
      console.log('billingAddressId', $account.get('billingAddressId'));
      console.log('shippingAddressId', $account.get('shippingAddressId'));
      return Addrs.upsertBilling(
        null
      , $account
      , $account.related('addresses')
      , {}
      , shared.bobAddr
      ).then(function ($addr) {
        if (!$addr) {
          throw new Error("Should return existing john doe address");
        }

        if ($account.get('billingAddressId') !== shared.bobAddr) {
          throw new Error("Billing address should have been updated to bob");
        }

        if ($account.get('shippingAddressId') !== shared.maryJaneAddr) {
          throw new Error("Shipping address should have been updated");
        }
      });
    }

    //
    //
  , function rejectInvalidAddress() {
      return PromiseA.reject(new Error("validations not implemented"));
    }
  ];

  return {
    tests: tests
  , setup: setup
  , teardown: teardown
  , finalTeardown: finalTeardown
  };
}

module.exports.init = init;

if (require.main === module) {
  require('../tester').create(__filename);
}
