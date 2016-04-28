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
    userCallback: callback
  });

};


Meteor.loginWithCorbel = function (username, password) {
  Accounts.callLoginMethod({
    methodArguments: [{
      username: username,
      password: password
    }],
    userCallback: function (error, result) {

    }
  });
};
