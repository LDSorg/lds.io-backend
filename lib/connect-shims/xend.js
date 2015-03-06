'use strict';

function xendResponse(data) {
  /*jshint validthis:true*/
  var res = this
    ;

  if (!res) {
    throw new Error('You called `xend()`, detached xend from the response object');
  }

  res.setHeader('Content-Type', 'application/xml');
  if (data) {
    // TODO inspect for <?xml blah blah>?
  } else {
    data = undefined;
  }

  res.end(data);
}

module.exports = function (req, res, next) {
  if (!res.xend) {
    res.xend = xendResponse;
  }
  next();
};
