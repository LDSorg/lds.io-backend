'use strict';

var createStripe = require('stripe')
  ;

module.exports.createRestless = function (config) {
  function Checkout() {
  }

  return Checkout;
};
module.exports.createRestful = function (config/*, DB*/) {
  var Checkout = module.exports.createRestless(config)
    , stripe = createStripe(config.stripe.secret)
    ;

  Checkout.restful = {};
  Checkout.restful.express = function (stripeToken, purchase) {
    var product = purchase
      , card = stripeToken
      ;

    //product = purchase && products[purchase.id];
    if (!purchase || !purchase.amount) {
      throw { error: { message: "nothing to purchase" } };
    }

    product = purchase;
    /*
    product = JSON.parse(JSON.stringify(product));
    if (!product.amount) {
      product.amount = purchase.amount;
    }
    */

    function addPurchaseToLog() {
      var receipt
        ;

      purchase.date = Date.now();
      // TODO send email
      // TODO create account
      // DB.Purchases().forge().save().then(function () {});
      //account.related('purchases').attach({ product: product.toJSON && product.toJSON(), transaction: purchase });
      //account.save();
      return receipt || product || purchase;
    }

    function makePurchase() {
      if (!product.amount) {
        // It's FREE!
        return addPurchaseToLog();
      }

      if (!stripeToken) {
        throw { error: { message: "no payment method" } };
      }

      console.log('[stripe.charges.create]');
      return stripe.charges.create({
        // https://support.stripe.com/questions/what-is-the-maximum-amount-i-can-charge-with-stripe
        amount: product.amount // amount in cents, again
      , currency: "usd"
      , card: card.id // may specify which card, or the primary will be used
      , customer: card.customer // always specify customer
      , capture: true
      }).then(addPurchaseToLog, function (err) {
        console.log('[err][stripe.charges.create]');
        throw { error: { message: "payment failed" }, details: err, card: card };
      });
    }

    if (stripeToken) {
      return makePurchase(stripeToken);
    }
  };

  return Checkout;
};

module.exports.create = function (app, config/*, DB*/) {
  var Checkout = module.exports.createRestful(config)
    ;

  Checkout.express = function(req, res) {
    Checkout.restful.express(req.body.stripeToken, req.body.transaction || req.body.purchase).then(function (receipt) {
      res.send(receipt);
    }, function (err) {
      // TODO if obj then wrap, else construct
      res.json({ error: err });
    });
  };

  function route(rest) {
    rest.post('/public/express-checkout', Checkout.restful.express);
  }

  return {
    route: route
  };
};
