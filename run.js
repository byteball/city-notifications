/*jslint node: true */
"use strict";
const eventBus = require('ocore/event_bus.js');
const network = require('ocore/network.js');

const operator = require('aabot/operator.js');
const watcher = require('./watcher.js');


eventBus.on('headless_wallet_ready', async () => {
	await operator.start();

	network.start();
	await watcher.startWatching();
});

process.on('unhandledRejection', up => {
	console.error('unhandledRejection event', up, up.stack);
	throw up;
});
