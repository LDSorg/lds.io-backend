// All of these keys are valid working keys registered to
// "Hogwarts Test Application" at http://local.ldsconnect.org,
// which points to 127.0.0.1 for your testing pleasure.
//
// YOU MUST point your browser to local.ldsconnect.org:9003 or YOU WILL HATE YOUR LIFE
// and spend hours debugging a problem that doesn't exist
// (I've cumulatively wasted nearly a full day of my life on such imagined problems)
//
// TODO need a req.href() or something
/*
    var host = (req.headers.host||'').replace(/^www\./, '')
      , hostname = host.split(':')[0]
      , protocol = 'http' + (req.connection.encrypted ? 's' : '') + '://'
      , href = protocol + host + req.url
*/

'use strict';
var CONFIG = {
  protocol: 'http'
, hostname: 'local.ldsconnect.org'
, port: 4004
, wsport: 4204
  // the default secret is 'super secret',
, rootUser: {
    // essential attributes for local account
    uid: 'root'
  , salt: "UdVsog0lLYCV1x2mMAGZa6x+7W41xqtTyR4PLZpE8Pc="
  , shadow: "7e0e7d6fbb948279f204a8a85f1bee10"
  , hashtype: "md5"
    // extra attributes for login
  , login: { public: {} }
    // extra attributes for account
  , account: { role: 'root', email: 'root@local.ldsconnect.org' }
  }
, webhooks: {
    voice: {
      // You'll have to experiment to get these to sound right
      // TODO allow mp3 location for message
      speakablePhone: '5 55, 2 34, 01 23' // 555-234-0123
    , speakableBusiness: 'Ackmee Corp' // ACME Corp
    }
  , text: {
      smsdomain: 'sms.local.ldsconnect.org' // i.e. 555-234-0123@sms.local.ldsconnect.org
    }
  , voicemail: {
      forwardViaSms: false
    , forwardViaEmail: true
    , createTranscript: false
    }
  }
, webhookPrefix: '/webhooks'
, oauthPrefix: '/oauth'
, sessionPrefix: '/session'
, apiPrefix: '/api'
, snakeApi: true // whether or not to snake_case the api over the wire (ruby style)
, superUserApi: '/api/superuser'
, adminApi: '/api/admin'
, userApi: '/api/user'
, publicApi: '/api/public'
, sessionSecret: 'a super secret, nothing better'
, alarms: {
    url: 'http://alarms.beta.coolaj86.com'
  }
, mailer: {
    service: 'mailgun'
  , defaults: {
      from: 'Mailgun Sandbox <postmaster@sandboxb68180cca73d4af5a748a7cf493d3f01.mailgun.org>'
    , replyTo: 'Mailgun Sandbox <postmaster@sandboxb68180cca73d4af5a748a7cf493d3f01.mailgun.org>'
    , system: 'Woof <woof@local.ldsconnect.org>'
    , forwardEmailTo: 'John Doe <john.doe+local.ldsconnect.org@gmail.com>'
    , forwardTo: 'John Doe <john.doe@local.ldsconnect.org>'
    }
    // http://unicode-table.com/
    // http://unicodefor.us/characters/
    // http://en.wiktionary.org/wiki/User:Petruk/dingbat
    // http://danshort.com/HTMLentities/index.php?w=dingb
    // http://www.utf8-chartable.de/unicode-utf8-table.pl?start=9728
    // Church, House, House Building, Office ⌂ 🏠 ⛪ 🏢 
    // Full color graphics: 🏠 ⛪ 🏢 ✏ ☎ ☁ ✉ ✈
  , subjectPrefixes: {
      all: "✆ ℡ ☎ ☏ ✆ ✍ ☺ ☁ ⚑ ⚐ ⚙ ⚛ ✉ ✎ ✏ ✐ ✇ ☢ ★ ☣ ☠ ⍟ ✪ ✩ ⌂"
    , sms:"☁ SMS "
    , email: "✉ "
    , voice: "✆ Call "
    , voicemail: "✆ Voicemail "
    , system: "⚑ "
    , error: "☠ "
    }
  , apiKey: 'key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  , apiPublicKey: 'pubkey-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  , emaildomain: 'local.ldsconnect.org'
  , opts: {
      auth: {
        user: 'postmaster@sandboxb68180cca73d4af5a748a7cf493d3f01.mailgun.org'
      , pass: '7l3mogwdoem7'
      }
    }
  }
, twilio: {
    id: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  , auth: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  , number: '(555) 678-1234'
  , forwardIncomingCallsTo: '(555) 222-0123'
  , voicemailWav: '/media/voicemail.wav' // from web root
  }
, google: {
    gcm: {
      projectId: 'industrial-net-625'
    , projectNumber: '876156422908'
    //, authorizedIps: ['0.0.0.0/0']
    , publicApiServerKey: 'AIzaSyAwimo0tHDwkqdjtCtovBHS8jJHY0ZPT-8'
    //, authorizedJavaScriptOrigins: ['http://local.ldsconnect.org']
        // defaults to /oauth2callback
    //, authorizedRedirectUri: 'http://local.ldsconnect.org/oauth/google/callback'
    }
  , oauth: {
      id: '876156422908-ia6r6rs3hrttp70hl7gp1k4kuln0i8b4.apps.googleusercontent.com'
    , email: '876156422908-ia6r6rs3hrttp70hl7gp1k4kuln0i8b4@developer.gserviceaccount.com'
    , secret: 'e5FoXbYdTx51rHVdm1gJOg38'
    }
  }
, facebook: {
    // https://developers.facebook.com/apps
    // Client Token 5308ba111a46159e92d74fce76dbe807
    // Test User Email: hogwarts_ogszoxx_user@tfbnw.net
    // Test User Password: secret
    // Test User ID: 100007933814002
    id: '259725070873272'
  , secret: 'd8469a2af25d6b806014be4be272b909'
  }
, twitter: {
    // https://dev.twitter.com/apps
    // default callback /authn/twitter/callback
    consumerKey: 'eLWtqMMGZr1CQC6Wk3tO7g'
  , consumerSecret: 'auhIHIbopDBmXuQizGEINLlGePdqDEd5QgDzvG4CCik'
  }
, ldsconnect: {
    // http://ldsconnect.org
    // Test User Name: dumbledore
    // Test User Password: secret
    id: '55c7-test-bd03'
  , secret: '6b2fc4f5-test-8126-64e0-b9aa0ce9a50d'
  }
, stripe: {
    // https://manage.stripe.com/account/apikeys
    id: "pk_test_hwX1wzG4OMEv9esujApHjxI7"
  , secret: "sk_test_o1DfpT64SMt54nC8NIhQDk72"
  }
, tumblr: {
    // https://www.tumblr.com/settings/apps
    // http://www.tumblr.com/oauth/apps
    // default callback /auth/tumblr/callback
    consumerKey: 'b0ix4BsnbExgzi8zf0mmowj8k9g36YqwP5uBUOLoyxYoqBTlD8'
  , consumerSecret: 'FhnXG8TPhQ3xl4xTtfDaCsgAOHHsg7QHUQzmqPmeMcrSjS4CQU'
  }
, loopback: {
    // this is to test the applications oauth with itself (trixy, eh?)
    // look in ./fixtures to see the default password and such
    // TODO set url/port at runtime
    id: "my-awesome-app"
  , secret: "an awesome private key"
  }
};
module.exports = CONFIG;
