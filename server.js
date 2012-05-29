// This example makes a web site providing an uppercasing service over
// SockJS. The web page sends the user's input over a SockJS socket,
// which is relayed to a REQuest socket which we're listening on with
// a REPly socket. The answer is then calculated and sent back to the
// browser.
//
// You may ask "Why not just reply directly instead of going through
// RabbitMQ?". Well, imagine that the uppercasing was in fact some
// specialised job that was running in another program, and further
// that we might wish to run several instances of that program to keep
// up with the requests. By using RabbitMQ, the requests will be
// load-balanced among all programs listening on a REPly socket.

var http = require('http');
var url = require('url');
var fs = require('fs');
var sockjs = require('sockjs');
var mongodb = require('mongodb');

console.log("Connecting to RabbitMQ at " + rabbitUrl());

var context = require('rabbit.js').createContext(rabbitUrl());
var port = process.env.VCAP_APP_PORT || 8181

// Create a web server on which we'll serve our demo page, and listen
// for SockJS connections.
var httpserver = http.createServer(handler);// Listen for SockJS connections
var sockjs_opts = {sockjs_url: "http://cdn.sockjs.org/sockjs-0.2.min.js", websocket: false};
var sjs = sockjs.createServer(sockjs_opts);
sjs.installHandlers(httpserver, {prefix: '[/]socks'});

// Hook requesting sockets up
sjs.on('connection', function(connection) {
  addConnection(connection);
});

context.on('ready', function() {
  var sub = context.socket('SUB');
  sub.setEncoding('utf8');
  sub.connect({exchange: "amq.topic", pattern: "logs.#"});

  sub.on('data', function(msg) {
      // Store the message in MongoDB.
      storeLog(msg);

      // and broadcast to all SockJS connections.
      broadcast(msg);
  });

  // And finally, start the web server.
  httpserver.listen(port);
});

// ==== boring details
function storeLog(msg) {
  mongodb.connect(mongoUrl(), function(err, conn) {
    conn.collection('logs', function(err, coll) {
      coll.insert({ 'msg': msg }, { safe: true }, function(err) {
        if (err) console.log("Failed to add log message to MongoDB: " + err);
      });
    });
  });
}

function rabbitUrl() {
  if (process.env.VCAP_SERVICES) {
    conf = JSON.parse(process.env.VCAP_SERVICES);
    return conf['rabbitmq-2.4'][0].credentials.url;
  }
  else {
    return "amqp://localhost:5672";
  }
}

function mongoUrl() {
  var conf = mongoConf();

  conf.hostname = (conf.hostname || 'localhost');
  conf.port = (conf.port || 27017);
  conf.db = (conf.db || 'test');

  if (conf.username && conf.password) {
    return "mongodb://" + conf.username +
        ":" + conf.password + "@" + conf.hostname +
        ":" + conf.port + "/" + conf.db;
  }
  else {
    return "mongodb://" + conf.hostname + ":" + conf.port + "/" + conf.db;
  }
}

function mongoConf() {
  if (process.env.VCAP_SERVICES) {
    var env = JSON.parse(process.env.VCAP_SERVICES);
    return env['mongodb-1.8'][0]['credentials'];
  }
  else {
    return {
      "hostname":"localhost",
      "port":27017,
      "username":"",
      "password":"",
      "name":"",
      "db":"db"
    }
  }
}

function handler(req, res) {
  var path = url.parse(req.url).pathname;
  switch (path){
  case '/':
  case '/index.html':
    fs.readFile(__dirname + '/index.html', function(err, data) {
      if (err) return send404(res);
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data, 'utf8');
      res.end();
    });
    break;
  default: send404(res);
  }
}

function send404(res) {
  res.writeHead(404);
  res.write('404');
  return res.end();
}

var sockets = [];

function addConnection(connection) {
  sockets.push(connection);
  connection.on('close', function() {
    var i = sockets.indexOf(connection);
    if (i > -1) {
      sockets.splice(i);
    }
  });
}

function broadcast(msg) {
  for (var i = 0, len = sockets.length; i < len; i++) {
    sockets[i].write(msg);
  }
}
