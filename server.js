#!/usr/bin/env node
// Starts the bot, handles permissions and chat context,
// interprets commands and delegates the actual command
// running to a Command instance. When started, an owner
// ID should be given.

var path = require("path");
var fs = require("fs");
var botgram = require("botgram");
var escapeHtml = require("escape-html");
var utils = require("./lib/utils");
var Command = require("./lib/command").Command;
var Editor = require("./lib/editor").Editor;
var https = require("https");

var CONFIG_FILE = path.join(__dirname, "config.json");
try {
    var config = require(CONFIG_FILE);
} catch (e) {
    console.error("Couldn't load the configuration file, starting the wizard.\n");
    require("./lib/wizard").configWizard({ configFile: CONFIG_FILE });
    return;
}

var bot = botgram(config.authToken, { agent: utils.createAgent() });
var owner = config.owner;
var tokens = {};
var granted = {};
var contexts = {};
var defaultCwd = process.env.HOME || process.cwd();

// Cloudflare API Key's
const zone = config.zone;
const authkey = config.authkey;
const authemail = config.authemail;

var fileUploads = {};

bot.on("updateError", function (err) {
  console.error("Error when updating:", err);
});

bot.on("synced", function () {
  console.log("Bot ready.");
});


function rootHook(msg, reply, next) {
  if (msg.queued) return;

  var id = msg.chat.id;
  var allowed = id === owner || granted[id];

  // If this message contains a token, check it
  if (!allowed && msg.command === "start" && Object.hasOwnProperty.call(tokens, msg.args())) {
    var token = tokens[msg.args()];
    delete tokens[msg.args()];
    granted[id] = true;
    allowed = true;

    // Notify owner
    // FIXME: reply to token message
    var contents = (msg.user ? "User" : "Chat") + " <em>" + escapeHtml(msg.chat.name) + "</em>";
    if (msg.chat.username) contents += " (@" + escapeHtml(msg.chat.username) + ")";
    contents += " can now use the bot. To revoke, use:";
    reply.to(owner).html(contents).command("revoke", id);
  }

  // If chat is not allowed, but user is, use its context
  if (!allowed && (msg.from.id === owner || granted[msg.from.id])) {
    id = msg.from.id;
    allowed = true;
  }

  // Check that the chat is allowed
  if (!allowed) {
    if (msg.command === "start") reply.html("Not authorized to use this bot.");
    return;
  }

  if (!contexts[id]) contexts[id] = {
    id: id,
    shell: utils.shells[0],
    env: utils.getSanitizedEnv(),
    cwd: defaultCwd,
    size: {columns: 40, rows: 20},
    silent: true,
    interactive: false,
    linkPreviews: false,
  };

  msg.context = contexts[id];
  next();
}
bot.all(rootHook);
bot.edited.all(rootHook);

// Status
bot.command("srvstatus", function (msg, reply, next) {
  var content = "", context = msg.context;

  // Running command
  if (context.editor) content += "Editing file: " + escapeHtml(context.editor.file) + "\n\n";
  else if (!context.command) content += "No command running.\n\n";
  else content += "Command running, PID "+context.command.pty.pid+".\n\n";

  // Chat settings
  content += "Shell: " + escapeHtml(context.shell) + "\n";
  content += "Size: " + context.size.columns + "x" + context.size.rows + "\n";
  content += "Directory: " + escapeHtml(context.cwd) + "\n";
  content += "Silent: " + (context.silent ? "yes" : "no") + "\n";
  content += "Shell interactive: " + (context.interactive ? "yes" : "no") + "\n";
  content += "Link previews: " + (context.linkPreviews ? "yes" : "no") + "\n";
  var uid = process.getuid(), gid = process.getgid();
  if (uid !== gid) uid = uid + "/" + gid;
  content += "UID/GID: " + uid + "\n";

  // Granted chats (msg.chat.id is intentional)
  if (msg.chat.id === owner) {
    var grantedIds = Object.keys(granted);
    if (grantedIds.length) {
      content += "\nGranted chats:\n";
      content += grantedIds.map(function (id) { return id.toString(); }).join("\n");
    } else {
      content += "\nNo chats granted. Use /grant or /token to allow another chat to use the bot.";
    }
  }

  if (context.command) reply.reply(context.command.initialMessage.id);
  reply.html(content);
});

