let corbel = require('corbel-js');

// Override this method to provide the refresh token argument to the localStorage
Accounts.makeClientLoggedIn = function (userId, token, tokenExpires, refreshToken) {
  this._storeLoginToken(userId, token, tokenExpires, refreshToken);
  this.connection.setUserId(userId);
};

Accounts.makeClientLoggedOut = function (corbel) {
  if (corbel) {
    this._unstoreLoginToken();
    this.connection.setUserId(null);
    this.connection.onReconnect = null;
  }
};


Accounts.logout = function (callback) {
  var self = this;
  self.connection.apply('logout', [], {
    wait: true
  }, function (error, result) {
    if (error) {
      callback && callback(error);
    } else {
      self.makeClientLoggedOut(true);
      callback && callback();
    }
  });
};

// Call a login method on the server.
//
// A login method is a method which on success calls `this.setUserId(id)` and
// `Accounts._setLoginToken` on the server and returns an object with fields
// 'id' (containing the user id), 'token' (containing a resume token), and
// optionally `tokenExpires`.
//
// This function takes care of:
//   - Updating the Meteor.loggingIn() reactive data source
//   - Calling the method in 'wait' mode
//   - On success, saving the resume token to localStorage
//   - On success, calling Accounts.connection.setUserId()
//   - Setting up an onReconnect handler which logs in with
//     the resume token
//
// Options:
// - methodName: The method to call (default 'login')
// - methodArguments: The arguments for the method
// - validateResult: If provided, will be called with the result of the
//                 method. If it throws, the client will not be logged in (and
//                 its error will be passed to the callback).
// - userCallback: Will be called with no arguments once the user is fully
//                 logged in, or with the error on error.

// Override this method to provide the token, refreshToken and expiresAt fields retrieved by the server.
Accounts.callLoginMethod = function (options) {
  var self = this;

  options = _.extend({
    methodName: 'login',
    methodArguments: [],
    _suppressLoggingIn: false
  }, options);

  options.methodArguments[0].userId = Meteor.userId();

  // Set defaults for callback arguments to no-op functions; make sure we
  // override falsey values too.
  _.each(['validateResult', 'userCallback'], function (f) {
    if (!options[f])
      options[f] = function () {};
  });

  // Prepare callbacks: user provided and onLogin/onLoginFailure hooks.
  var loginCallbacks = _.once(function (error) {
    if (!error) {
      self._onLoginHook.each(function (callback) {
        callback();
        return true;
      });
    } else {
      self._onLoginFailureHook.each(function (callback) {
        callback();
        return true;
      });
    }
    options.userCallback.apply(this, arguments);
  });

  var reconnected = false;

  // We want to set up onReconnect as soon as we get a result token back from
  // the server, without having to wait for subscriptions to rerun. This is
  // because if we disconnect and reconnect between getting the result and
  // getting the results of subscription rerun, we WILL NOT re-send this
  // method (because we never re-send methods whose results we've received)
  // but we WILL call loggedInAndDataReadyCallback at "reconnect quiesce"
  // time. This will lead to makeClientLoggedIn(result.id) even though we
  // haven't actually sent a login method!
  //
  // But by making sure that we send this "resume" login in that case (and
  // calling makeClientLoggedOut if it fails), we'll end up with an accurate
  // client-side userId. (It's important that livedata_connection guarantees
  // that the "reconnect quiesce"-time call to loggedInAndDataReadyCallback
  // will occur before the callback from the resume login call.)
  var onResultReceived = function (err, result) {
    if (err || !result || !result.token) {
      // Leave onReconnect alone if there was an error, so that if the user was
      // already logged in they will still get logged in on reconnect.
      // See issue #4970.
    } else {
      self.connection.onReconnect = function () {
        reconnected = true;
        // If our token was updated in storage, use the latest one.
        var storedToken = self._storedLoginToken();
        if (storedToken) {
          result = {
            token: storedToken,
            tokenExpires: self._storedLoginTokenExpires()
          };
        }
        if (! result.tokenExpires)
          result.tokenExpires = self._tokenExpiration(new Date());
        if (self._tokenExpiresSoon(result.tokenExpires)) {
          self.makeClientLoggedOut(true);
        } else {
          self.callLoginMethod({
            methodArguments: options.methodArguments,
            // Reconnect quiescence ensures that the user doesn't see an
            // intermediate state before the login method finishes. So we don't
            // need to show a logging-in animation.
            _suppressLoggingIn: true,
            userCallback: function (error) {
              var storedTokenNow = self._storedLoginToken();
              if (error) {
                // If we had a login error AND the current stored token is the
                // one that we tried to log in with, then declare ourselves
                // logged out. If there's a token in storage but it's not the
                // token that we tried to log in with, we don't know anything
                // about whether that token is valid or not, so do nothing. The
                // periodic localStorage poll will decide if we are logged in or
                // out with this token, if it hasn't already. Of course, even
                // with this check, another tab could insert a new valid token
                // immediately before we clear localStorage here, which would
                // lead to both tabs being logged out, but by checking the token
                // in storage right now we hope to make that unlikely to happen.
                //
                // If there is no token in storage right now, we don't have to
                // do anything; whatever code removed the token from storage was
                // responsible for calling `makeClientLoggedOut()`, or the
                // periodic localStorage poll will call `makeClientLoggedOut`
                // eventually if another tab wiped the token from storage.
                if (storedTokenNow && storedTokenNow === result.token) {
                  self.makeClientLoggedOut(true);
                }
              }
              // Possibly a weird callback to call, but better than nothing if
              // there is a reconnect between "login result received" and "data
              // ready".
              loginCallbacks(error);
            }});
        }
      };
    }
  };

  // This callback is called once the local cache of the current-user
  // subscription (and all subscriptions, in fact) are guaranteed to be up to
  // date.
  var loggedInAndDataReadyCallback = function (error, result) {
    // If the login method returns its result but the connection is lost
    // before the data is in the local cache, it'll set an onReconnect (see
    // above). The onReconnect will try to log in using the token, and *it*
    // will call userCallback via its own version of this
    // loggedInAndDataReadyCallback. So we don't have to do anything here.
    if (reconnected)
      return;

    // Note that we need to call this even if _suppressLoggingIn is true,
    // because it could be matching a _setLoggingIn(true) from a
    // half-completed pre-reconnect login method.
    self._setLoggingIn(false);
    if (error || !result) {
      error = error || new Error(
        "No result from call to " + options.methodName);
      loginCallbacks(error);
      return;
    }
    try {
      options.validateResult(result);
    } catch (e) {
      loginCallbacks(e);
      return;
    }

    // Make the client logged in. (The user data should already be loaded!)
    self.makeClientLoggedIn(result.id, result.token, result.tokenExpires, result.refreshToken);
    loginCallbacks();
  };

  if (!options._suppressLoggingIn)
    self._setLoggingIn(true);
  self.connection.apply(
    options.methodName,
    options.methodArguments,
    {wait: true, onResultReceived: onResultReceived},
    loggedInAndDataReadyCallback);
};
