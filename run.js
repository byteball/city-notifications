/*jslint node: true */
"use strict";
// must be loaded before ocore: ocore/storage.js freezes String.prototype, which breaks @vladfrangu/async_event_emitter (used by discord.js)
require('discord.js');
const eventBus = require('ocore/event_bus.js');
const network = require('ocore/network.js');

const operator = require('aabot/operator.js');
const watcher = require('./watcher.js');
const webserver = require('./webserver/index.js');


eventBus.on('headless_wallet_ready', async () => {
	await operator.start();

	network.start();
	await watcher.startWatching();

	webserver.start();
});

process.on('unhandledRejection', up => {
	console.error('unhandledRejection event', up, up.stack);
	throw up;
});
