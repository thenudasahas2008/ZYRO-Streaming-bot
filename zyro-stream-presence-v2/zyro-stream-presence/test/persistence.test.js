'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { JsonStore } = require('../src/storage');
const { TimerService } = require('../src/services/timer-service');
const { SettingsService } = require('../src/services/settings-service');

test('timer state survives a service restart', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zyro-timer-'));
    const filePath = path.join(directory, 'timer.json');

    try {
        const store = new JsonStore();
        const first = new TimerService({ store, filePath, initialHours: 5000 });
        await first.initialize();
        await first.reset(6123);
        const savedStartedAt = first.startedAt;

        const second = new TimerService({ store, filePath, initialHours: 5000 });
        await second.initialize();

        assert.equal(second.startedAt, savedStartedAt);
        assert.ok(second.getElapsed().hours >= 6123);
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('settings save the selected voice channel and streaming URL', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zyro-settings-'));
    const filePath = path.join(directory, 'settings.json');

    try {
        const store = new JsonStore();
        const settings = new SettingsService({ store, filePath });
        await settings.initialize();
        await settings.setVoiceChannel('guild-1', 'voice-1');
        await settings.setStreamUrl('https://www.twitch.tv/sample');

        const reloaded = new SettingsService({ store, filePath });
        await reloaded.initialize();

        assert.equal(reloaded.getGuild('guild-1').voiceChannelId, 'voice-1');
        assert.equal(reloaded.getStreamUrl(), 'https://www.twitch.tv/sample');
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
});
