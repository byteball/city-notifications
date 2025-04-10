const { Telegraf } = require('telegraf');
const conf = require('ocore/conf.js');

const TOKEN = conf.TELEGRAM_BOT_TOKEN;
const TARGET_CHANNEL = conf.TELEGRAM_CHANNEL_USERNAME;
const WEBHOOK_DOMAIN = process.env.TELEGRAM_WEBHOOK_DOMAIN;
const PORT = conf.TELEGRAM_WEBHOOK_PORT;

const bot = new Telegraf(TOKEN);


const formatTagUser = (username) => {
  if (!username) return '';
  
  return username.startsWith('@') ? username : `@${username}`;
};

const sendMessage = async (message) => {
  try {
    await bot.telegram.sendMessage(TARGET_CHANNEL, message);
    console.log(`[TG] Message successfully sent to channel ${TARGET_CHANNEL}`);
  } catch (error) {
    console.error(`[TG] Error on sending message: ${error}. Message: ${message}`);
  }
};

const startBot = async () => {
  try {
    if (WEBHOOK_DOMAIN) {
      const fastify = require('fastify')();

      const webhook = await bot.createWebhook({ domain: WEBHOOK_DOMAIN });
      fastify.post(`/telegraf/${bot.secretPathComponent()}`, webhook);
      
      await fastify.listen({ port: PORT });
    } else {
      bot.launch().catch(err => {
        throw err;
      });
      console.error('[TG] Bot started in polling mode');
    }
    
    return true;
  } catch (error) {
    console.error('[TG] Error on starting bot:', error);
    return false;
  }
};

module.exports = {
  sendMessage,
  startBot,
  formatTagUser,
};