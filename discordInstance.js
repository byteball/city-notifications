const { Client, GatewayIntentBits } = require('discord.js');

const discordInstance = new Client({ allowedMentions: { parse: ['users'] }, intents: [GatewayIntentBits.GuildMessages] });

module.exports = discordInstance;

