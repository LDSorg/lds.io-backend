var lds = require('./basic');
var details = require('./test-details.json');
var directory = require('./test-directory.json');

// lds.getDetails(details);
var profile = lds.getDirectory(details, directory);
console.log(Object.keys(profile));
console.log(profile.me);
console.log(JSON.stringify(profile.callings, null, '  '));
