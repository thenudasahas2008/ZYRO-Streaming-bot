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
        this.getOidcToken = null;

        if (this.isVercelDaemon) {
            const hasBlobStore = Boolean(process.env.BLOB_STORE_ID);
            const hasOidcTokenFile = Boolean(
                process.env.VERCEL_OIDC_TOKEN_FILE
            );
            const hasReadWriteToken = Boolean(
                process.env.BLOB_READ_WRITE_TOKEN
            );

            if (
                !hasBlobStore ||
                (!hasOidcTokenFile && !hasReadWriteToken)
            ) {
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
            throw new Error(
                'Invalid persistent storage filename.'
            );
        }

        return `${BLOB_PREFIX}/${filename}`;
    }

    async read(filePath, fallbackValue) {
        if (this.isVercelDaemon) {
            const pathname = this.getBlobPath(filePath);

            const result = await this.blob.get(
                pathname,
                await this.blobOptions({
                    useCache: false
                })
            );

            if (
                !result ||
                result.statusCode !== 200 ||
                !result.stream
            ) {
                return structuredClone(fallbackValue);
            }

            try {
                const raw = await new Response(
                    result.stream
                ).text();

                return JSON.parse(raw);

            } catch (error) {
                throw new Error(
                    `Could not read ${path.basename(filePath)} from Vercel Blob: ${error.message}`,
                    { cause: error }
                );
            }
        }

        try {
            const raw = await fs.readFile(
                filePath,
                'utf8'
            );

            return JSON.parse(raw);

        } catch (error) {
            if (error.code === 'ENOENT') {
                return structuredClone(fallbackValue);
            }

            throw new Error(
                `Could not read ${path.basename(filePath)}: ${error.message}`,
                { cause: error }
            );
        }
    }

    async write(filePath, value) {
        // Capture snapshot immediately.
        const serialized =
            `${JSON.stringify(value, null, 2)}\n`;

        // Serialize concurrent writes per file.
        const previous =
            this.writeQueues.get(filePath) ||
            Promise.resolve();

        const current = previous
            .catch(() => {})
            .then(() =>
                this.isVercelDaemon
                    ? this.writeBlob(filePath, serialized)
                    : this.writeAtomic(filePath, serialized)
            );

        this.writeQueues.set(filePath, current);

        try {
            await current;

        } finally {
            if (
                this.writeQueues.get(filePath) === current
            ) {
                this.writeQueues.delete(filePath);
            }
        }
    }

    async blobOptions(extra = {}) {
        const options = {
            access: 'private',
            storeId: process.env.BLOB_STORE_ID,
            ...extra
        };

        /*
         * IMPORTANT FIX:
         *
         * getVercelOidcToken() returns Promise<string>.
         *
         * Resolve the Promise before passing
         * oidcToken to @vercel/blob.
         *
         * This prevents:
         * TypeError: _a3.trim is not a function
         */

        if (this.getOidcToken) {
            const oidcToken =
                await this.getOidcToken();

            if (
                typeof oidcToken !== 'string' ||
                oidcToken.trim().length === 0
            ) {
                throw new Error(
                    'Vercel OIDC token provider did not return a non-empty string.'
                );
            }

            options.oidcToken = oidcToken;
        }

        return options;
    }

    async writeBlob(filePath, serialized) {
        await this.blob.put(
            this.getBlobPath(filePath),
            serialized,
            await this.blobOptions({
                addRandomSuffix: false,
                allowOverwrite: true,
                contentType: 'application/json; charset=utf-8'
            })
        );
    }

    async writeAtomic(filePath, serialized) {
        const directory = path.dirname(filePath);

        await fs.mkdir(directory, {
            recursive: true
        });

        const temporaryPath =
            `${filePath}.${process.pid}.${randomUUID()}.tmp`;

        try {
            await fs.writeFile(
                temporaryPath,
                serialized,
                {
                    encoding: 'utf8',
                    mode: 0o600,
                    flag: 'wx'
                }
            );

            await fs.rename(
                temporaryPath,
                filePath
            );

        } catch (error) {
            await fs.rm(
                temporaryPath,
                { force: true }
            ).catch(() => {});

            throw new Error(
                `Could not save ${path.basename(filePath)}: ${error.message}`,
                { cause: error }
            );
        }
    }
}

module.exports = {
    JsonStore
};
