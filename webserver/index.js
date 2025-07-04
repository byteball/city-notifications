const fastify = require('fastify');
const conf = require('ocore/conf.js');
const cors = require('@fastify/cors');

const discordInstance = require('../discordInstance');
const telegramInstance = require('../telegramInstance');

const app = fastify({ logger: false });

function isOnlyDigits(str) {
    return /^\d+$/.test(str);
}

app.get('/display_name/:userId', async (request, reply) => {
    const { userId } = request.params;

    if (!isOnlyDigits(userId)) {
        return reply.status(400).send({ error: 'Invalid user ID format' });
    }

    const userInDiscord = await discordInstance.users.fetch(userId).catch(() => null);

    if (userInDiscord) {
        return ({
            username: userInDiscord.username,
            displayName: userInDiscord.displayName,
            id: userInDiscord.id
        });
    }

    const userInTelegram = telegramInstance.getUserById(userId);

    if (userInTelegram) {
        return ({
            username: userInTelegram.username,
            displayName: userInTelegram.displayName,
            id: userInTelegram.id
        });
    }

    return reply.status(404).send({ error: 'User not found' });
});

const startWebServer = async () => {
    await app.register(cors, {
        origin: '*',
        methods: ['GET'],
        allowedHeaders: ['Content-Type']
    });

    await app.listen({ port: conf.webserverPort, host: '0.0.0.0' });
    app.log.info(`Server listening on port ${conf.webserverPort}`);
};

module.exports = {
    start: startWebServer
}
