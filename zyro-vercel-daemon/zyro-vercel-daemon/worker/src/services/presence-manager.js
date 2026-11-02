'use strict';

const { ActivityType } = require('discord.js');

class PresenceManager {
    constructor({ client, timerService, settingsService, intervalMs, logger }) {
        this.client = client;
        this.timerService = timerService;
        this.settingsService = settingsService;
        this.intervalMs = intervalMs;
        this.logger = logger;
        this.interval = null;
        this.lastSignature = '';
    }

    update() {
        if (!this.client.user) return;

        const elapsed = this.timerService.getElapsed();
        const streamUrl = this.settingsService.getStreamUrl();
        const activityName = `${elapsed.formatted} elapsed`;
        const signature = `${activityName}|${streamUrl}`;

        // Avoid unnecessary Gateway presence updates.
        if (signature === this.lastSignature) return;

        const activities = streamUrl
            ? [{
                name: activityName,
                type: ActivityType.Streaming,
                url: streamUrl
            }]
            : [];

        try {
            this.client.user.setPresence({
                status: 'online',
                activities
            });
            this.lastSignature = signature;
            this.logger.info(
                streamUrl
                    ? `Streaming presence: ${activityName}`
                    : `Presence online; no stream URL configured (${activityName})`
            );
        } catch (error) {
            this.logger.error('Presence update failed:', error);
        }
    }

    start() {
        this.stop();
        this.update();
        this.interval = setInterval(() => this.update(), this.intervalMs);
        this.interval.unref?.();
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
    }
}

module.exports = { PresenceManager };
