'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStreamUrl } = require('../src/lib/stream-url');

test('accepts HTTPS Twitch URL', () => {
    assert.equal(validateStreamUrl('https://www.twitch.tv/example').valid, true);
});

test('accepts HTTPS YouTube URL', () => {
    assert.equal(validateStreamUrl('https://www.youtube.com/@example/live').valid, true);
});

test('rejects HTTP links', () => {
    assert.equal(validateStreamUrl('http://www.twitch.tv/example').valid, false);
});

test('rejects unrelated domains', () => {
    assert.equal(validateStreamUrl('https://example.com/stream').valid, false);
});

test('rejects URLs containing credentials', () => {
    assert.equal(validateStreamUrl('https://user:pass@www.twitch.tv/example').valid, false);
});
