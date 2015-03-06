  , products = require('./products')
//  app.use(config.apiPrefix + '/me/purchases', attachAccount);


//    // TODO fix to be config.publicApi
//    rest.get('/public/store/products', function (req, res) {
//      var productsArr
//        ;
//
//      productsArr = Object.keys(products)
//        .map(function (k) { products[k].id = k; return products[k]; });
//
//      res.send(productsArr);
//    });
//    rest.post('/me/purchases', function (req, res) {
//      console.log('/me/purchases req.me');
//      console.log(req.me);
//      var account = req.me
//        , stripeToken = req.body.stripeToken
//        , purchase = req.body.transaction || req.body.purchase
//        , product
//        ;
//
//      product = purchase && products[purchase.id];
//      if (!product) {
//        res.send({ error: { message: "nothing to purchase" } });
//        return;
//      }
//
//      product = JSON.parse(JSON.stringify(product));
//      if (!product.amount) {
//        product.amount = purchase.amount;
//      }
//
//      function addProductToUser() {
//        console.log('[addProductToUser] 0');
//        // TODO more transaction details - coupon, discount, quantity, etc
//        console.log(1, account.get('xattrs'));
//        console.log(2, account.get('xattrs').purchases);
//        console.log(3, product.toJSON && product.toJSON());
//        console.log(3, product);
//        console.log(4, purchase);
//        purchase.date = Date.now();
//        account.get('xattrs').purchases.push({ product: product.toJSON && product.toJSON(), transaction: purchase });
//        console.log('[addProductToUser] 1');
//        account.save();
//        console.log('[addProductToUser] 2');
//        res.send(product.toJSON && product.toJSON() || product);
//        console.log('[addProductToUser] 3');
//      }
//
//      function makePurchase() {
//        console.log('[make-purchase] 00');
//        if (!product.amount) {
//          // It's FREE!
//          addProductToUser();
//          return;
//        }
//
//        var card
//          ;
//
//        account.get('xattrs').paymentMethods.some(function (_card) {
//          if (account.get('xattrs').primaryFundingSource === _card.id) {
//            card = _card;
//            return true;
//          }
//        });
//        card = card || account.get('xattrs').paymentMethods[0];
//
//        if (!card) {
//          res.send({ error: { message: "no payment method" } });
//          return;
//        }
//        account.get('xattrs').primaryFundingSource = card.id;
//
//        console.log('[stripe.charges.create]');
//        stripe.charges.create({
//          // https://support.stripe.com/questions/what-is-the-maximum-amount-i-can-charge-with-stripe
//          amount: product.amount // amount in cents, again
//        , currency: "usd"
//        , card: card.id // may specify which card, or the primary will be used
//        , customer: card.customer // always specify customer
//        , capture: true
//        }).then(addProductToUser, function (err) {
//          console.log('[err][stripe.charges.create]');
//          res.send({ error: { message: "payment failed" }, details: err, card: card });
//        });
//      }
//
//      if (stripeToken) {
//        console.log('[has-stripe-token]');
//        restfulAddCard(account, 'stripe', stripeToken).then(makePurchase, function (err) {
//          console.log(account.get('xattrs').paymentMethods);
//          console.error('[ERROR] add card, make purchase');
//          console.error(err);
//          res.send({ error: err });
//        });
//      } else {
//        console.log('[make-purchase] 11');
//        makePurchase();
//      }
//    });

