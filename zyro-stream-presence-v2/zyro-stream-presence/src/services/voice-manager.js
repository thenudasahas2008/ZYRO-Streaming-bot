'use strict';

const {
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');

const {
    joinVoiceChannel,
    getVoiceConnection,
    entersState,
    VoiceConnectionStatus
} = require('@discordjs/voice');

class VoiceManager {
    constructor({ client, settingsService, reconnectDelayMs, maxReconnectDelayMs, logger }) {
        this.client = client;
        this.settingsService = settingsService;
        this.reconnectDelayMs = reconnectDelayMs;
        this.maxReconnectDelayMs = maxReconnectDelayMs;
        this.logger = logger;
        this.joining = new Map();
        this.reconnectTimers = new Map();
        this.recoveryTimers = new Map();
        this.reconnectAttempts = new Map();
        this.shuttingDown = false;
    }

    getConnection(guildId) {
        const group = this.client.user?.id || 'default';
        return getVoiceConnection(guildId, group);
    }

    async connectGuild(guildId) {
        if (this.shuttingDown) return null;
        if (this.joining.has(guildId)) return this.joining.get(guildId);

        this.clearReconnectTimer(guildId);

        const task = this.performConnect(guildId);
        this.joining.set(guildId, task);

        try {
            return await task;
        } catch (error) {
            this.logger.error(`Voice join failed for guild ${guildId}:`, error.message);
            this.scheduleReconnect(guildId);
            throw error;
        } finally {
            if (this.joining.get(guildId) === task) {
                this.joining.delete(guildId);
            }
        }
    }

    async performConnect(guildId) {
        const guildSettings = this.settingsService.getGuild(guildId);
        const channelId = guildSettings?.voiceChannelId;

        if (!channelId) {
            throw new Error('මෙම server එකට Voice Channel එකක් තෝරා නැහැ. /setvoice භාවිතා කරන්න.');
        }

        const guild = await this.client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(channelId);

        if (!channel || channel.type !== ChannelType.GuildVoice) {
            throw new Error('Save කරලා තියෙන Voice Channel එක හමු වුණේ නැහැ. /setvoice නැවත භාවිතා කරන්න.');
        }

        const botMember = guild.members.me || await guild.members.fetchMe();
        const permissions = channel.permissionsFor(botMember);

        if (
            !permissions?.has(PermissionFlagsBits.ViewChannel) ||
            !permissions?.has(PermissionFlagsBits.Connect)
        ) {
            throw new Error('Botට මේ Voice Channel එකට View Channel සහ Connect permissions දෙන්න.');
        }

        let connection = this.getConnection(guildId);

        if (connection) {
            const alreadyTarget = connection.joinConfig.channelId === channelId;
            const transitional = [
                VoiceConnectionStatus.Ready,
                VoiceConnectionStatus.Signalling,
                VoiceConnectionStatus.Connecting
            ].includes(connection.state.status);

            if (alreadyTarget && transitional) {
                if (connection.state.status === VoiceConnectionStatus.Ready) {
                    this.reconnectAttempts.delete(guildId);
                }
                return connection;
            }

            connection.destroy();
            connection = null;
        }

        const group = this.client.user.id;
        connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: guild.voiceAdapterCreator,
            group,
            selfMute: true,
            selfDeaf: true
        });

        connection.on('stateChange', (oldState, newState) => {
            if (newState.status === VoiceConnectionStatus.Ready) {
                this.clearRecoveryTimer(guildId);
                this.reconnectAttempts.delete(guildId);
                this.logger.info(`Voice connected: ${guild.name} / ${channel.name}`);
                return;
            }

            if (newState.status === VoiceConnectionStatus.Disconnected) {
                this.startDisconnectGracePeriod(guildId, connection);
            }

            if (newState.status === VoiceConnectionStatus.Destroyed) {
                this.clearRecoveryTimer(guildId);
            }
        });

        connection.on('error', error => {
            this.logger.error(`Voice connection error in ${guild.name}:`, error.message);
            this.startDisconnectGracePeriod(guildId, connection);
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 25_000);
            this.reconnectAttempts.delete(guildId);
            return connection;
        } catch (error) {
            if (this.getConnection(guildId) === connection) {
                connection.destroy();
            }
            throw new Error(`Voice connection did not become ready: ${error.message}`, {
                cause: error
            });
        }
    }

    startDisconnectGracePeriod(guildId, connection) {
        if (this.shuttingDown || this.recoveryTimers.has(guildId)) return;

        const timer = setTimeout(() => {
            this.recoveryTimers.delete(guildId);

            if (this.shuttingDown || this.getConnection(guildId) !== connection) return;

            if (connection.state.status === VoiceConnectionStatus.Disconnected) {
                connection.destroy();
                this.scheduleReconnect(guildId);
            }
        }, 8_000);

        timer.unref?.();
        this.recoveryTimers.set(guildId, timer);
    }

    scheduleReconnect(guildId, explicitDelay) {
        if (this.shuttingDown) return;
        if (!this.settingsService.getGuild(guildId)?.voiceChannelId) return;

        this.clearReconnectTimer(guildId);

        const attempts = this.reconnectAttempts.get(guildId) || 0;
        const exponentialDelay = Math.min(
            this.reconnectDelayMs * (2 ** Math.min(attempts, 8)),
            this.maxReconnectDelayMs
        );
        const delay = Number.isFinite(explicitDelay)
            ? Math.max(1_000, explicitDelay)
            : exponentialDelay;

        this.reconnectAttempts.set(guildId, attempts + 1);

        const timer = setTimeout(async () => {
            this.reconnectTimers.delete(guildId);
            try {
                await this.connectGuild(guildId);
            } catch {
                // connectGuild logs the error and schedules the next attempt.
            }
        }, delay);

        timer.unref?.();
        this.reconnectTimers.set(guildId, timer);
        this.logger.warn(`Voice reconnect scheduled for ${guildId} in ${delay}ms.`);
    }

    handleVoiceStateUpdate(oldState, newState) {
        if (this.shuttingDown || !this.client.user) return;
        if (newState.id !== this.client.user.id) return;

        const guildId = newState.guild.id;
        const expectedChannelId = this.settingsService.getGuild(guildId)?.voiceChannelId;
        if (!expectedChannelId || newState.channelId === expectedChannelId) return;

        this.logger.warn(`Bot was moved or disconnected in ${newState.guild.name}; returning to its assigned channel.`);

        // Destroy the stale connection first. Otherwise its cached joinConfig can
        // make a reconnect attempt incorrectly believe that it is still in target.
        const connection = this.getConnection(guildId);
        if (connection) connection.destroy();

        this.clearRecoveryTimer(guildId);
        this.scheduleReconnect(guildId, 1_500);
    }

    getStatus(guildId) {
        const target = this.settingsService.getGuild(guildId)?.voiceChannelId || null;
        const connection = this.getConnection(guildId);

        return {
            targetChannelId: target,
            connected: connection?.state.status === VoiceConnectionStatus.Ready,
            state: connection?.state.status || 'NotConnected',
            currentChannelId: connection?.joinConfig.channelId || null
        };
    }

    async connectConfiguredGuilds() {
        const guildIds = this.settingsService.getConfiguredGuildIds();

        for (const guildId of guildIds) {
            if (!this.client.guilds.cache.has(guildId)) {
                this.logger.warn(`Configured guild ${guildId} is not available to this bot.`);
                continue;
            }

            try {
                await this.connectGuild(guildId);
            } catch {
                // Reconnect is already scheduled by connectGuild.
            }
        }
    }

    clearReconnectTimer(guildId) {
        const timer = this.reconnectTimers.get(guildId);
        if (timer) clearTimeout(timer);
        this.reconnectTimers.delete(guildId);
    }

    clearRecoveryTimer(guildId) {
        const timer = this.recoveryTimers.get(guildId);
        if (timer) clearTimeout(timer);
        this.recoveryTimers.delete(guildId);
    }

    shutdown() {
        this.shuttingDown = true;

        for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
        for (const timer of this.recoveryTimers.values()) clearTimeout(timer);

        this.reconnectTimers.clear();
        this.recoveryTimers.clear();

        for (const guildId of this.settingsService.getConfiguredGuildIds()) {
            this.getConnection(guildId)?.destroy();
        }
    }
}

module.exports = { VoiceManager };
