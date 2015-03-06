'use strict';

var createStripe = require('stripe')
  , caches = {}
  ;

function logErr(msg, reject) {
  return function (err) {
    console.error('[Processor ERROR]');
    console.error('MESSAGE: ' + msg);
    console.error(err);

    if (typeof reject === 'function') {
      reject(err);
    } else {
      throw err;
    }
  };
}

module.exports.create = function (config) {
  var PromiseA = require('bluebird').Promise
    , stripe
    ;

  stripe = caches[config.stripe.id];
  if (!stripe) {
    // https://github.com/stripe/stripe-node
    stripe = createStripe(config.stripe.secret);
    caches[config.stripe.id] = stripe;
  }

  // when adding a card with Stripe, cardToken will look like the following:
  /*
  { "id": "tok_14I7Rh2eZvKYlo2CyCiFXD27"
  , "livemode": false
  , "created": 1405813253
  , "used": false
  , "object": "token"
  , "type": "card"
    "card": {
      "id": "card_14I7Rh2eZvKYlo2C6Aa06QJQ"
    , "object": "card"
    , "last4": "1111"
    , "brand": "Visa"
    , "funding": "unknown"
    , "exp_month": 4
    , "exp_year": 2018
    , "fingerprint": "tiDP36QdYA6X7km8"
    , "country": "US"
    , "name": "user@example.com"
    , "address_line1": null
    , "address_line2": null
    , "address_city": null
    , "address_state": null
    , "address_zip": "84101"
    , "address_country": null
    , "customer": null
    }
  , "email": "user@example.com"
  }
  */

  function S() {
  }

  S.createCustomer = function (details) {
    // run stripe.customers.create
    return new PromiseA(function (resolve, reject) {
      // https://stripe.com/docs/api#create_customer
      return stripe.customers.create({
        description: details.name
      , email: details.email
      }).then(function (customer) {
        resolve(customer);
      }, reject);
    });
  };

  S.addCard = function (customer, tokenIdOrCardId) {
    // customer is passed from account or createCustomer
    return stripe.customers.createCard(customer.id, {
      // cardToken.id for tokens created by stripe checkout API popup window
      // and cardToken.card for custom card screens
      card: tokenIdOrCardId
    }).then(
      function (card) {
        if (!card.customer) {
          // TODO BUG move to test
          throw new Error('no customer associated with card');
        }
        return card;
      }
    , logErr('addCard - stripe.customers.createCard')
    );
  };

  S.testCard = function (card, config) {
    // authAmount, captureRefundAmount
    // https://stripe.com/docs/api#create_charge
    return stripe.charges.create(
      // https://support.stripe.com/questions/what-is-the-maximum-amount-i-can-charge-with-stripe
      // 100 = $1.00
      { amount: parseInt(config.authAmount, 10) || 100
      , currency: "usd"
      , card: card.id
      , customer: card.customer
      , capture: false
      }
    ).then(
      function (charge) {
        // https://stripe.com/docs/api/node#charge_capture
        if (parseInt(config.captureRefundAmount, 10)) {
          return stripe.charges.capture(charge.id, { amount: config.captureRefundAmount });
        }

        return charge;
      }
    , logErr('makeTestTransaction - stripe.charges.create')
    ).then(
      function (charge) {
        // https://stripe.com/docs/api#create_refund
        return stripe.charges.refund(charge.id);
      }
    , logErr('makeTestTransaction - stripe.charges.capture')
    ).catch(logErr('makeTestTransaction - stripe.charges.capture'))
    ;
  };

  S.removeCard = function (customerId, cardId) {
    // resolve promise when account has saved and stripe has processed the request
    return stripe.customers.deleteCard(customerId, cardId).then(
      function (thing) {
        return thing || null;
      }
    , logErr('removeCard - stripe.customers.deleteCard customerId=' + customerId + ' cardId=' + cardId)
    );
  };

  return S;
};
