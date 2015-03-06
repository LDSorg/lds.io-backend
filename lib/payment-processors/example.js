'use strict';

var createStripe = require('stripe')
  ;

function logErr(msg, reject) {
  return function (err) {
    console.error('ERROR: ' + msg);
    console.error('MESSAGE: ' + err);
    if (typeof reject === 'function') {
      reject(err);
    }
  };
}

module.exports.create = function (config) {
  var stripe = createStripe(config.stripe.secret)
    ;

  return {
    // placeholder for custom processor
    createCustomer: function (account) {
      return new Promise(function (resolve) {
        var cardcustomers = account.get('cardcustomers') || []
          , customer
          ;

        customer = {
          cardService: 'custom'
        , id: config.serviceType.secret && 'cus_' + (+new Date()).toString(36) + String(Math.random()).slice(2)
        , created: Math.floor(new Date() / 1000)
        };

        cardcustomers.push(customer);
        account.set('cardcustomers', cardcustomers);
        // we resolve with the customer to pass to addCard

        resolve(customer);
      });
    }
  , addCard: function (cardToken) {
      return function (customer) {
        // customer is passed from account or createCustomer
        // but we don't need it for this custom cardservice
        // we resolve with the card to pass to the save process
        cardToken.card.id = 'card_' + (+new Date()).toString(36) + String(Math.random()).slice(2);
        cardToken.card.customer = customer.id;
        // don't actually store card number in this demo!
        delete cardToken.number;
        return cardToken;
      };
    }
  , removeCard: function () {}
  , makeTestTransaction: function () {}
  };
};
