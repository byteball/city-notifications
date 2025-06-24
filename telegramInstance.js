const { Telegraf } = require('telegraf');
const conf = require('ocore/conf.js');

const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const TOKEN = conf.TELEGRAM_BOT_TOKEN;
const TARGET_CHANNEL = conf.TELEGRAM_CHANNEL_USERNAME;
const WEBHOOK_DOMAIN = process.env.TELEGRAM_WEBHOOK_DOMAIN;
const PORT = Number(conf.TELEGRAM_WEBHOOK_PORT);

const CHANNEL_USERS_UPDATE_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours

const apiId = Number(conf.TELEGRAM_APPID);
const apiHash = conf.TELEGRAM_APIHASH;
const stringSession = new StringSession("");

const bot = new Telegraf(TOKEN);
const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 10,
});

const usernameById = {};
const displayNameById = {};


const updateChannelUsers = async (slow = false) => {
  let offset = 0;
  console.log("Updating channel users...");
  try {
    while (true) {
      const result = await client.invoke(
        new Api.channels.GetParticipants({
          channel: TARGET_CHANNEL,
          filter: new Api.ChannelParticipantsRecent({}),
          offset: offset,
          limit: 100,
        })
      );

      for (let userInfo of result.users) {
        usernameById[userInfo.id] = userInfo.username;
        displayNameById[userInfo.id] = userInfo.firstName + (userInfo.lastName ? ' ' + userInfo.lastName : '');
      }

      if (result.users.length < 100) {
        break;
      }

      if (slow) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      offset += 100;
    }
    console.log("Channel users updated successfully");
  } catch (error) {
    console.error("Error on updating channel users: ", error);
  }
};

const getUsernameById = (id) => {
  return usernameById[String(id)];
};

const getUserById = (id) => {
  if (!usernameById[id]) return null;

  return {
    username: usernameById[id],
    displayName: displayNameById[id],
    id: +id,
  };
};

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
    await client.start({
      botAuthToken: TOKEN,
    });

    await updateChannelUsers();
    setInterval(() => updateChannelUsers(true), CHANNEL_USERS_UPDATE_INTERVAL);

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
  getUsernameById,
  getUserById,
};