// Settings: Other chat access
bot.command("grant", "revoke", function (msg, reply, next) {
  if (msg.context.id !== owner) return;
  var arg = msg.args(1)[0], id = parseInt(arg);
  if (!arg || isNaN(id))
    return reply.html("Use %s or %s to control whether the chat with that ID can use this bot.", "/grant <id>", "/revoke <id>");
  reply.reply(msg);
  if (msg.command === "grant") {
    granted[id] = true;
    reply.html("Chat %s can now use this bot. Use /revoke to undo.", id);
  } else {
    if (contexts[id] && contexts[id].command)
      return reply.html("Couldn't revoke specified chat because a command is running.");
    delete granted[id];
    delete contexts[id];
    reply.html("Chat %s has been revoked successfully.", id);
  }
});
bot.command("token", function (msg, reply, next) {
  if (msg.context.id !== owner) return;
  var token = utils.generateToken();
  tokens[token] = true;
  reply.disablePreview().html("One-time access token generated. The following link can be used to get access to the bot:\n%s\nOr by forwarding me this:", bot.link(token));
  reply.command(true, "start", token);
});

// Welcome message, help
bot.command("start", function (msg, reply, next) {
  if (msg.args() && msg.context.id === owner && Object.hasOwnProperty.call(tokens, msg.args())) {
    reply.html("You were already authenticated; the token has been revoked.");
  } else {
    reply.html("Welcome! Use /help for more info.");
  }
});

bot.command("help", function (msg, reply, next) {
  reply.html(
    "Development Mode /on\n" +
    "Development Mode /off\n" +
    "Cache - Purge /everything\n" +
    "Development Mode /status .\n"
  );
});


bot.command("status", function (msg, reply, next) {

    var options = {
      host: 'api.cloudflare.com',
      port: 443,
      path: '/client/v4/zones/' + zone + '/settings/development_mode',
      // authentication headers
      headers: {
         'X-Auth-Email': authemail,
         'X-Auth-Key': authkey,
         'Content-Type': 'application/json'
      }   
    };
    request = https.get(options, function(res){
      var body = "";
      res.on('data', function(data) {
         body += data;
      });
      res.on('end', function() {
       //here we have the full response, html or json object
       var obj = JSON.parse(body);
       reply.html("Development Mode = " + obj.result.value);
      })
      res.on('error', function(e) {
        reply.html("Got error: " + e.message);
      });
     });

})

bot.command("on", function (msg, reply, next) {

  var options = {
    host: 'api.cloudflare.com',
    port: 443,
    path: '/client/v4/zones/' + zone + '/settings/development_mode',
    method: 'PATCH',
    // authentication headers
    headers: {
       'X-Auth-Email': authemail,
       'X-Auth-Key': authkey,
       'Content-Type': 'application/json',
    },
  };
  request = https.request(options, function(res){
    var body = "";
    res.on('data', function(data) {
       body += data;
    });
    res.on('end', function() {
     //here we have the full response, html or json object
     var obj = JSON.parse(body);
     reply.html("Development Mode = " + obj.result.value);
    })
    res.on('error', function(e) {
      reply.html("Got error: " + e.message);
    });
   });
   request.write('{"value" : "on"}');
   request.end();
})

bot.command("off", function (msg, reply, next) {

  var options = {
    host: 'api.cloudflare.com',
    port: 443,
    path: '/client/v4/zones/' + zone + '/settings/development_mode',
    method: 'PATCH',
    // authentication headers
    headers: {
       'X-Auth-Email': authemail,
       'X-Auth-Key': authkey,
       'Content-Type': 'application/json',
    },
  };
  request = https.request(options, function(res){
    var body = "";
    res.on('data', function(data) {
       body += data;
    });
    res.on('end', function() {
     //here we have the full response, html or json object
     var obj = JSON.parse(body);
     reply.html("Development Mode = " + obj.result.value);
    })
    res.on('error', function(e) {
      reply.html("Got error: " + e.message);
    });
   });
   request.write('{"value" : "off"}');
   request.end();
})

bot.command("everything", function (msg, reply, next) {

  var options = {
    host: 'api.cloudflare.com',
    port: 443,
    path: '/client/v4/zones/' + zone + '/purge_cache',
    method: 'POST',
    // authentication headers
    headers: {
       'X-Auth-Email': authemail,
       'X-Auth-Key': authkey,
       'Content-Type': 'application/json',
    },
  };
  request = https.request(options, function(res){
    var body = "";
    res.on('data', function(data) {
       body += data;
    });
    res.on('end', function() {
     //here we have the full response, html or json object
     var obj = JSON.parse(body);
     if (obj.success === true) {
        reply.html("Cache ist gelöscht. Kann bis zu 30 Sekunden dauern.");
     } else {
        reply.html("Cache löschen fehlgeschlagen. Kontaktiere @digitalgeneralist");
     }

    })
    res.on('error', function(e) {
      reply.html("Got error: " + e.message);
    });
   });
   request.write('{"purge_everything" : true}');
   request.end();
})


// FIXME: add inline bot capabilities!
// FIXME: possible feature: restrict chats to UIDs
// FIXME: persistence
// FIXME: shape messages so we don't hit limits, and react correctly when we do


bot.command(function (msg, reply, next) {
  reply.reply(msg).text("Invalid command.");
});
