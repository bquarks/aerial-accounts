let _loginUser = Accounts._loginUser;


Accounts._loginUser = function (methodInvocation, userId, stampedLoginToken) {
  if (stampedLoginToken && stampedLoginToken.refreshToken){
    return Accounts._loginCorbelUser.apply(this, Array.prototype.slice.call(arguments));
  }
  else {
    return _loginUser.apply(this, Array.prototype.slice.call(arguments));
  }
};

Accounts._loginCorbelUser = function (methodInvocation, userId, corbelToken) {
  let self = this,
      token = corbelToken.token,
      refreshToken = corbelToken.refreshToken,
      tokenExpires = corbelToken.tokenExpires;

  self._insertLoginToken(userId, corbelToken, undefined, methodInvocation.connection);

  // This order (and the avoidance of yields) is important to make
  // sure that when publish functions are rerun, they see a
  // consistent view of the world: the userId is set and matches
  // the login token on the connection (not that there is
  // currently a public API for reading the login token on a
  // connection).
  Meteor._noYieldsAllowed(function () {
    self._setLoginToken(
      userId,
      methodInvocation.connection,
      corbelToken
    );
  });

  methodInvocation.setUserId(userId);

  return {
    id: userId,
    token: token,
    refreshToken: refreshToken,
    tokenExpires: tokenExpires
  };

};


// Deletes the given loginToken from the database.
//
// For new-style hashed token, this will cause all connections
// associated with the token to be closed.
//
// Any connections associated with old-style unhashed tokens will be
// in the process of becoming associated with hashed tokens and then
// they'll get closed.
Accounts.destroyToken = function (userId, loginToken, connectionId) {
  // TODO: UPDATE DATA
  var query = {
    _id: userId
  };

  var userObject = this.users.findOne(query),
      userName;

  if (userObject) {
    userName = userObject.userName;
  }

  this.users.remove({ _id: userId });

  this.destroyUserProfile(userName);
};

Accounts.destroyUserProfile = function (userName) {
  var user = this.users.findOne({ userName: userName });

  if (!user) {
    usersProfile.remove({userName: userName});
  }
};


//
// Using $addToSet avoids getting an index error if another client
// logging in simultaneously has already inserted the new hashed
// token.
//
// Overwritten to save the token and the refresh token in the minimongo user collection (AERIAL)
Accounts._insertHashedLoginToken = function (userId, corbelToken, query, connection) {
  query = query ? _.clone(query) : {};
  query._id = userId;
  this.users.upsert({
    _id: userId
  },
  {
    $set: {
      token: corbelToken.token,
      refreshToken: corbelToken.refreshToken,
      tokenExpires: corbelToken.tokenExpires,
      connection: connection.id
    }
  });
};

//
//
// // Exported for tests.
Accounts._insertLoginToken = function (userId, corbelToken, query, connection) {
  this._insertHashedLoginToken(
    userId,
    corbelToken,
    query,
    connection
  );
};

Accounts._getLoginToken = function (connectionId) {
  var tokenObject = Meteor.users.findOne({
    connection: connectionId
  });

  if (!tokenObject) {
    return;
  }

  return {
    loginToken: tokenObject,
    userId: tokenObject.token
  };

};

Accounts._setLoginToken = function (userId, connection, newToken) {
  var self = this;

  if (!newToken){
    self._removeTokenFromConnection(connection.id);
    return;
  }

};

// Clean up this connection's association with the token: that is, stop
// the observe that we started when we associated the connection with
// this token.
Accounts._removeTokenFromConnection = function (connectionId) {

  var result = this._getLoginToken(connectionId);

  if (result && result.userId && result.loginToken) {
    this.destroyToken(result.userId, result.loginToken, connectionId);
  }

};
