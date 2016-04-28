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
  console.log('Destroying token of ' + userId + ' with connection ' + connectionId);

  var query = {
    $pull: {
      "services.corbel.loginTokens": {
        token: loginToken.token
      }
    }
  };

  if (connectionId) {
    query.$pull["services.corbel.loginTokens"].connection = connectionId;
  }

  console.log('query: ', JSON.stringify(query));

  this.users.update(userId, query);

  this.destroyUser(userId, loginToken);
};

Accounts.destroyUser = function (userId, token) {
  var user = this.users.findOne({ _id: userId });

  if (user && user.services && user.services.corbel && user.services.corbel.loginTokens && user.services.corbel.loginTokens.length === 0) {
    console.log('Removing user with userId: ', userId);
    this.users.remove({_id: userId});
  }
};


//
// Using $addToSet avoids getting an index error if another client
// logging in simultaneously has already inserted the new hashed
// token.
//
// Overwritten to save the token and the refresh token in the minimongo user collection (AERIAL)
Accounts._insertHashedLoginToken = function (userId, corbelToken, query, connection) {
  console.log('Inserting token to the user ' + userId + 'with connection ' + connection.id + ' and with the query ' + query);
  query = query ? _.clone(query) : {};
  query._id = userId;
  this.users.update(query, {
    $addToSet: {
      'services.corbel.loginTokens': {
        'token': corbelToken.token,
        'refreshToken': corbelToken.refreshToken,
        'tokenExpires': corbelToken.tokenExpires,
        'connection': connection.id
      }
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
  var user = Meteor.users.findOne({
    'services.corbel.loginTokens': {
      $elemMatch : {
        connection: connectionId
      }
    }
  });

  var tokenObject;

  if (user) {
    tokenObject = _.where(user.services.corbel.loginTokens, {connection: connectionId})[0];
  }

  return {
    loginToken: tokenObject,
    userId: user ? user._id : undefined
  };

};

Accounts._setLoginToken = function (userId, connection, newToken) {
  var self = this;

  if (!newToken){
    self._removeTokenFromConnection(connection.id);
    // self._setAccountData(connection.id, 'loginToken', newToken);
    return;
  }

  var token = newToken.token,
  refreshToken = newToken.refreshToken;


  if (token) {
    // Set up an observe for this token. If the token goes away, we need
    // to close the connection.  We defer the observe because there's
    // no need for it to be on the critical path for login; we just need
    // to ensure that the connection will get closed at some point if
    // the token gets deleted.
    //
    // Initially, we set the observe for this connection to a number; this
    // signifies to other code (which might run while we yield) that we are in
    // the process of setting up an observe for this connection. Once the
    // observe is ready to go, we replace the number with the real observe
    // handle (unless the placeholder has been deleted or replaced by a
    // different placehold number, signifying that the connection was closed
    // already -- in this case we just clean up the observe that we started).
    // var myObserveNumber = ++self._nextUserObserveNumber;
    // self._userObservesForConnections[connection.id] = myObserveNumber;
    // Meteor.defer(function () {
    //   // If something else happened on this connection in the meantime (it got
    //   // closed, or another call to _setLoginToken happened), just do
    //   // nothing. We don't need to start an observe for an old connection or old
    //   // token.
    //   if (self._userObservesForConnections[connection.id] !== myObserveNumber) {
    //     return;
    //   }
    //
    //   var foundMatchingUser;
    //   // Because we upgrade unhashed login tokens to hashed tokens at
    //   // login time, sessions will only be logged in with a hashed
    //   // token. Thus we only need to observe hashed tokens here.
    //
    //   var observe = self.users.find({
    //     _id: userId,
    //     'services.corbel.loginTokens': {
    //       $elemMatch : {
    //         // token: token,
    //         connection: connection.id
    //       }
    //     }
    //   }, { fields: { _id: 1 } }).observeChanges({
    //     added: function () {
    //       foundMatchingUser = true;
    //     },
    //     removed: function () {
    //       connection.close();
    //       // The onClose callback for the connection takes care of
    //       // cleaning up the observe handle and any other state we have
    //       // lying around.
    //     }
    //   });
    //
    //   // If the user ran another login or logout command we were waiting for the
    //   // defer or added to fire (ie, another call to _setLoginToken occurred),
    //   // then we let the later one win (start an observe, etc) and just stop our
    //   // observe now.
    //   //
    //   // Similarly, if the connection was already closed, then the onClose
    //   // callback would have called _removeTokenFromConnection and there won't
    //   // be an entry in _userObservesForConnections. We can stop the observe.
    //   if (self._userObservesForConnections[connection.id] !== myObserveNumber) {
    //     console.log('stopping observers');
    //     observe.stop();
    //     return;
    //   }
    //
    //   self._userObservesForConnections[connection.id] = observe;
    //
    //   if (! foundMatchingUser) {
    //     console.log('user not found');
    //     // We've set up an observe on the user associated with `newToken`,
    //     // so if the new token is removed from the database, we'll close
    //     // the connection. But the token might have already been deleted
    //     // before we set up the observe, which wouldn't have closed the
    //     // connection because the observe wasn't running yet.
    //     connection.close();
    //   }
    // });
  }
};

// Clean up this connection's association with the token: that is, stop
// the observe that we started when we associated the connection with
// this token.
Accounts._removeTokenFromConnection = function (connectionId) {

  var result = this._getLoginToken(connectionId);

  if (result.userId && result.loginToken) {
    this.destroyToken(result.userId, result.loginToken, connectionId);
  }

};
