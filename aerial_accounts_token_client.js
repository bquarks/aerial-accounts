
Accounts.LOGIN_TOKEN_KEY = 'token';
Accounts.LOGIN_REFRESH_TOKEN_KEY = 'refreshToken';
Accounts.LOGIN_TOKEN_EXPIRES_KEY = 'tokenExpires';
Accounts.AUTO_LOGIN_KEY = 'remember';

Meteor.startup(function () {
  var autologin = Meteor._localStorage.getItem(Accounts.AUTO_LOGIN_KEY) === 'true';

  Accounts._pollStoredLoginTokenCorbel();
});

Accounts.getStorage = function () {
  let remember = Meteor._localStorage.getItem(Accounts.AUTO_LOGIN_KEY);

  return remember === 'true' ? Meteor._localStorage : sessionStorage;
};

Accounts.getAuthData = function () {
  let storage = this.getStorage();

  return {
    token: storage.getItem(Accounts.LOGIN_TOKEN_KEY),
    expiresAt: storage.getItem(Accounts.LOGIN_TOKEN_EXPIRES_KEY),
    refreshToken: storage.getItem(Accounts.LOGIN_REFRESH_TOKEN_KEY),
    userId: storage.getItem(Accounts.USER_ID_KEY)
  };
};



Accounts._storedLoginToken = function () {
  let storage = this.getStorage();

  return storage.getItem(this.LOGIN_TOKEN_KEY);
};

Accounts._unstoreLoginToken = function () {
  let storage = this.getStorage();

  storage.removeItem(this.USER_ID_KEY);
  storage.removeItem(this.LOGIN_TOKEN_KEY);
  storage.removeItem(this.LOGIN_TOKEN_EXPIRES_KEY);
  storage.removeItem(this.LOGIN_REFRESH_TOKEN_KEY);

  // to ensure that the localstorage poller doesn't end up trying to
  // connect a second time
  this._lastLoginTokenWhenPolled = null;
};

Accounts._disableAutoLogin = function () {
  this._autoLoginEnabled = false;
};

Accounts._storeLoginToken = function (userId, token, tokenExpires, refreshToken) {
  let storage = this.getStorage();

  storage.setItem(this.USER_ID_KEY, userId);
  storage.setItem(this.LOGIN_TOKEN_KEY, token);
  storage.setItem(this.LOGIN_REFRESH_TOKEN_KEY, refreshToken);
  storage.setItem(this.LOGIN_TOKEN_EXPIRES_KEY, tokenExpires);

  // to ensure that the localstorage poller doesn't end up trying to
  // connect a second time
  this._lastLoginTokenWhenPolled = token;
};

Accounts._pollStoredLoginTokenCorbel = function () {
  var currentLoginToken = this._storedLoginToken();

  if (!currentLoginToken) {
    return;
  }

  // != instead of !== just to make sure undefined and null are treated the same
  if (this._lastLoginTokenWhenPolled !== currentLoginToken) {

    this.connection.onReconnect = null;

    if (currentLoginToken) {
      var self = this;

      this.loginWithTokenCorbel(function (err) {
        if (err) {
          self.makeClientLoggedOut();
        }
      });
    } else {
      this.logout();
    }
  }

  this._lastLoginTokenWhenPolled = currentLoginToken;
};
