// ===================================================
// IMPORTANT: only for development
// total.js - web application framework for node.js
// http://www.totaljs.com
// ===================================================

var fs = require('fs');
var options = {};

// options.ip = '127.0.0.1';
// options.port = parseInt(process.argv[2]);
// options.config = { name: 'total.js' };
// options.https = { key: fs.readFileSync('keys/agent2-key.pem'), cert: fs.readFileSync('keys/agent2-cert.pem')};
// options.sleep = 3000;

var isDebugging = process.argv.indexOf('debugging') !== -1;
var directory = process.cwd();
var path = require('path');
var first = process.argv.indexOf('restart') === -1;
var VERSION = '2.0';
var TIME = 2000;

process.on('uncaughtException', function(e) {
	if (e.toString().indexOf('ESRCH') !== -1)
		return;
	console.log(e);
});

function debug() {
	var framework = require('total.js');
	var port = parseInt(process.argv[process.argv.length - 1]);

	if (!isNaN(port)) {
		if (!options)
			options = {};
		options.port = port;
	}

	if (port > 0 && !options.port)
		options.port = port || 8000;

	if (options.https)
		return framework.https('debug', options);

	framework.http('debug', options);

	if (first)
		framework.emit('debug-start');
	else
		framework.emit('debug-restart');
}

function app() {
	var fork = require('child_process').fork;
	var utils = require('total.js/utils');
	var directories = [directory + '/controllers', directory + '/definitions', directory + '/isomorphic', directory + '/modules', directory + '/resources', directory + '/models', directory + '/source', directory + '/workers', directory + '/packages', directory + '/themes'];
	var files = {};
	var force = false;
	var changes = [];
	var app = null;
	var status = 0;
	var async = new utils.Async();
	var pid = '';
	var pidInterval = null;
	var prefix = '----------------------------------------------------> ';
	var isLoaded = false;
	var isSkip = false;
	var pidIncrease;
	var speed = TIME;

	function onFilter(path, isDirectory) {

		if (!isDirectory && path.match(/\/themes\//i)) {
			if (!path.match(/themes(\/|\\)?[a-z0-9_.-]+(\/|\\)?index\.js/gi))
				return false;
			return true;
		}

		return isDirectory ? true : path.match(/\.(js|resource|package)/i) !== null;
	}

	function onIncrease(clear) {

 		if (clear) {
			clearTimeout(pidIncrease);
			speed = TIME;
 		}

		pidIncrease = setTimeout(function() {
			speed += TIME;
			if (speed > 20000)
				speed = 20000;
			onIncrease();
		}, 120000);
	}

	function onComplete(f) {

		fs.readdir(directory, function(err, arr) {

			var length = arr.length;

			for (var i = 0; i < length; i++) {
				var name = arr[i];
				if (name === 'debug.js')
					continue;
				if (name.match(/config\-debug|config\-release|config|versions|sitemap|dependencies|\.js|\.resource/i))
					f.push(name);
			}

			length = f.length;

			for (var i = 0; i < length; i++) {
				var name = f[i];
				if (!files[name])
					files[name] = isLoaded ? 0 : null;
			}

			refresh();
		});
	}

	function refresh() {

		 var filenames = Object.keys(files);
		 var length = filenames.length;

		 for (var i = 0; i < length; i++) {

			var filename = filenames[i];
			(function(filename) {

				async.await(function(next) {

					fs.stat(filename, function(err, stat) {

						if (!err) {
							var ticks = stat.mtime.getTime();

							if (files[filename] !== null && files[filename] !== ticks) {
								changes.push(prefix + filename.replace(directory, '') +  (files[filename] === 0 ? ' (added)' : ' (modified)'));
								force = true;
							}

							files[filename] = ticks;
						}
						else {
							delete files[filename];
							changes.push(prefix + filename.replace(directory, '') + ' (removed)');
							force = true;
						}

						next();
					});
				});

			})(filename);
		 }

		 async.complete(function() {

			isLoaded = true;
			setTimeout(refresh_directory, speed);
			onIncrease();

			if (status !== 1)
				return;

			if (!force)
				return;

			onIncrease(true);
			restart();

			var length = changes.length;

			for (var i = 0; i < length; i++)
				console.log(changes[i]);

			changes = [];
			force = false;
		 });

	}

	function refresh_directory() {
		utils.ls(directories, onComplete, onFilter);
	}

	function restart() {

		if (app !== null) {
			try
			{
				isSkip = true;
				process.kill(app.pid);
			} catch (err) {}
			app = null;
		}

		var arr = process.argv;
		var port = arr.pop();

		if (first)
			first = false;
		else
			arr.push('restart');

		arr.push('debugging');
		arr.push(port);

		app = fork(path.join(directory, 'debug.js'), arr);

		app.on('message', function(msg) {

			if (msg === 'eaddrinuse')
				process.exit(1);

		});

		app.on('exit', function() {

			// checks unexpected exit
			if (isSkip === false) {
				app = null;
				process.exit();
				return;
			}

			isSkip = false;
			if (status !== 255)
				return;
			app = null;
		});

		if (status === 0)
			app.send('debugging');

		status = 1;
	}

	process.on('SIGTERM', end);
	process.on('SIGINT', end);
	process.on('exit', end);

	function end() {

		if (arguments.callee.isEnd)
			return;

		arguments.callee.isEnd = true;

		fs.unlink(pid, noop);

		if (app === null) {
			process.exit(0);
			return;
		}

		isSkip = true;
		process.kill(app.pid);
		app = null;
		process.exit(0);
	}

	function noop() {}

	if (process.pid > 0) {
		console.log(prefix + 'PID: ' + process.pid + ' (v' + VERSION + ')');
		pid = path.join(directory, 'debug.pid');
		fs.writeFileSync(pid, process.pid);

		pidInterval = setInterval(function() {
			fs.exists(pid, function(exist) {

				if (exist)
					return;

				fs.unlink(pid, noop);

				if (app !== null) {
					isSkip = true;
					process.kill(app.pid);
				}

				process.exit(0);
			});

		}, 2000);
	}

	restart();
	refresh_directory();
}

function run() {

	if (isDebugging) {
		debug();
		return;
	}

	var filename = path.join(directory, 'debug.pid');

	if (!fs.existsSync(filename)) {
		app();
		return;
	}

	fs.unlinkSync(filename);

	setTimeout(function() {
		app();
	}, 3000);
}

run();