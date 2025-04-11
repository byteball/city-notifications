"use strict";
const _ = require('lodash');

const eventBus = require('ocore/event_bus.js');
const conf = require('ocore/conf.js');
const network = require('ocore/network.js');
const storage = require("ocore/storage.js");
const db = require("ocore/db.js");
const walletGeneral = require("ocore/wallet_general.js");
const light_wallet = require("ocore/light_wallet.js");
const constants = require("ocore/constants.js");
const formulaEvaluation = require("ocore/formula/evaluation.js");

const dag = require('aabot/dag.js');
const operator = require('aabot/operator.js');
const aa_state = require('aabot/aa_state.js');

const discordInstance = require('./discordInstance');
const telegramInstance = require('./telegramInstance');

let notifiedPlots = {};

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function onAAResponse(objAAResponse) {
	const { aa_address, trigger_unit, trigger_address, bounced, response } = objAAResponse;
	if (bounced && trigger_address === operator.getAddress())
		return console.log(`=== our request ${trigger_unit} bounced with error`, response.error);
	if (bounced)
		return console.log(`request ${trigger_unit} bounced with error`, response.error);
	handleAAResponse(objAAResponse);
}

async function onAARequest(objAARequest, arrResponses) {
	const address = objAARequest.unit.authors[0].address;
	if (address === operator.getAddress())
		return console.log(`skipping our own request`);
	if (arrResponses[0].bounced)
		return console.log(`trigger ${objAARequest.unit.unit} from ${address} will bounce`, arrResponses[0].response.error);
	const aas = arrResponses.map(r => r.aa_address);
	console.log(`request from ${address} trigger ${objAARequest.unit.unit} affected AAs`, aas);
	for (let objAAResponse of arrResponses)
		handleAAResponse(objAAResponse)
}

function handleAAResponse(objAAResponse) {
	const { aa_address, response: { responseVars } } = objAAResponse;
	if (aa_address === conf.city_aa && responseVars) {
		const { event } = responseVars;
		if (event) {
			const objEvent = JSON.parse(event);
			console.log('city event', objEvent);
			const { type, plot_num, city, x, y } = objEvent;
			if (type === 'allocate') {
				console.log(`new plot ${plot_num} in ${city} at ${x}:${y}`);
				if (typeof plot_num !== 'number')
					throw Error(`plot_num ${plot_num} not a number`);
				checkForNeighbors(plot_num);
			}
			else
				console.log(`not an allocation event`);
		}
		else
			console.log(`no event from city`);
	}
}

async function checkForNeighbors(plot_num) {
	console.log(`checking for neighbors of ${plot_num}`);
	const aa_unlock = await aa_state.lock();
	let upcomingStateVars = _.cloneDeep(aa_state.getUpcomingStateVars());
	let upcomingBalances = _.cloneDeep(aa_state.getUpcomingBalances());
	const vars = aa_state.getUpcomingAAStateVars(conf.city_aa);
	const plot = vars['plot_' + plot_num];
	if (!plot)
		throw Error(`plot ${plot_num} not found`);
	const { city, owner, status } = plot;
	if (status !== 'land')
		return aa_unlock(`plot ${plot_num} in ${city} is ${status}`);
	console.log(`checking for neighbors of ${plot_num} in ${city}`);
	let neighbor_plot_num;
	for (let name in vars) {
		const m = name.match(/^plot_(\d+)$/);
		if (m) {
			const plot1_num = +m[1];
			const plot1 = vars[name];
			if (plot1.city === city && plot1.status === 'land' && plot1_num < plot_num) {
				console.log(`will check if ${name} is a neighbor of ${plot_num}`);
				try {
					const bNeighbors = await formulaEvaluation.executeGetterInState(db, conf.city_aa, 'are_neighbors', [plot1_num, plot_num], upcomingStateVars, upcomingBalances);
					console.log(`plots ${plot1_num} and ${plot_num} are neighbors? ${bNeighbors}`);
					if (bNeighbors) {
						neighbor_plot_num = plot1_num;
						break;
					}
				}
				catch (e) {
					console.log(`are_neighbors failed`, plot1_num, plot_num, e);
				//	neighbor_plot_num = plot1_num;
				//	break;
				}
			}
		}
	}
	aa_unlock();
	if (neighbor_plot_num) {
		await notifyNeighbors(neighbor_plot_num, plot_num);
	}
	await db.query("UPDATE node_vars SET value=? WHERE name='last_plot_num'", [plot_num]);
	console.log(`done checking for neighbors of ${plot_num} in ${city}`);
}

