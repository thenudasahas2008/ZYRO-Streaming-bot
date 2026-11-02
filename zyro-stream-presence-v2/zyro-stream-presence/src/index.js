'use strict';

const {
    Client,
    GatewayIntentBits,
    Events,
    PermissionFlagsBits,
    MessageFlags,
    REST,
    Routes,
    EmbedBuilder
} = require('discord.js');

const CONFIG = require('./config');
const { JsonStore } = require('./storage');
const { commands } = require('./commands');
const { SettingsService } = require('./services/settings-service');
const { TimerService } = require('./services/timer-service');
const { PresenceManager } = require('./services/presence-manager');
const { VoiceManager } = require('./services/voice-manager');
const { validateStreamUrl } = require('./lib/stream-url');

const logger = {
    info: (...args) => console.log(new Date().toISOString(), '[INFO]', ...args),
    warn: (...args) => console.warn(new Date().toISOString(), '[WARN]', ...args),
    error: (...args) => console.error(new Date().toISOString(), '[ERROR]', ...args)
};

if (!CONFIG.token || CONFIG.token === 'PASTE_YOUR_BOT_TOKEN_HERE') {
    throw new Error('BOT_TOKEN එක .env file එකේ සකසන්න.');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ],
    allowedMentions: {
        parse: [],
        repliedUser: false
    }
});

const store = new JsonStore();
const settingsService = new SettingsService({
    store,
    filePath: CONFIG.settingsFile,
    defaultStreamUrl: CONFIG.defaultStreamUrl,
    legacyVoiceTargets: CONFIG.legacyVoiceTargets
});
const timerService = new TimerService({
    store,
    filePath: CONFIG.timerFile,
    initialHours: CONFIG.baseElapsedHours
});

const presenceManager = new PresenceManager({
    client,
    timerService,
    settingsService,
    intervalMs: CONFIG.presenceIntervalMs,
    logger
});

const voiceManager = new VoiceManager({
    client,
    settingsService,
    reconnectDelayMs: CONFIG.reconnectDelayMs,
    maxReconnectDelayMs: CONFIG.reconnectMaxDelayMs,
    logger
});

let bootstrapComplete = false;
let shuttingDown = false;
let persistenceInterval = null;

function createStatusEmbed(interaction) {
    const elapsed = timerService.getElapsed();
    const voice = voiceManager.getStatus(interaction.guildId);
    const streamUrl = settingsService.getStreamUrl();
    const configuredGuildCount = settingsService.getConfiguredGuildIds().length;

    const embed = new EmbedBuilder()
        .setColor(voice.connected ? 0x22c55e : 0xf59e0b)
        .setTitle('ZYRO Streaming System')
        .addFields(
            {
                name: 'Timer',
                value: `**${elapsed.formatted}**`,
                inline: true
            },
            {
                name: 'Voice Connection',
                value: voice.connected ? '🟢 Connected' : `🟠 ${voice.state}`,
                inline: true
            },
            {
                name: 'Pinned Channel',
                value: voice.targetChannelId
                    ? `<#${voice.targetChannelId}>`
                    : 'තෝරා නැහැ — `/setvoice`',
                inline: true
            },
            {
                name: 'Streaming URL',
                value: streamUrl ? `[Configured](${streamUrl})` : 'සකසා නැහැ — `/setstream`',
                inline: false
            },
            {
                name: 'Configured Servers',
                value: String(configuredGuildCount),
                inline: true
            }
        )
        .setFooter({ text: 'Timer එක restart වුණත් data folder එක පවතින තාක් දිගටම ගණනය වේ.' })
        .setTimestamp();

    return embed;
}

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(CONFIG.token);
    const route = CONFIG.devGuildId
        ? Routes.applicationGuildCommands(client.application.id, CONFIG.devGuildId)
        : Routes.applicationCommands(client.application.id);

    await rest.put(route, { body: commands });
    logger.info(
        CONFIG.devGuildId
            ? `Slash commands registered for test guild ${CONFIG.devGuildId}.`
            : 'Global slash commands registered.'
    );
}

async function bootstrap() {
    try {
        await settingsService.initialize();
        await timerService.initialize();

        try {
            await registerCommands();
        } catch (error) {
            logger.error('Slash command registration failed:', error.message);
        }

        presenceManager.start();
        await voiceManager.connectConfiguredGuilds();

        persistenceInterval = setInterval(() => {
            timerService.persist().catch(error => {
                logger.error('Timer persistence failed:', error.message);
            });
        }, 5 * 60 * 1000);
        persistenceInterval.unref?.();

        bootstrapComplete = true;
        logger.info(`Ready as ${client.user.tag}.`);
        logger.info(`Timer restored: ${timerService.getElapsed().formatted}.`);
    } catch (error) {
        logger.error('Startup failed:', error);
        await shutdown('BOOTSTRAP_ERROR');
        process.exitCode = 1;
    }
}

