/* globals Npm, Package */

Package.describe({
  name: 'bquarks:aerial-accounts',
  version: '0.5.6',
  // Brief, one-line summary of the package.
  summary: 'Meteor package to wrapp the meteor accounts system with the aerial suite',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/bquarks/aerial-accounts.git',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Npm.depends({
  'corbel-js': '0.6.3'
});

Package.onUse(function (api) {
  api.versionsFrom('1.2.1');
  api.use('ecmascript');
  api.use('accounts-base');
  api.use('sha');
  api.use('underscore');

  api.imply('accounts-base', ['client', 'server']);
  api.imply('meteor', 'server');
  api.export('Accounts', 'server');
  api.export('UserProfile', 'server');

  api.addFiles('aerial_accounts_corbel.js', 'server');
  api.addFiles('aerial_accounts_server.js', 'server');
  api.addFiles('aerial_accounts_publications.js', 'server');
  api.addFiles('aerial_accounts_client.js', 'client');
  api.addFiles('aerial_accounts_corbel_client.js', 'client');
  api.addFiles('aerial_accounts_token_client.js', 'client');
});
