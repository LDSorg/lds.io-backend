'use strict';

var good
  , bad
  ;
  
good = [
  '/logins'
, '/logins?uid=user'
, '/logins/basic'
, '/session'
, '/session?login=xyz'
, '/session/basic'
  // TODO can accounts be created without login?
, '/accounts'
, '/accounts?uid=user'
, '/accounts/basic'
];

bad = [
  'logins'
, 'logins/'
, '/xlogins'
, '/loginsx'
, '/loginsx/'
, 'loginsx/'
];

function testOrigin(attacker) {
  var re = /^\/(session|accounts|logins)($|\?|\/)/
    ;

  return re.test(attacker);
}

good.forEach(function (g) {
  if (!testOrigin(g)) {
    throw new Error("A good guy didn't pass validation: " + g);
  }
});

bad.forEach(function (b) {
  if (testOrigin(b)) {
    throw new Error("A bad guy got through the system! " + b);
  }
});

console.log("PASS");
