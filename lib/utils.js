'use strict';

function errorinate(code, msg, klass) {
  return { error: {
    code: code
  , message: msg
  , class: klass
  }};
}

function massage(type, data) {
  return { type: type, response: data };
}

function wsMassage(type, data) {
  return { type: type, message: data };
}

module.exports = {
  errorinate: errorinate
, massage: massage
, wsMassage: wsMassage
};
