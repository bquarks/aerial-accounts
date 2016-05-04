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
  var token = Meteor._localStorage.getItem(this.LOGIN_TOKEN_KEY),
      expiresAt = Meteor._localStorage.getItem(this.LOGIN_TOKEN_EXPIRES_KEY),
      refreshToken = Meteor._localStorage.getItem(this.LOGIN_REFRESH_TOKEN_KEY);

  this.callLoginMethod({
    methodArguments: [{
      token: token,
      expiresAt: expiresAt,
      refreshToken: refreshToken
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
