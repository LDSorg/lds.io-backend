CREATE TABLE IF NOT EXISTS users (
  id
, salt
, secret
, app_id
);
CREATE UNIQUE INDEX id_index ON users ( id );
INSERT INTO users (id, secret, salt, app_id) VALUES (
  'coolaj86@gmail.com'
, 'barfsplatingerstinevolfenyasterdrackenerickder'
, 'c69ddffac2723cc87e4cf08d3e83cc59'
, 'fe12e600-d59d-11e3-9c1a-0800200c9a66'
);
INSERT INTO users (id, secret, salt, app_id) VALUES (
  'hwright723@gmail.com'
, 'enyasterdrackenerickderbarfsplatingerstinevolf'
, 'c69ddffac2723cc87e4cf08d3e83cc59'
, 'fe12e600-d59d-11e3-9c1a-0800200c9a66'
);
