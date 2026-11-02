'use strict';

const { getElapsed, startedAtForHours } = require('../lib/time');

class TimerService {
    constructor({ store, filePath, initialHours = 5000 }) {
        this.store = store;
        this.filePath = filePath;
        this.initialHours = initialHours;
        this.startedAt = null;
        this.initialized = false;
    }

    async initialize() {
        const state = await this.store.read(this.filePath, null);

        if (
            state &&
            state.version === 1 &&
            Number.isFinite(state.startedAt) &&
            state.startedAt > 0 &&
            state.startedAt <= Date.now()
        ) {
            this.startedAt = state.startedAt;
        } else {
            this.startedAt = startedAtForHours(this.initialHours);
            await this.persist();
        }

        this.initialized = true;
    }

    getElapsed() {
        if (!this.initialized) {
            throw new Error('Timer has not been initialized.');
        }
        return getElapsed(this.startedAt);
    }

    async reset(hours = this.initialHours) {
        if (!Number.isFinite(hours) || hours < 5000 || hours > 10_000_000) {
            throw new RangeError('Timer hours must be between 5,000 and 10,000,000.');
        }

        const previous = this.startedAt;
        this.startedAt = startedAtForHours(hours);

        try {
            await this.persist();
        } catch (error) {
            this.startedAt = previous;
            throw error;
        }

        return this.getElapsed();
    }

    async persist() {
        if (!Number.isFinite(this.startedAt)) return;

        await this.store.write(this.filePath, {
            version: 1,
            startedAt: this.startedAt,
            savedAt: Date.now()
        });
    }
}

module.exports = { TimerService };