async function getDiscordChannelAndGuild() {
	const channel = await discordInstance.channels.fetch(conf.DISCORD_CHANNEL_ID);
	if (!channel)
		throw Error(`failed to get discord channel`);
		
	const guild = channel.guild;
	if (!guild) throw Error('server not found');
	
	await guild.members.fetch();
	
	return { channel, guild };
}

async function sendDiscordMessage(channel, content) {
	await channel.send({
		content,
		allowedMentions: { parse: ['users'] }
	});
	
	return true;
}

async function formatDiscordMention(guild,username) {
	const discordMember = guild.members.cache.find(m => m.user.username === username);
	return discordMember ? `<@${discordMember.user.id}>` : '@' + username;
}


async function notifyNeighbors(plot1_num, plot2_num) {
	if (notifiedPlots[plot2_num])
		return console.log(`already notified about plot ${plot2_num} matching`);
	const vars = aa_state.getUpcomingAAStateVars(conf.city_aa);
	const plot1 = vars['plot_' + plot1_num];
	const plot2 = vars['plot_' + plot2_num];
	const usernames1 = await getUsernames(plot1.owner);
	const usernames2 = await getUsernames(plot2.owner);
	console.log({ usernames1, usernames2 });
	let bSent = false;

	const claimUrl = `https://obyte.city/claim/${plot1_num}-${plot2_num}`;
	const messageText = `you became neighbors! Each of you gets two new empty plots and a house on the old one. You both need to claim the new plots and the house at ${claimUrl} within 10 minutes of each other. You can do this at any time. Please message each other to agree when you send your claiming transactions.`;

	if (usernames1.discord && usernames2.discord) {
		const { channel, guild } = await getDiscordChannelAndGuild();
		const member1Mention = await formatDiscordMention(guild, usernames1.discord);
		const member2Mention = await formatDiscordMention(guild, usernames2.discord);
		
		await sendDiscordMessage(channel, `${member1Mention} ${member2Mention} ${messageText}`);
		bSent = true;
	}
	
	if (usernames1.telegram && usernames2.telegram) {
		const tagUsersForMessage = `${telegramInstance.formatTagUser(usernames1.telegram)} ${telegramInstance.formatTagUser(usernames2.telegram)}`;
		
		await telegramInstance.sendMessage(`${tagUsersForMessage} ${messageText}`);
		bSent = true;
	}

	// users are on different networks
	if (
		usernames1.discord && !usernames1.telegram && !usernames2.discord && usernames2.telegram
		||
		usernames2.discord && !usernames2.telegram && !usernames1.discord && usernames1.telegram
	) {
		if (bSent)
			throw Error(`already sent ${plot1_num} and ${plot2_num}`);

		const discordUsername = usernames1.discord || usernames2.discord;
		const telegramUsername = usernames1.telegram || usernames2.telegram;
		
		// discord
		const { channel, guild } = await getDiscordChannelAndGuild();
		const discordMentionForDS = await formatDiscordMention(guild, discordUsername);
		await sendDiscordMessage(channel, `${discordMentionForDS} and telegram user @${telegramUsername} ${messageText}`);
		
		// telegram
		const telegramMentionForTG = telegramInstance.formatTagUser(telegramUsername);
		await telegramInstance.sendMessage(`${telegramMentionForTG} and discord user @${discordUsername} ${messageText}`);
		bSent = true;
	}

	if (!bSent)
		console.error(`not notified about plots ${plot1_num} and ${plot2_num}`, usernames1, usernames2);

	notifiedPlots[plot2_num] = true;
}