async function executeCommand(interaction) {
    const commandName = interaction.commandName;
    const isAdminCommand = ['setvoice', 'setstream', 'reset'].includes(commandName);

    if (['setvoice', 'status'].includes(commandName) && !interaction.inGuild()) {
        await interaction.reply({
            content: 'මේ command එක Discord server එකක් ඇතුළේ භාවිතා කරන්න.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (isAdminCommand && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
            content: 'මේ command එක භාවිතා කරන්න **Manage Server** permission එක අවශ්‍යයි.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        switch (commandName) {
            case 'setvoice': {
                const channel = interaction.options.getChannel('channel', true);
                const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
                const permissions = channel.permissionsFor(botMember);

                if (!permissions?.has(PermissionFlagsBits.ViewChannel) ||
                    !permissions?.has(PermissionFlagsBits.Connect)) {
                    await interaction.editReply(
                        'Botට මේ channel එකට **View Channel** සහ **Connect** permissions දෙන්න.'
                    );
                    return;
                }

                await settingsService.setVoiceChannel(interaction.guildId, channel.id);

                try {
                    await voiceManager.connectGuild(interaction.guildId);
                    await interaction.editReply(
                        `✅ Bot එක <#${channel.id}> channel එකට සම්බන්ධ වුණා. Restart වුණත් මේ channel එක save වෙලා තියෙනවා.`
                    );
                } catch (error) {
                    await interaction.editReply(
                        `Channel එක save කළා, නමුත් දැන් connect වෙන්න බැරි වුණා. Auto reconnect උත්සාහ කරනවා.\n**හේතුව:** ${error.message}`
                    );
                }
                return;
            }

            case 'setstream': {
                const url = interaction.options.getString('url', true);
                const validation = validateStreamUrl(url);

                if (!validation.valid) {
                    await interaction.editReply(`❌ ${validation.reason}`);
                    return;
                }

                await settingsService.setStreamUrl(validation.url);
                presenceManager.update();

                await interaction.editReply(
                    `✅ Streaming presence link එක update කළා.\n${validation.url}\n\nමේක bot account එකේ global presence එක නිසා සියලු servers වලට බලපානවා.`
                );
                return;
            }

            case 'timer': {
                const elapsed = timerService.getElapsed();
                await interaction.editReply(
                    `⏱️ **${elapsed.formatted}**\nSeconds: ${elapsed.seconds.toString().padStart(2, '0')}\n\nBot restart වුණත් timer එක ඉදිරියට ගණනය වෙනවා.`
                );
                return;
            }

            case 'status': {
                await interaction.editReply({ embeds: [createStatusEmbed(interaction)] });
                return;
            }

            case 'reset': {
                const hours = interaction.options.getInteger('hours') ?? 5000;
                const elapsed = await timerService.reset(hours);
                presenceManager.update();

                await interaction.editReply(
                    `✅ Global timer එක **${elapsed.formatted}** සිට නැවත පටන් ගත්තා.\nමෙය bot එක භාවිතා කරන සියලු servers වල timer එකට බලපානවා.`
                );
                return;
            }

            default:
                await interaction.editReply('මේ command එක හඳුනාගන්න බැහැ.');
        }
    } catch (error) {
        logger.error(`Command /${commandName} failed:`, error);
        const message = `❌ Command එක ක්‍රියාත්මක වුණේ නැහැ: ${error.message}`;

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(message).catch(() => {});
        } else {
            await interaction.reply({
                content: message,
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }
}

client.once(Events.ClientReady, readyClient => {
    logger.info(`Discord login successful: ${readyClient.user.tag}`);
    bootstrap().catch(error => {
        logger.error('Unhandled bootstrap failure:', error);
    });
});

client.on(Events.InteractionCreate, interaction => {
    if (!interaction.isChatInputCommand()) return;
    executeCommand(interaction).catch(error => {
        logger.error('Interaction handler failed:', error);
    });
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    voiceManager.handleVoiceStateUpdate(oldState, newState);
});

client.on(Events.GuildCreate, guild => {
    if (settingsService.getGuild(guild.id)?.voiceChannelId) {
        voiceManager.scheduleReconnect(guild.id, 2_000);
    }
});

client.on(Events.GuildDelete, guild => {
    const connection = voiceManager.getConnection(guild.id);
    connection?.destroy();
});

client.on(Events.Error, error => {
    logger.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    logger.error('Unhandled promise rejection:', error);
});

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.warn(`Shutting down (${signal})...`);
    presenceManager.stop();

    if (persistenceInterval) clearInterval(persistenceInterval);
    voiceManager.shutdown();

    if (bootstrapComplete || timerService.initialized) {
        await timerService.persist().catch(error => {
            logger.error('Final timer save failed:', error.message);
        });
    }

    client.destroy();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

client.login(CONFIG.token).catch(error => {
    logger.error('Discord login failed:', error.message);
    process.exitCode = 1;
});
