let corbel = require('corbel-js');

Meteor.usersProfile = usersProfile = new Meteor.Collection('usersProfile');

let removeAllFromCollection = function (collection) {
  if (!collection) {
      return;
  }

  let data = collection.find().fetch();

  _.forEach(data, function (item) {
    collection.remove({_id: item._id});
  });

};

removeAllFromCollection(Meteor.usersProfile);
removeAllFromCollection(Meteor.users);

Accounts.resetUserToken = function (userId, newTokenObject) {
  let user = Meteor.users.findOne({ _id: userId }); // get the old user data

  if (user) {

    // We need to update the old user data with the refreshed token object data
    user._id = newTokenObject.accessToken;
    user.token = newTokenObject.accessToken;
    user.refreshToken = newTokenObject.refreshToken;
    user.tokenExpires = newTokenObject.expiresAt;

    // Create a new user data with the refreshed token object and with the old user data information (profile..)
    Meteor.users.upsert({
      _id: user._id
    },
    user);

    // Remove the old user data
    Meteor.users.remove({
      _id: userId
    });
  }


};

Accounts.refreshUserToken = function (userId, newTokenObject) {
	Meteor.users.upsert(
  {
    _id: userId
  },
  {
    token: newTokenObject.accessToken,
    refreshToken: newTokenObject.refreshToken,
    tokenExpires: newTokenObject.expiresAt
  });
};

Accounts.getCorbelDriver = function (userId) {
  let user = Meteor.users.findOne({
              _id: userId
            }),
      corbelDriver;

  if (user) {
    corbelDriver = corbel.getDriver(_.extend({}, CORBEL_RESOURCE_CONFIG, {
      iamToken: {
        accessToken: user.token,
        refreshToken: user.refreshToken,
        expiresAt: user.tokenExpires
      }
    }));
  }

  return corbelDriver;
};

Accounts.replaceLoginHandler = function (oldHandlerName, newHandlerName, func) {
  for (var i = 0; i < this._loginHandlers.length ; i++) {
    if (oldHandlerName === this._loginHandlers[i].name) {
      this._loginHandlers[i] = {
        name: newHandlerName,
        handler: func
      };
    }
  }
};

let throwCorbelError = function (error) {

  let errorMessage = error.data ? error.data.errorDescription : 'No error description provided.';

  switch (error.status) {
    case 401:
      throw new Meteor.Error(401, 'Corbel authentication error - ' + errorMessage);
    case 403:
      throw new Meteor.Error(403, 'Corbel authentication error - ' + errorMessage);
    case 404:
      throw new Meteor.Error(404, 'Corbel authentication error - ' + errorMessage);
    default:
      throw new Meteor.Error(error.status, 'Corbel authentication error - ' + errorMessage);
  }

};

let corbelLogin = function (corbelDriver, username, password, callback) {
  let claims = {
    'scope': CORBEL_SCOPES_CONFIG,
    'basic_auth.username': username,
    'basic_auth.password': password
  };

  corbelDriver.iam.token().create({
    claims: claims
  })
  .then(function (response) {
    callback(null, response.data);
  })
  .catch(function (err) {
    callback(err);
  });
};

var getCorbelAuth = function (corbelDriver, tokenRefreshed, _userId) {

  let userProfile;

  try {
    userProfile = corbelUser(corbelDriver);
  }
  catch(e) {
    throwCorbelError(e);
  }

  if (!userProfile) {
    return;
  }
  let tokenObject = corbelDriver.config.get(corbel.Iam.IAM_TOKEN, {}),
      token = tokenObject.accessToken;

  // TODO: Check if this is necessary when tokenRefreshed
  usersProfile.upsert({
    _id: userProfile.username
  },
  userProfile);

  Meteor.users.upsert({
    _id: token
  },
  {
    $set: {
      'profile.username': userProfile.username
    }
  });

  if (tokenRefreshed) { // If the token has been refreshed, we need to remove the user with the old token userId
    Meteor.users.remove({ _id: _userId });
  }

  return {
    userId: token,
    stampedLoginToken: {
      token: tokenObject.accessToken,
      tokenExpires: tokenObject.expiresAt,
      refreshToken: tokenObject.refreshToken
    }
  };

};

let corbelUser = function (corbelDriver, callback) {
  corbelDriver.iam.user('me').get()
  .then(function (response) {
    callback(null, response.data);
  })
  .catch(function (error) {
    callback(error);
  });
};

let getCorbelDriver = function (options={}, config=CORBEL_CONFIG) {
  options = _.extend({}, config, options);

  let corbelDriver = corbel.getDriver(options);

  return corbelDriver;
};

Accounts.registerLoginHandler('corbel', function (options) {

  if (!options.username || !options.password) {
    return undefined; // don't handle
  }

  let corbelDriver = getCorbelDriver();

  let userProfile;

  try {
    corbelLogin(corbelDriver, options.username, options.password);
    userProfile = getCorbelAuth(corbelDriver);
  }
  catch (error) {
    throwCorbelError(error);
  }

  return userProfile;

});

Accounts.replaceLoginHandler('resume', 'resumeCorbel', function (options) {
  if (!options.token && !options.refreshToken && !options.expiresAt && !options._userId ) {
    return undefined; // don't handle
  }

	let token = options.token,
			refreshToken = options.refreshToken,
			expiresAt = options.expiresAt,
      tokenRefreshed = false;

	var user = Meteor.users.findOne({ _id: options._userId }); // Find the user to check if the token provided by the method is still 'valid'

	if (user && user.token !== options.token) { // The token has been refreshed
		token = user.token;
		refreshToken = user.refreshToken;
		expiresAt = user.tokenExpires;
    tokenRefreshed = true;
	}

  let corbelDriver = getCorbelDriver({
    iamToken: {
      accessToken: token,
      refreshToken: refreshToken
    }
  }, CORBEL_ME_CONFIG);

  let userProfile;

  let onRefresh = function (data) {
    Accounts.resetUserToken(options._userId, data);
  };

  corbelDriver.on('token:refresh', onRefresh);

  try {
    userProfile = getCorbelAuth(corbelDriver, tokenRefreshed, tokenRefreshed ? options._userId : '');
  }
  catch (error) {
    throwCorbelError(error);
  }

  corbelDriver.off('token:refresh', onRefresh);

  return userProfile;
});


corbelLogin = Meteor.wrapAsync(corbelLogin);
corbelUser = Meteor.wrapAsync(corbelUser);
