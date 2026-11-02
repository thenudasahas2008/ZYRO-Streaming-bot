'use strict';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function startedAtForHours(hours, now = Date.now()) {
    if (!Number.isFinite(hours) || hours < 0) {
        throw new TypeError('hours must be a non-negative finite number.');
    }

    if (!Number.isFinite(now)) {
        throw new TypeError('now must be a finite timestamp.');
    }

    return now - hours * HOUR_MS;
}

function getElapsed(startedAt, now = Date.now()) {
    if (!Number.isFinite(startedAt) || !Number.isFinite(now)) {
        throw new TypeError('startedAt and now must be finite timestamps.');
    }

    const elapsedMs = Math.max(0, now - startedAt);
    const totalMinutes = Math.floor(elapsedMs / MINUTE_MS);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const seconds = Math.floor((elapsedMs % MINUTE_MS) / 1000);

    return Object.freeze({
        hours,
        minutes,
        seconds,
        totalMinutes,
        totalMs: elapsedMs,
        formatted: `${hours.toLocaleString('en-US')}h ${String(minutes).padStart(2, '0')}m`,
        detailed: `${hours.toLocaleString('en-US')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
    });
}

module.exports = {
    HOUR_MS,
    MINUTE_MS,
    startedAtForHours,
    getElapsed
};
