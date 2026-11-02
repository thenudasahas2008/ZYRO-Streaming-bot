'use strict';

require('dotenv').config();

const path = require('node:path');

function readInteger(name, fallback, minimum) {
    const raw = process.env[name];
    const value = raw === undefined || raw === '' ? fallback : Number(raw);

    if (!Number.isSafeInteger(value) || value < minimum) {
        throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
    }

    return value;
}

function readOptionalJsonObject(name, fallback = {}) {
    const raw = process.env[name];
    if (!raw) return fallback;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`${name} must contain valid JSON: ${error.message}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${name} must be a JSON object.`);
    }

    return parsed;
}

const dataDir = path.resolve(process.env.DATA_DIR || './data');
const baseElapsedHours = readInteger('BASE_ELAPSED_HOURS', 5000, 5000);
const presenceIntervalMs = readInteger(
    'PRESENCE_UPDATE_INTERVAL_MS',
    60_000,
    60_000
);
const reconnectDelayMs = readInteger(
    'VOICE_RECONNECT_DELAY_MS',
    5_000,
    1_000
);
const reconnectMaxDelayMs = readInteger(
    'VOICE_RECONNECT_MAX_DELAY_MS',
    60_000,
    reconnectDelayMs
);

module.exports = Object.freeze({
    token: process.env.BOT_TOKEN,
    defaultStreamUrl: process.env.DEFAULT_STREAM_URL || '',
    baseElapsedHours,
    dataDir,
    timerFile: path.join(dataDir, 'timer-state.json'),
    settingsFile: path.join(dataDir, 'settings.json'),
    presenceIntervalMs,
    reconnectDelayMs,
    reconnectMaxDelayMs,
    devGuildId: process.env.DEV_GUILD_ID || '',
    legacyVoiceTargets: readOptionalJsonObject('VOICE_CHANNELS_JSON', {})
});
