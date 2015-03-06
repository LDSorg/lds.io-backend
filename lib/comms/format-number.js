'use strict';

    // http://codepen.io/coolaj86/pen/eDAKh
    // https://gist.github.com/coolaj86/9062510
    // for execution against a single string
var re = /\+?(1)?\s*[\-\.]?\s*\(?\s*([2-9]\d{2})\s*\)?\s*[\-\.]?\s*(\d{3})\s*[\-\.]?\s*(\d{4})(?=\D|$)/g
    // for an exec loop over much text
  //, reg = /(?=^|\D)\+?(1)?\s*[\-\.]?\s*\(?\s*([2-9]\d{2})\s*\)?\s*[\-\.]?\s*(\d{3})\s*[\-\.]?\s*(\d{4})(?=\D|$)/g
  , reg = /(?:^|\D)\+?(1)?\s*[\-\.]?\s*\(?\s*([2-9]\d{2})\s*\)?\s*[\-\.]?\s*(\d{3})\s*[\-\.]?\s*(\d{4})(?:\D|$)/g
  ;

module.exports.re = re;
module.exports.multiRe = reg;
module.exports.formatNumber = function (number, format) {
  if ('string' !== typeof number) {
    if ('number' !== typeof number) {
      return null;
    }
    number = number.toString();
  }

  // recreate the RegExp to avoid oopsies with .exec()
  var reUsNum = new RegExp(re)
    ;

  if (!reUsNum.test(number)) {
    return null;
  }

  format = format || '+1 ($2) $3-$4';


  return number.replace(reUsNum, format);
};
module.exports.reformatNumber = function (num, format) {
  var re = /^1?([2-9]\d{2})(\d{3})(\d{4})$/
    ;

  num = String(num).replace(/\D/g, '');

  return re.test(num) && num.replace(re, format || '$1$2$3');
};
