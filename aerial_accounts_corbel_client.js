var onLoginCallback = function (callback, error, result) {
  if (error && typeof callback === 'function') {
    callback(error);
    return;
  }
  else if (error) {
    throw error;
  }

  if (typeof callback === 'function'){
    callback(null, result);
  }
};


Accounts.loginWithTokenCorbel = function (callback) {
  var tokens = Accounts.getStoredTokens();

  console.dir(tokens);

  this.callLoginMethod({
    methodArguments: [{
      token: tokens.token,
      expiresAt: tokens.expiresAt,
      refreshToken: tokens.refreshToken
    }],
    userCallback: function () {
      onLoginCallback.apply(this, [callback].concat(Array.prototype.slice.call(arguments)));
    }
  });

};


Meteor.loginWithCorbel = function (username, password, callback) {
  Accounts.callLoginMethod({
    methodArguments: [{
      username: username,
      password: password
    }],
    userCallback: function () {
      onLoginCallback.apply(this, [callback].concat(Array.prototype.slice.call(arguments)));
    }
  });
};
