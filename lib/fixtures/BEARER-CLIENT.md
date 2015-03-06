# TODO apps should definitely be in its own table
# and bearer should prolly be that way too
# Password is 'something awesome'

INSERT INTO logins (hashid, uid, type, xattrs)
  VALUES ('f0bfd96fde1cbabc61694011c58c38c1', 'my-awesome-app', 'app'
  , '{ "privateKey": "an awesome private key" }')
  ;

require('./lib/auth-logic/utils-auth.js').md5sum('app-local:my-awesome-app')
require('./lib/auth-logic/utils-auth.js').createShadow('something awesome')
"salt": "WSJSl/y0acJZ9i/MT0Oy2rduKOsPH2eoZyl09x6axyo=", "shadow": "e8ccfb69c26be1a9e90c83f28b7c8c84", "hashtype": "md5"
