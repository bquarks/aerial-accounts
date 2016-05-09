let Fiber = Npm.require('fibers');


Meteor.server.publish = Meteor.publish = function (name, handler, options) {
    var self = this;

    options = options || {};

    if (name && name in self.publish_handlers) {
      Meteor._debug("Ignoring duplicate publish named '" + name + "'");
      return;
    }

    if (Package.autopublish && !options.is_auto) {
      // They have autopublish on, yet they're trying to manually
      // picking stuff to publish. They probably should turn off
      // autopublish. (This check isn't perfect -- if you create a
      // publish before you turn on autopublish, it won't catch
      // it. But this will definitely handle the simple case where
      // you've added the autopublish package to your app, and are
      // calling publish from your app code.)
      if (!self.warned_about_autopublish) {
        self.warned_about_autopublish = true;
        Meteor._debug(
"** You've set up some data subscriptions with Meteor.publish(), but\n" +
"** you still have autopublish turned on. Because autopublish is still\n" +
"** on, your Meteor.publish() calls won't have much effect. All data\n" +
"** will still be sent to all clients.\n" +
"**\n" +
"** Turn off autopublish by removing the autopublish package:\n" +
"**\n" +
"**   $ meteor remove autopublish\n" +
"**\n" +
"** .. and make sure you have Meteor.publish() and Meteor.subscribe() calls\n" +
"** for each collection that you want clients to see.\n");
      }
    }

    if (name)
      self.publish_handlers[name] = function () {
        Fiber.current._meteor_dynamics = [undefined, {userId: this.userId} ];
        return handler.apply(this, Array.prototype.slice.call(arguments));
      };
    else {
      self.universal_publish_handlers.push(handler);
      // Spin up the new publisher on any existing session too. Run each
      // session's subscription in a new Fiber, so that there's no change for
      // self.sessions to change while we're running this loop.
      _.each(self.sessions, function (session) {
        if (!session._dontStartNewUniversalSubs) {
          Fiber(function() {
            session._startSubscription(handler);
          }).run();
        }
      });
    }
  }.bind(Meteor.server);
