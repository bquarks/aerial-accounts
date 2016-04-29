let corbel = require('corbel-js');

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

var corbelLogin = function (corbelDriver, username, password, callback) {
  var claims = {
  'scope': 'booqs:web booqs:user',
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

var corbelUser = function (corbelDriver, callback) {
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

  let corbelDriver = corbel.getDriver(_.extend(CORBEL_CONFIG, options));

  return corbelDriver;
};

Accounts.registerLoginHandler('corbel', function (options) {

  if (!options.username || !options.password) {
    return undefined; // don't handle
  }

  let corbelDriver = getCorbelDriver();

  let result = corbelLogin(corbelDriver, options.username, options.password);

  let userProfile = corbelUser(corbelDriver);

  if (!userProfile) {
    return;
  }

  let loggedUser = Meteor.users.findOne({username: userProfile.username});

  let userId = (!loggedUser || !loggedUser._id) ? Accounts.insertUserDoc({}, {username: userProfile.username}) : loggedUser._id;

  Meteor.users.update({
    _id: userId
  },
  { $set: userProfile },
  {
    field: {
      services: 0
    }
  }
);

  return {
    userId: userId,
    stampedLoginToken: {
      token: result.accessToken,
      tokenExpires: result.expiresAt,
      refreshToken: result.refreshToken
    }
  };

});

Accounts.replaceLoginHandler('resume', 'resumeCorbel', function (options) {

  if (!options.token && !options.refreshToken && !options.expiresAt ) {
    return undefined; // don't handle
  }

  let corbelDriver = corbel.getDriver({
    urlBase: 'https://composr-dev.bqws.io/{{module}}/v1.0/',
    domain: 'booqs:nubico:chile',
    iamToken: {
      accessToken: options.token,
      refreshToken: options.refreshToken,
      expiresAt: options.expiresAt
    }
  });


  let result = corbelUser(corbelDriver);

  let loggedUser = Meteor.users.findOne({username: result.username});

  let userId = (!loggedUser || !loggedUser._id) ? Accounts.insertUserDoc({}, {username: result.username}) : loggedUser._id;

  Meteor.users.update({
    _id: userId
  },
  { $set: result },
  {
    field: {
      services: 0
    }
  }
  );

  var tokenObject = corbelDriver.config.get(corbel.Iam.IAM_TOKEN, {});

  return {
    userId: userId,
    stampedLoginToken: {
      token: tokenObject.accessToken,
      tokenExpires: tokenObject.expiresAt,
      refreshToken: tokenObject.refreshToken
    }
  };

});


corbelLogin = Meteor.wrapAsync(corbelLogin);
corbelUser = Meteor.wrapAsync(corbelUser);