// get usernames of a user on discord, telegram, etc
async function getUsernames(address) {
	const rows = await db.query("SELECT attestor_address, value FROM attested_fields WHERE attestor_address IN(?) AND address=? AND field='username' ORDER BY rowid DESC", [Object.keys(conf.attestors), address]);
	if (rows.length === 0)
		throw Error(`no attestations for ${address}`);
	let usernames = {};
	for (let { attestor_address, value: username } of rows) {
		const service = conf.attestors[attestor_address];
		if (!usernames[service]) // the later attestation has precedence
			usernames[service] = username;
	}
	return usernames;
}

async function loadLibs() {
	for (let address of conf.lib_aas) {
	//	await dag.loadAA(address);
		const definition = await dag.readAADefinition(address);
		const payload = { address, definition };
		await storage.insertAADefinitions(db, [payload], constants.GENESIS_UNIT, 0, false);
	}
}




function initAsset() {
	const vars = aa_state.getAAStateVars(conf.city_aa);
	const asset = vars.constants?.asset;
	if (!asset)
		throw Error(`asset not defined yet in ${conf.city_aa}`);
	network.requestHistoryFor([asset]);
}

async function checkForMissedNeighbors() {
	console.log(`checking for missed neighbors`);
	await db.query(`CREATE TABLE IF NOT EXISTS node_vars (
		name VARCHAR(30) NOT NULL PRIMARY KEY,
		value TEXT NOT NULL,
		last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`);
	await db.query(`INSERT OR IGNORE INTO node_vars (name, value) VALUES ('last_plot_num', 0)`);
	const [{ value: last_seen_plot_num }] = await db.query("SELECT value FROM node_vars WHERE name='last_plot_num'");
	const vars = aa_state.getAAStateVars(conf.city_aa);
	const last_plot_num = vars.state.last_plot_num;
	for (let plot_num = +last_seen_plot_num + 1; plot_num <= last_plot_num; plot_num++){
		const plot = vars['plot_' + plot_num];
		if (plot)
			await checkForNeighbors(plot_num);
	}
	console.log(`done checking for missed neighbors`);
}

// wait until all the addresses added in addWatchedAddress() are processed
async function waitForUnprocessedAddresses() {
	while (true) {
		const rows = await db.query("SELECT address FROM unprocessed_addresses");
		if (rows.length === 0)
			return;
		console.log(`still have unprocessed addresses, will wait`, rows);
		await sleep(1000);
	}
}

async function startWatching() {
	await loadLibs();

	if (!conf.DISCORD_BOT_TOKEN) throw new Error('error: DISCORD_BOT_TOKEN is required');
	if (!conf.DISCORD_CHANNEL_ID) throw new Error('error: DISCORD_CHANNEL_ID is required');
	if (!conf.TELEGRAM_BOT_TOKEN) throw new Error('error: TELEGRAM_BOT_TOKEN is required');
	if (!conf.TELEGRAM_CHANNEL_USERNAME) throw new Error('error: TELEGRAM_CHANNEL_USERNAME is required');
	
	await discordInstance.login(conf.DISCORD_BOT_TOKEN);
	await telegramInstance.startBot();
	
	eventBus.on("aa_request_applied", onAARequest);
	eventBus.on("aa_response_applied", onAAResponse);

	await aa_state.followAA(conf.city_aa);
	await aa_state.followAA(conf.vrf_oracle_aa);

	await light_wallet.waitUntilFirstHistoryReceived();
	console.log('first history received');

	for (let address in conf.attestors)
		walletGeneral.addWatchedAddress(address);

	initAsset();
	
	await waitForUnprocessedAddresses(); // for update attestors history

	await checkForMissedNeighbors();

}

exports.startWatching = startWatching;
