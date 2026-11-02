'use strict';

const ALLOWED_HOSTS = new Set([
    'twitch.tv',
    'www.twitch.tv',
    'm.twitch.tv',
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
    'www.youtube-nocookie.com'
]);

function validateStreamUrl(input) {
    if (typeof input !== 'string' || input.trim().length === 0) {
        return { valid: false, reason: 'URL එකක් ලබා දෙන්න.' };
    }

    let parsed;
    try {
        parsed = new URL(input.trim());
    } catch {
        return { valid: false, reason: 'URL එකේ ආකෘතිය වැරදියි.' };
    }

    if (parsed.protocol !== 'https:') {
        return { valid: false, reason: 'HTTPS link එකක් පමණක් භාවිතා කරන්න.' };
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
        return {
            valid: false,
            reason: 'Twitch හෝ YouTube link එකක් පමණක් භාවිතා කරන්න.'
        };
    }

    if (parsed.username || parsed.password) {
        return { valid: false, reason: 'Login details ඇතුළත් URL භාවිතා කරන්න එපා.' };
    }

    return {
        valid: true,
        url: parsed.toString()
    };
}

module.exports = { validateStreamUrl };
