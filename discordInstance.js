const { Client, GatewayIntentBits } = require('discord.js');

const discordInstance = new Client({ allowedMentions: { parse: ['users'] }, intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds] });

module.exports = discordInstance;

