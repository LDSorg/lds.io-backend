'use strict';

// You'll see some stuff like
// A-18-C
// 
// numbers are in order of operation
// A is happens after login, but before the allow process
// B is part of the allow process
// C happens when the user is logged in and already-allowed
//
// D only happens in the grant_type=client_credentials flow
// E only happens in the grant_type=password (resource owner password) flow
// F happens during the response_type=token (implicit) flow


// TODO [enhancement]
// Issue Refresh Tokens
// http://rwlive.wordpress.com/2014/06/24/oauth2-resource-owner-password-flow-using-oauth2orize-express-4-and-mongojs/

// TODO [idea]
// use a JWT tokens as bearer tokens (with minimal meta)?

/**
 * Module dependencies.
 */
var oauth2orize = require('oauth2orize');
  //, login = require('connect-ensure-login')
var secretutils = require('secret-utils');
  //, escapeRegExp = require('escape-string-regexp')
var UUID = require('node-uuid');
  //, PromiseA = require('bluebird').PromiseA

module.exports.create = function (passport, config, DB, Auth) {
  var server
      // in-memory only
    , TxTok
    , scopeutils = require('wasteful-scope').create(config.scopeGroups || {})
    , getScopeDelta = scopeutils.getScopeDelta
    ;


  function Scopes() {
  }
  Scopes.merge = scopeutils.merge;
  Scopes.set = function (accountUuid, oauthclientUuid, values) {
    return DB.Scopes.forge({
      account_uuid: accountUuid
    , oauthclient_uuid: oauthclientUuid
    }).fetch().then(function ($scope) {
      if ($scope) {
        console.log('in the bit');
        return DB.Scopes.forge({
        //return $scope.save({
          account_uuid: accountUuid
        , oauthclient_uuid: oauthclientUuid
        }).save({
          values: Scopes.merge($scope.get('values'), values)
        }, { method: 'update'});
      }

      return DB.Scopes.forge().save({
        accountUuid: accountUuid
      , oauthclientUuid: oauthclientUuid
      , values: values
      }, { method: 'insert' });
    });
  };

  Scopes.lookup = function (accountUuid, oauthclientUuid) {
    return DB.Scopes.forge({
      account_uuid: accountUuid
    , oauthclient_uuid: oauthclientUuid
    }).fetch().then(function ($scope) {
      if (!$scope) {
        return null;
      }
      return $scope.get('values');
    });
  };

  function createTxTok() {
    var transactionTokens = {}
      ;

    function TxTok() {
    }
    TxTok.create = function () {
      return UUID.v4(); //utils.uid(256);
    };
    TxTok.put = function (token, stuff) {
      transactionTokens[token] = {
        timeout: setTimeout(function () {
          delete transactionTokens[token];
        }, 5 * 60 * 1000)
      , data: stuff
      };
    };
    TxTok.del = function (token) {
      var stuff = transactionTokens[token]
        ;
        
      delete transactionTokens[token];

      if (!stuff) {
        return null;
      }

      clearTimeout(stuff.timeout);

      return stuff.data;
    };
    TxTok.get = function (token) {
      var stuff = transactionTokens[token]
        ;
   
      return stuff && stuff.data;
    };
    return TxTok;
  }
  
  TxTok = createTxTok();

  // create OAuth 2.0 server
  server = oauth2orize.createServer();

  // Register serialialization and deserialization functions.
  //
  // When a client redirects a user to user authorization endpoint, an
  // authorization transaction is initiated.  To complete the transaction, the
  // user must authenticate and approve the authorization request.  Because this
  // may involve multiple HTTP request/response exchanges, the transaction is
  // stored in the session.
  //
  // An application must supply serialization functions, which determine how the
  // client object is serialized into the session.  Typically this will be a
  // simple matter of serializing the client's ID, and deserializing by finding
  // the client by ID from the database.
  server.serializeClient(function ($apikey, done) {
    var apikey = $apikey.toJSON && $apikey.toJSON() || $apikey
      ;

    console.log('[A-09] [serializeClient]');

    // TODO might need to change
    done(null, apikey.id || apikey);
  });

  server.deserializeClient(function (apikeyId, done) {
    console.log('[B-15] [deserializeClient]');

    // TODO this will create, but should be replaced with a separate db
    // that does not auto-create
    Auth.AppLogin.lookup(null, apikeyId, { id: true }).then(function ($apikey) {
      if (!$apikey) {
        done(new Error("API Key not found"));
        return;
      }

      done(null, $apikey);
    }, function (err) {
      done(err);
    });
  });

  // Register supported grant types.
  //
  // OAuth 2.0 specifies a framework that allows users to grant client
  // applications limited access to their protected resources.  It does this
  // through a process of the user granting access, and the client exchanging
  // the grant for an access token.

  // Grant authorization codes.  The callback takes the `client` requesting
  // authorization, the `redirectURI` (which is used as a verifier in the
  // subsequent exchange), the authenticated `user` granting access, and
  // their response, which contains approved scope, duration, etc. as parsed by
  // the application.  The application issues a code, which is bound to these
  // values, and will be exchanged for an access token.
  server.grant(oauth2orize.grant.code(function ($apikey, redirectURI, reqUser, ares, done) {
    console.log('[B-21-C] [response_type=code] [create]');

    var code = $apikey.id + ':' + secretutils.alphanum(16)
      , authInfo = ares
      , $login = reqUser.$login
      , $oauthclient = $apikey.related('oauthclient')
      , accounts = []
      , grantValues
      ;

    reqUser.accounts.forEach(function ($a) {
      if ($a.id === authInfo.selectedAccountId) {
        accounts.push($a);
        return true;
      }
    });

    if (!accounts.length) {
      console.error(authInfo.selectedAccountId);
      console.error(reqUser.accounts);
      throw new Error('[response_type=code] [create] selectedAccountId was not found amongst accounts');
    }

    authInfo.grantedScopeString = scopeutils.merge(
      authInfo.grantedScopeString
    , authInfo.acceptedScopeString
    );

    grantValues = {
      apikeyId: $apikey.id
    , oauthclientUuid: $oauthclient.id
    , loginId: $login.id
    , selectedAccountId: authInfo.selectedAccountId
    , accounts: accounts
    , requestedScopeString: authInfo.requestedScopeString
    , acceptedScopeString: authInfo.acceptedScopeString
    , grantedScopeString: authInfo.grantedScopeString
      // TODO this is response_type=code, not grant_type=authorization_code
    , redirectURI: redirectURI
    , ts: Date.now()
    };

    function fin() {
      TxTok.put(code, grantValues);

      done(null, code);
    }

    if (!authInfo.deltaScopeString) {
      fin();
      return;
    }

    Scopes.set(
      authInfo.selectedAccountId
    , authInfo.oauthclientUuid
    , authInfo.grantedScopeString
    ).then(fin).catch(done);
  }));

  // Grant a token (implicitly) if the user has already approved the scope greater
  // than or equal to that which is being requested now
  // TODO (I'm not sure that the comment above is correct)
  // Grant a token to a browser / mobile app (by id, without secret)
  // without going through the process of issuing a grant code and redeeming the code server-side
  // These codes should be shorter-lived or have fewer privileges than those
  // request with apps that go through the normal flow
  server.grant(oauth2orize.grant.token(function ($apikey, reqUser, ares, done) {
    console.log('[B-21-F] [grant token (implicit)]');

    var authInfo = ares
      , tokenMeta
      , $login = reqUser.$login
      , $oauthclient = $apikey.related('oauthclient')
      , accounts = []
      , refreshToken // = undefined
      , params = { expiresIn: undefined }
      ;

    authInfo.grantType = 'implicit';
    //console.log('[authInfo]', Object.keys(authInfo));
    // [ 'apikeyId', 'oauthclientUuid', 'originalScopeArr', 'debug_infoInCheckAuthScope'
    // , 'client', 'transactionId', 'selectedAccountId', 'acceptedScopeString', 'allow' ]

    if ($oauthclient.id !== authInfo.oauthclientUuid) {
      throw new Error("Sanity Check Fail: client is not the original requester");
    }

    reqUser.accounts.forEach(function ($a) {
      if ($a.id === authInfo.selectedAccountId) {
        accounts.push($a);
        return true;
      }
    });

    if (!accounts.length) {
      throw new Error('[grant token (implicit)] selectedAccountId was not found amongst accounts');
    }

    tokenMeta = {
      apikeyId: $apikey.id
    , oauthclientUuid: $oauthclient.id
    , loginId: $login.id
    , selectedAccountId: authInfo.selectedAccountId
    , accounts: accounts
    , requestedScopeString: authInfo.requestedScopeString
    , acceptedScopeString: authInfo.acceptedScopeString
    , test: $apikey.get('test') || $oauthclient.get('test')
    , insecure: $apikey.get('insecure') || $oauthclient.get('insecure')
    , grantType: 'implicit' // authInfo.grantType
    };

    return Auth.AccessTokens.create(tokenMeta).then(function ($token) {
      done(null, $token.get('token'), refreshToken, params);
    }).catch(function (err) {
      console.error("ERROR grant token, create access token");
      console.error(err);
      done(err);

      throw err;
    });
  }));

  // Exchange authorization codes for access tokens.  The callback accepts the
  // `client`, which is exchanging `code` and any `redirectURI` from the
  // authorization request for verification.  If these values are validated, the
  // application issues an access token on behalf of the user who authorized the
  // code.
  server.exchange(oauth2orize.exchange.code(function ($apikey, code, redirectURI, done) {
    // Client gets authorized before getting an exchange code
    console.log('[B-24-C] [grant code] [redeem]');
    console.log("GRANT CODE 2", code);

    var grantValues = TxTok.del(code)
      , $oauthclient = $apikey.related('oauthclient')
      , refreshToken // = undefined
      , params = { expiresIn: undefined }
      ;

    if (!grantValues) {
      console.error('[oauth2orize-logic] grant code exchange');
      console.error(code);
      console.error($oauthclient);

      done(new Error('Invalid Grant Code'));
      return;
    }

    /*
    console.log('$oauthclient.id', $oauthclient.id);
    console.log('[redeem grant] grantValues');
    console.log(grantValues);
    */

    if ($oauthclient.id !== grantValues.oauthclientUuid) {
      console.error("[redeem grant] [bad id] oauthclient");
      console.error($oauthclient.id, grantValues.oauthclientUuid);
      console.error($oauthclient);
      return done(null, false);
    }

    // TODO something with the redirectURI
    //if (redirectURI !== authCode.redirectURI) { return done(null, false); }
      
    // TODO all of these should use realCreate
    return DB.Accounts
      .forge({ uuid: grantValues.selectedAccountId })
      .fetch()
      .then(function ($account) {
        var tokenMeta
          , accounts = []
          ;

        if ($account) {
          accounts.push($account);
        }

        if (!grantValues.selectedAccountId) {
          throw new Error('[grant code] [redeem] selecteAccountId not specified');
        }

        if (!accounts.length) {
          throw new Error('[grant code] [redeem] selectedAccountId was not found amongst accounts');
        }

        tokenMeta = {
          apikeyId: grantValues.apikeyId
        , oauthclientUuid: grantValues.oauthclientUuid
        , loginId: grantValues.loginId
        , selectedAccountId: grantValues.selectedAccountId
        , accounts: accounts
        , requestedScopeString: grantValues.requestedScopeString
        , acceptedScopeString: grantValues.acceptedScopeString
        , test: $apikey.get('test') || $oauthclient.get('test')
        , insecure: $apikey.get('insecure') || $oauthclient.get('insecure')
        , grantType: 'authorization_code'
        };

        return Auth.AccessTokens.create(tokenMeta).then(function ($token) {
          done(null, $token.get('token'), refreshToken, params);
          return ;
        });
      }).catch(function (err) {
        console.error("ERROR exch code");
        console.error(err);
        done(err);

        throw err;
      });
  }));

  // Exchange user id and password for access tokens.  The callback accepts the
  // `client`, which is exchanging the user's name and password from the
  // authorization request for verification. If these values are validated, the
  // application issues an access token on behalf of the user who authorized the code.
  server.exchange(oauth2orize.exchange.password(function ($apikey, username, password, scopeArr, done) {
    console.log('[E] grant_type=password]');

    // TODO
    // the app should not be able to request scope greater than
    // what has been granted through the noraml oauth flow
    // (or specially granted by an admin)

    var $oauthclient = $apikey.related('oauthclient')
      ;

    // Validate the user
    // This type of validation can be used in the (rare) case that users are application specific
    // Or if the application is the root application
    Auth.LocalLogin.login({
      uid: username
    , secret: password

      // might be useful in the future
    , oaouthclientUuid: $oauthclient.id
    //, $oauthclient: $client
    , apikeyId: $apikey.id
    //, $apikey: $apikey
    }).then(function ($login) {
      var tokenMeta
        , refreshToken // = undefined
        , params = { expiresIn: undefined }
        ;

      if (null === $login) {
        done(null, false);
        return;
      }

      tokenMeta = {
        apikeyId: $apikey.id
      , oauthclientUuid: $oauthclient.id
      , loginId: $login.id
      , selectedAccountId: $login.get('primaryAccountId')
      , accounts: $login.related('accounts').map(function (a) { return a; })
      , requestedScopeString: scopeArr.join(' ')
      , acceptedScopeString: scopeArr.join(' ') // TODO test accepted scope against allowed scope
      , test: $apikey.get('test') || $oauthclient.get('test')
      , insecure: $apikey.get('insecure') || $oauthclient.get('insecure')
      , grantType: 'password' // resource owner password
      };

      return Auth.AccessTokens.create(tokenMeta).then(function ($token) {
        done(null, $token.get('token'), refreshToken, params);
      }).catch(function (err) {
        console.error("ERROR Exch Pass, create AccessToken");
        console.error(err);
        done(err);

        throw err;
      });
    }).error(function (err) {
      done(err);
    }).catch(function (err) {
      console.error("ERROR Exchange Password");
      console.error(err);
      done(err);

      throw err;
    });
  }));

  // Exchange the client id and password/secret for an access token.  The callback accepts the
  // `client`, which is exchanging the client's id and password/secret from the
  // authorization request for verification. If these values are validated, the
  // application issues an access token on behalf of the client who authorized the code.
  server.exchange(oauth2orize.exchange.clientCredentials(function ($apikey, scope, done) {
    scope = scope || [];
    console.log('[D] grant_type=client_credentials');

    // TODO check that the requested scope is not above that which has been granted
    // to the application (and or this particular keypair)
    // if (grantOf(client).gte(scope) && grantOf(auth).gte(scope))


    // The client is actually validated in the previous middleware.
    var $oauthclient = $apikey.related('oauthclient')
      , refreshToken // = undefined
      , params = { expiresIn: undefined }
      , tokenMeta
      ;

    tokenMeta = {
      apikeyId: $apikey.id
    , oauthclientUuid: $oauthclient.id
    , loginId: null
    , selectedAccountId: null
    , accounts: [] // TODO null?
    , requestedScopeString: scope.join(' ')
    , acceptedScopeString: scope.join(' ') // TODO test accepted scope against allowed scope
    , test: $apikey.get('test') || $oauthclient.get('test')
    , insecure: $apikey.get('insecure') || $oauthclient.get('insecure')
    , grantType: 'client_credentials'
    };

    return Auth.AccessTokens.create(tokenMeta).then(function ($token) {
      done(null, $token.get('token'), refreshToken, params);
    }).catch(function (err) {
      console.error("ERROR client creds create AccessTokens");
      console.error(err);
      done(err);

      throw err;
    });
  }));

  function route(rest) {
    var decisions
      ;

    // Traditionally all of the oauth cruft has been handled in html alone,
    // but we handle ensuring the login and the transaction via the browser app instead of
    // creating another smaller app just for the sake of oauth
    //
    // In some future version (assuming a future where there are clients that don't run JavasScript)
    // we may provide an alternate url such as /oauth/html/xyz for a more mucky user experience
    //
    //rest.get(
    //  '/oauth/scope/:token?account='
    //, fn
    //)
    rest.get(
      '/oauth/scope/:token'
    , function restfulGetScopeDelta(req, res) {
        if (!req.user) {
          res.error({ message: "yo, you gotta be logged in to access this resource" });
        }

        var txtoken = req.params.token
          , reqUser = req.user
          , selectedAccountId = req.params.accountId || req.query.account
              || (reqUser.$account && reqUser.$account.id)
          , authInfo = TxTok.get(txtoken)
          , $account
          ;

        if (!authInfo) {
          res.error({
            message: "yo, that token you gave me wasn't good for nothin'. I suggest you try again..."
          });
          return;
        }

        reqUser.accounts.forEach(function ($a) {
          if ($a.id === selectedAccountId) {
            $account = $a;
            return true;
          }
        });

        // TODO make this part of the /api/me resource as /api/me/scope/:appid/:txtoken ???
        // and guard all access to /api/me as follows (and attach it to req.me or req.account):
        if (!$account) {
          res.error({
            message: "yo, that account id wasn't good for nothin'. you tryin' to trick me?"
          });
          return;
        }

        /*
        if ($apikey.get('test') && !(user.guest || user.meta.guest || user.test || user.meta.test )) {
          done(new Error("'" + apikey.client.name + "' is a demo app and may only be used by demo user accounts, not real ones.\n\n\n"));
          return;
        }
        */

        // TODO use the in-memory copy?

        // XXX
        // TODO try each account
        // XXX
        return Scopes.lookup($account.id, authInfo.oauthclientUuid)
          .then(function (grantedScopeString) {

            //console.log('authInfo');
            //console.log(authInfo);
            //console.log('grantedScopeString', grantedScopeString || null);

            authInfo.grantedScopeString = grantedScopeString;
            authInfo.exists = 'string' === typeof grantedScopeString;

            return getScopeDelta(grantedScopeString, authInfo.requestedScopeString)
              .then(function (perms) {
                // perms => { 'deltaScopeString', 'invalids' }
                //console.log('grantedScopeString', grantedScopeString || null);
                //console.log('getscopedelta', Object.keys(perms));

                authInfo.deltaScopeString = perms.deltaScopeString;

                authInfo.public = {
                  transactionId: authInfo.transactionId
                , exists: authInfo.exists
                , granted: authInfo.exists && !authInfo.deltaScopeString
                , client: authInfo.client
                , grantedScopeString: grantedScopeString
                , requestedScopeString: authInfo.requestedScopeString
                , deltaScopeString: authInfo.deltaScopeString
                , invalids: perms.invalids
                , test: authInfo.test
                , insecure: authInfo.insecure
                };

                res.send(authInfo.public);
              }).catch(function (err) {
                console.error("ERROR create token REST");
                console.error(err);
                res.error({ message: err && err.message || err || "scope delta failure" });

                throw err;
              });
          });
      }
    );

    //
    //
    // Controller / View Functions
    //
    //
    function checkAppIdAndUrl(apikeyId, redirectURI, originalScopeArr, type, done) {
      originalScopeArr = originalScopeArr || [];
      // Step 1
      console.log('[A-03-C] [authorize.validateUrl]', apikeyId, type);

      Auth.AppLogin.lookup(null, apikeyId).then(function ($apikey) {
        // lookup gives back a valid apikey or errors out

        //console.log(appLogin);
        // XXX temporarily disabled for testing
        /*
        var long
          , short
          ;

        // XXX Upgrade to a more rigorous security check.
        // but also allow for localhost and alternate port testing
        long = redirectURI.replace(/^https?:\/\/([^\/:]+).*$/i, '$1');
        short = (appLogin.get('url')||'').replace(/^https?:\/\/([^\/:]+).*$/i, '$1');

        if (!appLogin.get('guest') && !long.match(new RegExp(escapeRegExp(short) + '$', 'i'))) {
          done(new Error(
            "Security Error: \nRedirect URL '"
          + redirectURI
          + "' does not match app domain '"
          + (appLogin.get('url')||'')
          + "'.\n\n\n"
          ));
          return;
        }
        */

        done(null, $apikey, redirectURI);
      }).catch(function (err) {
        console.error('Auth.AppLogin error');
        console.error(err);

        done(err);
      });
    }

    function checkAuthorizationAndScope($apikey, reqUser, originalScopeArr, done) {
      originalScopeArr = originalScopeArr || [];
      console.log('[A-06-C] [checkAuthorizationAndScope]');

      var $oauthclient = $apikey.related('oauthclient')
        //, $account = reqUser && reqUser.account
        , authInfo
        ;

      // this becomes req.oauth2.info
      // authInfo => req.oauth2.info
      authInfo = {
        apikeyId: $apikey.id
      , oauthclientUuid: $oauthclient.id
      , loginId: undefined
      , requestedScopeString: originalScopeArr.join(' ')
      , debug_infoInCheckAuthScope: true
      , client: {
          // NOTE: always be careful to not reveal private key here
          name: $oauthclient.get('name')
        , title: $oauthclient.get('title')
        , desc: $oauthclient.get('desc') || $oauthclient.get('description')
          // TODO is comment note-to-self that shouldn't be exposed?
        //, comment: $oauthclient.get('comment') || $oauthclient.get('comments')
        , logo: $oauthclient.get('logo')
        , test: $apikey.get('test') || $oauthclient.get('test')
        , insecure: $apikey.get('insecure') || $oauthclient.get('insecure')
        }
      };

      if (!reqUser) {
        // we'll handle user login and scope checking in the browser

        done(null, false, authInfo);
        return;
      }

      // XXX
      // TODO handle the case where the user was already logged in?
      // (currently the browser handles this quite well,
      // but skipping the browser would be a UX / time / performance improvement)
      // XXX
      done(null, false, authInfo);
      return;
    }

    function parseDecision(req, done) {
      //
      // Allow / Deny
      // 
      console.log('[B-18] [decision]');


      var authInfo = req.oauth2.info
        ;

      //
      // IMPORTANT
      //
      // req.body.cancel will fail the process before it reaches this middleware
      // see oauth2orize/lib/middleware/decision.js

      // req.body => { transactionId: ..., cancel: ... }
      authInfo.selectedAccountId = req.body.selectedAccountId || req.body.selected_account_id;
      authInfo.acceptedScopeString = req.body.acceptedScope || req.body.accepted_scope;

      // authInfo => ares
      done(null, authInfo);

      // TODO how to manually hook into the redirect?
      // It probably isn't necessary since I can get the accepted scope here
      // and I could just do the scope parse logic elsewhere as I can with the txtoken getter
    }

    function askUserToAllowScope(req, res /*, next*/) {
      console.log('[A-12] [render dialog]');

      /*
      req.oauth2
      { client: [Object apikey|oauthclient]
        redirectURI: 'http://beta.ysawards.org:3000/api/auth/ldsconnect/callback',
        req: { type: 'code',
               clientID: 'ysawards-6',
               redirectURI: 'http://beta.ysawards.org:3000/api/auth/ldsconnect/callback',
               scope:
                [ 'stake.adults:name,photo,phone,email::texting,emailing',
                  'stake.leadership:name,photo,phone,email::texting,emailing' ],
               state: undefined },
        user: [Object { $logins, $accounts }]
        info: [Object as set previosly in server.authorization middleware]
        transactionID: 'dzxW37I7' }
      */
      // TODO prevent replay attacks by checking state

      var authInfo = req.oauth2.info
        , txtoken = TxTok.create()
        ;

      authInfo.transactionId = req.oauth2.transactionID;

      // made available for client to retrieve via ajax
      TxTok.put(txtoken, authInfo);

      // TODO update browser client to use html5 url state (no /#/anchorthing)
      res.redirect('/#/authorize/' + txtoken);

      // NOTE: This used to be where rendering would occur
      //res.render('dialog', authInfo);
    }

    // user authorization endpoint
    //
    // `authorization` middleware accepts a `validate` callback which is
    // responsible for validating the client making the authorization request.  In
    // doing so, is recommended that the `redirectURI` be checked against a
    // registered value, although security requirements may vary accross
    // implementations.  Once validated, the `done` callback must be invoked with
    // a `client` instance, as well as the `redirectURI` to which the user will be
    // redirected after an authorization decision is obtained.
    //
    // This middleware simply initializes a new authorization transaction.  It is
    // the application's responsibility to authenticate the user and render a dialog
    // to obtain their approval (displaying details about the client requesting
    // authorization).  We accomplish that here by allowing the client to log the
    // user in and use a transaction token to get application and scope info
    rest.get(
      '/oauth/dialog/authorize'
      //login.ensureLoggedIn('/login.html') // this will be handled in the browser
    , server.authorization(checkAppIdAndUrl, checkAuthorizationAndScope)
    , askUserToAllowScope
    );

    // user decision endpoint
    //
    // `decision` middleware processes a user's decision to allow or deny access
    // requested by a client application.  Based on the grant type requested by the
    // client, the above grant middleware configured above will be invoked to send
    // a response.
    decisions = server.decision(parseDecision);
    rest.post(
      '/oauth/dialog/authorize/decision'
    //  login.ensureLoggedIn() // the browser app will handle this
    , decisions[0] // ??? success?
    , decisions[1] // ??? failure?
    );


    // token endpoint
    //
    // `token` middleware handles client requests to exchange authorization grants
    // for access tokens.  Based on the grant type being exchanged, the above
    // exchange middleware will be invoked to handle the request.  Clients must
    // authenticate when making requests to this endpoint.
    rest.post(
      '/oauth/token'
      // authentication is done here (must use connect_router, not urlrouter)
    , passport.authenticate(
        [ 'provider.oauth2-basic.st'
        , 'provider.oauth2-client-password.st'
        , 'provider.oauth2-resource-owner-password.st'
        ]
      , { session: false }
      )
    , server.token()
    , server.errorHandler()
    );
  }

  return route;
};
