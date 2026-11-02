'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class JsonStore {
    constructor() {
        this.writeQueues = new Map();
    }

    async read(filePath, fallbackValue) {
        try {
            const raw = await fs.readFile(filePath, 'utf8');
            return JSON.parse(raw);
        } catch (error) {
            if (error.code === 'ENOENT') return structuredClone(fallbackValue);
            throw new Error(`Could not read ${path.basename(filePath)}: ${error.message}`, {
                cause: error
            });
        }
    }

    async write(filePath, value) {
        // Capture the snapshot immediately, then serialize writes per file so
        // overlapping slash commands cannot leave an older snapshot last.
        const serialized = `${JSON.stringify(value, null, 2)}\n`;
        const previous = this.writeQueues.get(filePath) || Promise.resolve();

        const current = previous
            .catch(() => {})
            .then(() => this.writeAtomic(filePath, serialized));

        this.writeQueues.set(filePath, current);

        try {
            await current;
        } finally {
            if (this.writeQueues.get(filePath) === current) {
                this.writeQueues.delete(filePath);
            }
        }
    }

    async writeAtomic(filePath, serialized) {
        const directory = path.dirname(filePath);
        await fs.mkdir(directory, { recursive: true });

        const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

        try {
            await fs.writeFile(temporaryPath, serialized, {
                encoding: 'utf8',
                mode: 0o600,
                flag: 'wx'
            });
            await fs.rename(temporaryPath, filePath);
        } catch (error) {
            await fs.rm(temporaryPath, { force: true }).catch(() => {});
            throw new Error(`Could not save ${path.basename(filePath)}: ${error.message}`, {
                cause: error
            });
        }
    }
}

module.exports = { JsonStore };
