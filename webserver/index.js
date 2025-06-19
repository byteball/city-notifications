const fastify = require('fastify');
const conf = require('ocore/conf.js');

const discordInstance = require('../discordInstance');

const app = fastify({ logger: false });

function isOnlyDigits(str) {
    return /^\d+$/.test(str);
}

app.get('/display_name/:userId', async (request, reply) => {
    const { userId } = request.params;

    if (!isOnlyDigits(userId)) {
        return reply.status(400).send({ error: 'Invalid user ID format' });
    }

    const user = await discordInstance.users.fetch(userId).catch(() => null);

    if (user) {
        return ({
            username: user.username,
            displayName: user.displayName,
            id: user.id
        });
    }

    return reply.status(404).send({ error: 'User not found' });
});

const startWebServer = async () => {
    try {
        await app.listen({ port: conf.webserverPort, host: '0.0.0.0' });
        app.log.info(`Server listening on port ${conf.webserverPort}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

module.exports = {
    start: startWebServer
}
