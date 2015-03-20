'use strict';

var fs = require('fs');
var path = require('path');
var fqdn = 'passthru.example.com';
var port = 4443;

module.exports = {
  proxyUrl: 'https://' + fqdn + ':' + port
, hostname: fqdn
, port: port
, cas: [ fs.readFileSync(path.join(__dirname, 'certs', 'ca', 'my-root-ca.crt.pem')) ]
, key: fs.readFileSync(path.join(__dirname, 'certs', 'client', 'my-app-client.key.pem'))
, cert: fs.readFileSync(path.join(__dirname, 'certs', 'client', 'my-app-client.crt.pem'))
};
