'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HOUR_MS, startedAtForHours, getElapsed } = require('../src/lib/time');

test('startedAtForHours creates the correct reference timestamp', () => {
    const now = 2_000_000_000;
    assert.equal(startedAtForHours(5000, now), now - (5000 * HOUR_MS));
});

test('getElapsed formats 5,000 hours and 7 minutes', () => {
    const now = 10_000_000;
    const startedAt = now - ((5000 * HOUR_MS) + (7 * 60_000) + 9_000);
    const elapsed = getElapsed(startedAt, now);

    assert.equal(elapsed.hours, 5000);
    assert.equal(elapsed.minutes, 7);
    assert.equal(elapsed.seconds, 9);
    assert.equal(elapsed.formatted, '5,000h 07m');
});

test('getElapsed never returns a negative duration', () => {
    const elapsed = getElapsed(2_000, 1_000);
    assert.equal(elapsed.totalMs, 0);
    assert.equal(elapsed.formatted, '0h 00m');
});

test('startedAtForHours rejects invalid values', () => {
    assert.throws(() => startedAtForHours(-1), TypeError);
    assert.throws(() => startedAtForHours(Number.NaN), TypeError);
});
