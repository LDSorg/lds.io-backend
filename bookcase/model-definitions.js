'use strict';

var Db = {}
  ;

//
// WARNING: Non-join tables may NOT have _ in the name
// As such, if the model is CamelCase, tableName should be set manually
//

module.exports.Db = Db;
module.exports.models = {
  Accounts:
  { idAttribute: 'uuid'
  , logins: function () {
      return this.belongsToMany(Db.Logins);
      //return this.belongsToMany(Db.Logins, 'accounts_logins', 'account_uuid', 'login_hashid');
    }
  , oauthclients: function () {
      return this.hasMany(Db.OauthClients, 'account_uuid');
    }
  , contact: function () {
      return this.hasOne(Db.Contacts, 'account_uuid');
    }
  , addresses: function () {
      return this.hasMany(Db.Addresses, 'account_uuid');
    }
  , hasTimestamps: ['createdAt', 'updatedAt']
  }
, AccessTokens:
  { tableName: 'accesstokens'
  , idAttribute: 'id'
  , account: function () {
      // by client as and in behalf of user
      return this.belongsTo(Db.Accounts, 'account_uuid');
    }
  , apikey: function () {
      return this.belongsTo(Db.ApiKeys, 'apikey_id');
    }
  , login: function () {
      return this.belongsTo(Db.Logins, 'logins_hashid');
    }
  , oauthclient: function () {
      // as client
      return this.belongsTo(Db.OauthClients, 'oauthclient_uuid');
    }
  }
, AccountsLogins:
  // no idAttribute
  { account: function () {
      return this.belongsTo(Db.Accounts);
      //return this.belongsTo(Db.Accounts, 'account_uuid');
    }
  , login: function () {
      return this.belongsTo(Db.Logins);
      //return this.belongsTo(Db.Logins, 'login_hashid');
    }
  , hasTimestamps: ['createdAt', 'updatedAt']
  }
, Addresses:
  { idAttribute: 'uuid'
  , account: function () {
      return this.belongsTo(Db.Accounts, 'account_uuid');
    }
  , hasTimestamps: ['createdAt', 'updatedAt']
  }
, ApiKeys:
  { tableName: 'apikeys'
  , idAttribute: 'id'
  , oauthclient: function () {
      return this.belongsTo(Db.OauthClients, 'oauthclient_uuid');
    }
  }
, Contacts:
  { contactnodes: function () {
      return this.hasMany(Db.ContactNodes, 'contact_uuid');
    }
  , account: function () {
      return this.belongsTo(Db.Accounts, 'account_uuid');
    }
  , hasTimestamps: ['createdAt', 'updatedAt']
  }
, ContactNodes:
  { tableName: 'contactnodes'
  , contacts: function () {
      return this.belongsTo(Db.Contacts, 'contact_uuid');
    }
  , login: function () {
      return this.hasOne(Db.Logins).through(Db.LoginNodes, 'contactnode_id', 'login_id');
    }
  , loginnode: function () {
      return this.hasOne(Db.LoginNodes, 'contactnode_id');
    }
  , logins: function () {
      return this.belongsToMany(Db.Logins);
    }
  , hasTimestamps: ['createdAt', 'updatedAt']
  }
, LoginNodes:
  { tableName: 'contactnodes_logins'
  , contactnode: function () {
      return this.belongsTo(Db.ContactNodes, 'contactnode_id');
    }
  , login: function () {
      return this.belongsTo(Db.Logins, 'login_id');
    }
  , hasTimestamps: ['createdAt', 'updatedAt']
  }
, Logins:
  { idAttribute: 'hashid'
  , accessTokens: function () {
      return this.hasMany(Db.AccessTokens, 'login_hashid');
    }
  , accounts: function () {
      return this.belongsToMany(Db.Accounts);
      //return this.belongsToMany(Db.Accounts, 'accounts_logins', 'login_hashid', 'account_uuid');
    }
  , contactnodes: function () {
      return this.belongsToMany(Db.ContactNodes, 'contactnodes_logins', 'login_id');
    }
  , loginnodes: function () {
      return this.hasMany(Db.LoginNodes, 'login_id');
    }
    // format before saving
  , hasTimestamps: ['createdAt', 'updatedAt']
  }
, Scopes:
  { idAttribute: 'id'
  , hasTimestamps: ['createdAt', 'updatedAt']
  }
, OauthClients:
  { tableName: 'oauthclients'
  , idAttribute: 'uuid'
  , accounts: function () {
      return this.belongsTo(Db.Accounts, 'account_uuid');
    }
  , apikeys: function () {
      return this.hasMany(Db.ApiKeys, 'oauthclient_uuid');
    }
  , hasTimestamps: ['createdAt', 'updatedAt']
  }
};
