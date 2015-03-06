'use strict';

var config = require('../config')
  , path = require('path')
  , forEachAsync = require('forEachAsync').forEachAsync
  , PromiseA = require('bluebird').Promise
  ;

config.knex = {
  client: 'sqlite3'
//, debug: true
, connection: {
    filename : path.join(__dirname, '..', 'priv', 'knex.dev.sqlite3')
  , debug: true
  }
};

function init(DB) {
  var PaymentMethods = require('../lib/account-payment-methods').createRestless(config)
    , Auth = require('../lib/auth-logic').create(DB, config)
    , stripeTest = require('../lib/fixtures/stripe-test')
    , createStripe = require('stripe')
    , tests
    , count = 0
    , $account
    , $login
    , stripe
    ;

  function getFooAuth() {
    return { uid: 'foouser', secret: 'foosecret' };
  }

  function getFirst(el, i) { return 0 === i; }

  function getSampleCard(i) {
    var cards = []
      ;

    cards.push({
      card: {
        "number": '4242424242424242',
        "exp_month": 12,
        "exp_year": 2015,
        "cvc": '123'
      }
    });

    cards.push({
      card: {
        "number": '4242424242424242',
        "exp_month": 1,
        "exp_year": 2017,
        "cvc": '777'
      }
    });

    return cards[i];
  }

  function setup() {
    stripe = createStripe(stripeTest.secret);
    return Auth.LocalLogin.create(getFooAuth()).then(function (_$login) {
      $login = _$login;

      if ($login.related('accounts').length) {
        return $login.related('accounts').filter(getFirst)[0];
      }

      return Auth.Accounts.create({ role: 'test'/*, email: ''*/ }).then(function (_$account) {
        return Auth.Logins.linkAccounts(_$login, [_$account]).then(function () {
          return Auth.Logins.setPrimaryAccount(_$login, _$account).then(function () {
            return _$account;
          });
        });
      });
    }).then(function (_$account) {
      $account = _$account;
      return $account;
    });
  }

  function teardown() {
    var $accounts
      , ps = []
      ;

    $accounts = $login.related('accounts');

    return $login.related('accounts').detach().then(function () {
      $accounts.forEach(function ($a) {
        ps.push($a.destroy());
      });

      ps.push($login.destroy());

      $account = null;
      $login = null;

      return PromiseA.all(ps);
    });
  }

  tests = [
    /*
    function () {
      return stripe.tokens.create(getSampleCard(0)).then(function (stripeToken) {
        if (!stripeToken) {
          throw new Error('No stripe token');
        }

        if ('string' !== typeof stripeToken.id) {
          console.error(stripeToken);
          console.error(typeof stripeToken.id);
          console.error(stripeToken.id);
          throw new Error('no token.id');
        }

        return stripeToken.id;
      });
    }
  , function () {
      return stripe.tokens.create(getSampleCard(0)).then(function (stripeToken) {
        var tokenId = stripeToken.id
          ;

        return PaymentMethods.addCard(
          $account
        , { service: 'stripe', tokenId: tokenId }
        , { stripe: stripeTest } // config
        ).then(function (card) {
          var customers = $account.get('cardcustomers')
            , foundCust = 0
            , methods = $account.get('paymentMethods')
            , m
            ;

          customers.forEach(function (cust) {
            if ('stripe' === cust.service) {
              foundCust += 1;
            }
          });

          if (1 !== foundCust) {
            console.error(customers);
            throw new Error('Did not find customer');
          }

          if (!methods.some(function (method) {
            if (method.id === card.id) {
              m = method;
              return true;
            }
          })) {
            console.error(methods);
            throw new Error('Did not find payment method');
          }

          if (!m.createdAt) {
            throw new Error('no idea how old this payment method is');
          }

          return null;
        });
      });
    }
  , function () {
      return stripe.tokens.create(getSampleCard(0)).then(function (stripeToken) {
        var tokenId = stripeToken.id
          ;

        return PaymentMethods.addCard(
          $account
        , { service: 'stripe', tokenId: tokenId }
        , { stripe: stripeTest, authAmount: 1000000, captureRefundAmount: 100 } // config
        ).then(function (card) {
          var methods = $account.get('paymentMethods')
            , m
            ;

          if (!methods.some(function (method) {
            if (method.id === card.id) {
              m = method;
              return true;
            }
          })) {
            console.error(methods);
            throw new Error('Did not find payment method');
          }

          if (!m.authAmount) {
            throw new Error('no idea how much this card is good for');
          }

          if (!m.updatedAt) {
            throw new Error('no idea when this card was last authorized');
          }

          return null;
        });
      });
    }
  , 
    */
    function () {
      var ps = []
        ;

      ps.push(stripe.tokens.create(getSampleCard(0)));
      ps.push(stripe.tokens.create(getSampleCard(1)));

      return PromiseA.all(ps).then(function (tokens) {
        var ps1 = []
          ;

        tokens.forEach(function (stripeToken) {
          ps1.push(PaymentMethods.addCard(
            $account
          , { service: 'stripe', tokenId: stripeToken.id }
          , { stripe: stripeTest, authAmount: 1000000, captureRefundAmount: 100 } // config
          ));
        });

        return PromiseA.all(ps1);
      }).then(function () {
        var ps2 = []
          ;

        console.log('blah blah');
        $account.get('paymentMethods').forEach(function (pm) {
          console.log(pm);
          ps2.push(PaymentMethods.removeCard($account, pm.id, { stripe: stripeTest }));
        });

        return PromiseA.all(ps2);
      });
    }
  ];

  forEachAsync(tests, function (next, fn) {
    setup().then(fn).then(teardown).then(function () {
      count += 1;
      next();
    }, function (err) {
      console.error('[ERROR] failure 1');
      console.error(err);
      console.error(fn.toString());

      return teardown().then(function () {
        throw err;
      });
    });
  }).then(function () {
    console.info('%d of %d tests complete', count, tests.length);
    process.exit();
  });
}

module.exports.create = function () {
  config.knexInst = require('../lib/knex-connector').create(config.knex);
  require('../lib/bookshelf-models').create(config, config.knexInst).then(init);
};

module.exports.create();
