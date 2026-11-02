'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const BLOB_PREFIX = 'zyro-streaming-bot';

class JsonStore {
    constructor() {
        this.writeQueues = new Map();
        this.isVercelDaemon = Boolean(process.env.VERCEL_REGION);
        this.blob = null;

        if (this.isVercelDaemon) {
            const hasBlobStore = Boolean(process.env.BLOB_STORE_ID);
            const hasOidcTokenFile = Boolean(process.env.VERCEL_OIDC_TOKEN_FILE);
            const hasReadWriteToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

            if (!hasBlobStore || (!hasOidcTokenFile && !hasReadWriteToken)) {
                throw new Error(
                    'Vercel Daemon එකට private Blob storage connect කරලා නැහැ. ' +
                    'Vercel Dashboard → Storage → Blob Store → Connect to Project කරන්න.'
                );
            }

            this.blob = require('@vercel/blob');
            this.getOidcToken = hasOidcTokenFile
                ? require('@vercel/oidc').getVercelOidcToken
                : null;
        }
    }

    getBlobPath(filePath) {
        const filename = path.basename(filePath);
        if (!/^[a-z0-9._-]+$/i.test(filename)) {
            throw new Error('Invalid persistent storage filename.');
        }
        return `${BLOB_PREFIX}/${filename}`;
    }

    async read(filePath, fallbackValue) {
        if (this.isVercelDaemon) {
            const pathname = this.getBlobPath(filePath);
            const result = await this.blob.get(pathname, this.blobOptions({
                useCache: false
            }));

            if (!result || result.statusCode !== 200 || !result.stream) {
                return structuredClone(fallbackValue);
            }

            try {
                const raw = await new Response(result.stream).text();
                return JSON.parse(raw);
            } catch (error) {
                throw new Error(`Could not read ${path.basename(filePath)} from Vercel Blob: ${error.message}`, {
                    cause: error
                });
            }
        }

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
        // Capture the snapshot immediately, then serialize writes per path.
        const serialized = `${JSON.stringify(value, null, 2)}\n`;
        const previous = this.writeQueues.get(filePath) || Promise.resolve();

        const current = previous
            .catch(() => {})
            .then(() => this.isVercelDaemon
                ? this.writeBlob(filePath, serialized)
                : this.writeAtomic(filePath, serialized));

        this.writeQueues.set(filePath, current);

        try {
            await current;
        } finally {
            if (this.writeQueues.get(filePath) === current) {
                this.writeQueues.delete(filePath);
            }
        }
    }

    blobOptions(extra = {}) {
        const options = {
            access: 'private',
            storeId: process.env.BLOB_STORE_ID,
            ...extra
        };

        // Vercel Daemons expose a rotating token file. Read it on every Blob
        // operation so token rotation is picked up without restarting the bot.
        if (this.getOidcToken) {
            options.oidcToken = this.getOidcToken();
        }

        return options;
    }

    async writeBlob(filePath, serialized) {
        await this.blob.put(this.getBlobPath(filePath), serialized, this.blobOptions({
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: 'application/json; charset=utf-8'
        }));
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
