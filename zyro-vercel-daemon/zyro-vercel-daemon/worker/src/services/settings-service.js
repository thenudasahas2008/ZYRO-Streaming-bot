'use strict';

const { validateStreamUrl } = require('../lib/stream-url');

const EMPTY_SETTINGS = Object.freeze({
    version: 1,
    streamUrl: '',
    guilds: {}
});

class SettingsService {
    constructor({ store, filePath, defaultStreamUrl = '', legacyVoiceTargets = {} }) {
        this.store = store;
        this.filePath = filePath;
        this.defaultStreamUrl = defaultStreamUrl;
        this.legacyVoiceTargets = legacyVoiceTargets;
        this.data = structuredClone(EMPTY_SETTINGS);
    }

    async initialize() {
        const loaded = await this.store.read(this.filePath, EMPTY_SETTINGS);
        this.data = this.normalize(loaded);
        let changed = false;

        if (!this.data.streamUrl && this.defaultStreamUrl) {
            const result = validateStreamUrl(this.defaultStreamUrl);
            if (result.valid) {
                this.data.streamUrl = result.url;
                changed = true;
            }
        }

        for (const [guildId, channelId] of Object.entries(this.legacyVoiceTargets)) {
            if (!this.data.guilds[guildId] && typeof channelId === 'string' && channelId) {
                this.data.guilds[guildId] = { voiceChannelId: channelId };
                changed = true;
            }
        }

        if (changed) await this.persist();
    }

    normalize(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('settings.json has an invalid structure.');
        }

        const guilds = {};
        if (value.guilds && typeof value.guilds === 'object' && !Array.isArray(value.guilds)) {
            for (const [guildId, guildSettings] of Object.entries(value.guilds)) {
                if (!guildSettings || typeof guildSettings !== 'object') continue;
                guilds[guildId] = {
                    voiceChannelId: typeof guildSettings.voiceChannelId === 'string'
                        ? guildSettings.voiceChannelId
                        : ''
                };
            }
        }

        let streamUrl = '';
        if (typeof value.streamUrl === 'string' && value.streamUrl) {
            const result = validateStreamUrl(value.streamUrl);
            if (result.valid) streamUrl = result.url;
        }

        return {
            version: 1,
            streamUrl,
            guilds
        };
    }

    async persist() {
        await this.store.write(this.filePath, this.data);
    }

    getStreamUrl() {
        return this.data.streamUrl;
    }

    async setStreamUrl(url) {
        const result = validateStreamUrl(url);
        if (!result.valid) {
            throw new Error(result.reason);
        }

        const previous = this.data.streamUrl;
        this.data.streamUrl = result.url;

        try {
            await this.persist();
        } catch (error) {
            this.data.streamUrl = previous;
            throw error;
        }

        return this.data.streamUrl;
    }

    getGuild(guildId) {
        return this.data.guilds[guildId] || null;
    }

    getConfiguredGuildIds() {
        return Object.entries(this.data.guilds)
            .filter(([, config]) => Boolean(config.voiceChannelId))
            .map(([guildId]) => guildId);
    }

    async setVoiceChannel(guildId, channelId) {
        const previous = this.data.guilds[guildId];
        this.data.guilds[guildId] = {
            ...(previous || {}),
            voiceChannelId: channelId
        };

        try {
            await this.persist();
        } catch (error) {
            if (previous) this.data.guilds[guildId] = previous;
            else delete this.data.guilds[guildId];
            throw error;
        }
    }
}

module.exports = { SettingsService };
