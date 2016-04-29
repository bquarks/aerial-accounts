
Accounts.LOGIN_TOKEN_KEY = 'token';
Accounts.LOGIN_REFRESH_TOKEN_KEY = 'refreshToken';
Accounts.LOGIN_TOKEN_EXPIRES_KEY = 'tokenExpires';
Accounts.AUTO_LOGIN_KEY = 'remember';

Meteor.startup(function () {
  var autologin = Meteor._localStorage.getItem(Accounts.AUTO_LOGIN_KEY) === 'true';

  if (!autologin && Accounts._autoLoginEnabled) {
    Accounts._disableAutoLogin();
    Accounts._unstoreLoginToken();
  }
  else {
    Accounts._autoLoginEnabled = true;
    Accounts._pollStoredLoginTokenCorbel();
  }
});

Accounts._unstoreLoginToken = function () {
  Meteor._localStorage.removeItem(this.USER_ID_KEY);
  Meteor._localStorage.removeItem(this.LOGIN_TOKEN_KEY);
  Meteor._localStorage.removeItem(this.LOGIN_TOKEN_EXPIRES_KEY);
  Meteor._localStorage.removeItem(this.LOGIN_REFRESH_TOKEN_KEY);

  // to ensure that the localstorage poller doesn't end up trying to
  // connect a second time
  this._lastLoginTokenWhenPolled = null;
};

Accounts._disableAutoLogin = function () {
  this._autoLoginEnabled = false;
};

Accounts._storeLoginToken = function (userId, token, tokenExpires, refreshToken) {
  Meteor._localStorage.setItem(this.USER_ID_KEY, userId);
  Meteor._localStorage.setItem(this.LOGIN_TOKEN_KEY, token);
  Meteor._localStorage.setItem(this.LOGIN_REFRESH_TOKEN_KEY, refreshToken);
  Meteor._localStorage.setItem(this.LOGIN_TOKEN_EXPIRES_KEY, tokenExpires);

  // to ensure that the localstorage poller doesn't end up trying to
  // connect a second time
  this._lastLoginTokenWhenPolled = token;
};

Accounts._pollStoredLoginTokenCorbel = function () {
  var self = this;

  if (! self._autoLoginEnabled) {
    return;
  }

  var currentLoginToken = self._storedLoginToken();

  // != instead of !== just to make sure undefined and null are treated the same
  if (self._lastLoginTokenWhenPolled != currentLoginToken) {

    this.connection.onReconnect = null;

    if (currentLoginToken) {
      self.loginWithTokenCorbel(function (err) {
        if (err) {
          self.makeClientLoggedOut();
        }
      });
    } else {
      self.logout();
    }
  }

  self._lastLoginTokenWhenPolled = currentLoginToken;
};
