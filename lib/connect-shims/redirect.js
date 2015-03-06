'use strict';

function redirectResponse(code, href) {
  /*jshint validthis:true*/
  var res = this
    ;

  if (!res) {
    throw new Error('You called `redirect()`, detatched send from the response object');
  }

  if (!href) {
    href = code;
    code = 302;
  }

  res.statusCode = code;
  res.setHeader('Location', href);
  res.end();
}

module.exports =  function (req, res, next) {
  if (!res.redirect) {
    res.redirect = redirectResponse;
  }
  next();
};
