const { Client, GatewayIntentBits } = require('discord.js');

const discordInstance = new Client({ allowedMentions: { parse: ['users'] }, intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.Guilds] });

module.exports = discordInstance;

