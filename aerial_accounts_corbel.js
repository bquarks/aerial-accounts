let corbel = require('corbel-js');

UsersProfile = new Meteor.Collection('usersProfile');

Accounts.getCorbelDriver = function (userId) {
  let user = Meteor.users.findOne({
              _id: userId
            }),
      corbelDriver;

  if (user) {
    let corbelDriver = corbel.getDriver(_.extend(CORBEL_ME_CONFIG, {
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
    // console.dir(response);
    callback(null, response.data);
  })
  .catch(function (err) {
    callback(err);
  });
};

var getCorbelAuth = function (corbelDriver) {

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

  UsersProfile.upsert({
    _id: userProfile.username
  },
  userProfile);

  //
  Meteor.users.upsert({
    _id: token
  },
  {
    username: userProfile.username
  });

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

let getCorbelDriver = function (options) {
  options = options || {};

  options = _.extend(CORBEL_CONFIG, options);

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

  if (!options.token && !options.refreshToken && !options.expiresAt ) {
    return undefined; // don't handle
  }

  let corbelDriver = corbel.getDriver(_.extend(CORBEL_ME_CONFIG, {
    iamToken: {
      accessToken: options.token,
      refreshToken: options.refreshToken,
      expiresAt: options.expiresAt
    }
  }));

  let userProfile;

  try {
    userProfile = getCorbelAuth(corbelDriver);
  }
  catch (error) {
    throwCorbelError(error);
  }

  return userProfile;

});


corbelLogin = Meteor.wrapAsync(corbelLogin);
corbelUser = Meteor.wrapAsync(corbelUser);
