'use strict';

var escapeRegExp = require('escape-string-regexp')
  , origin = 'foobar3000.com'
  , good
  , bad
  ;
  
good = [
  'spdy://foobar3000.com'
, 'http://foobar3000.com'
, 'https://foobar3000.com'
, 'https://foobar3000.com?foo=bar'
, 'https://foobar3000.com/'
, 'https://foobar3000.com/something'
, 'https://foobar3000.com/something/'
, 'https://foobar3000.com/something/or'
, 'https://whatever.foobar3000.com'
, 'https://whatever.foobar3000.com/something/or/other'
, 'https://foobar3000.com:8080'
, 'https://foobar3000.com:8080/'
, 'https://foobar3000.com:8080?'
];

bad = [
  'foobar3000.com'
, 'httpd://foobar3000.com'
, 'https://whateverfoobar3000.com'
, 'httpd://example.com/foobar3000.com'
, 'https://oobar3000.com'
, 'https://foobar3000.co'
, 'https://foobar3000xcom.net'
, 'https://foobar3000com'
];

function testOrigin(attacker) {
  var re = new RegExp("^(https?|spdy):\\/\\/([^\\/]+\\.)?" + escapeRegExp(origin) + "(:\\d+)?($|\\/|\\?)")
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
