'use strict';

var formatNumber = require('../comms/format-number').formatNumber
  ;

module.exports.create = function (opts/*app, config, opts*/) {
/*
  var number = formatNumber(opts.cellphone, '$2$3$4')
      .replace(/\d{1}\d{2}\d{1}\d{2}\d{2}\d{2}/, '$1 $2, $3 $4, $5 $6')
    ;
*/

  return {
    autoreply: function route(req, res) {
      var response = ""
        ;

      response +=
          '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<Response>'
        + '<Say>This is an automated text messaging system.</Say>'
        + '<Say>Please dial '  + opts.speakablePhone + ' for ' + opts.speakableBusiness + '.</Say>'
        + '<Pause length="2"/>'
        + '<Say>Please dial '  + opts.speakablePhone + ' for ' + opts.speakableBusiness + '.</Say>'
        + '<Pause length="2"/>'
        + '<Hangup/>'
        + '</Response>'
        ;

      res.xend(response);
    }
  };
};
