import child_process from 'child_process';
import { resolveBinaryPath } from './resolveBinary.js';

/**
 * Requests
 * @typedef {import('pagefindInternal').InternalServiceRequest} InternalServiceRequest
 * @typedef {import('pagefindInternal').InternalRequestPayload} InternalRequestPayload
 * 
 * Responses
 * @typedef {import('pagefindInternal').InternalServiceResponse} InternalServiceResponse
 * @typedef {import('pagefindInternal').InternalResponseError} InternalResponseError
 * @typedef {import('pagefindInternal').InternalResponsePayload} InternalResponsePayload
 * 
 * @typedef {import('pagefindInternal').InternalResponseCallback} InternalResponseCallback
 */

export class PagefindService {
    constructor() {
        /**
         * @type {child_process.ChildProcessByStdio<import('stream').Writable, import('stream').Readable, null> | null}
         */
        this.backend = child_process.spawn(resolveBinaryPath("pagefind"), [`--service`], {
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'inherit'],
            cwd: process.cwd(),
        });

        this.incomingMessageBuffer = "";
        /**
         * @type {Record<number, function(InternalResponseCallback): void>}
         */
        this.callbacks = {};
        this.messageId = 0;

        (this.backend.stdout).on('data', (data) => this.handleIncomingChunk(data));
        (this.backend.stdin).on('error', (err) => this.close(err));
        this.backend.on('error', (err) => this.close(err));

        this.refCount = 0
        this.backend.unref?.();


        /** @type {{ unref?(): void }} */
        (this.backend.stdout)?.unref?.();
        /** @type {{ unref?(): void }} */
        (this.backend.stdin)?.unref?.();
    }

    /**
     * @param {Error} err 
     */
    close(err) {
        if (err) {
            console.error("Service stopped", err);
        }
        this.backend = null;
    }

    ref() {
        if (++this.refCount === 1) this.backend?.ref?.();
    }

    unref() {
        if (--this.refCount === 0) this.backend?.unref?.();
    }

    /**
     * @param {Buffer} buf 
     */
    handleIncomingChunk(buf) {
        let chunk = buf.toString();
        try {
            while (chunk.length) {
                let delim = chunk.indexOf(',');
                if (!delim) {
                    this.incomingMessageBuffer = this.incomingMessageBuffer + chunk;
                    return;
                }

                let chunkMessage = chunk.slice(0, delim);
                this.handleIncomingMessage(this.incomingMessageBuffer + chunkMessage);
                this.incomingMessageBuffer = "";

                chunk = chunk.slice(delim + 1);
            }
        } catch (e) {
            /* TODO: Comms error handling */
            console.error(e);
            this.incomingMessageBuffer = "";
        }
    }

    /**
     * @param {string} message 
     */
    handleIncomingMessage(message) {
        let parsed_message = PagefindService.parseMessage(message);
        if (this.callbacks[parsed_message.message_id]) {
            const isError = parsed_message.payload.type === "Error";
            this.returnValue(
                parsed_message.message_id,
                {
                    exception: null,
                    err: isError ? /** @type {InternalResponseError} */ (parsed_message.payload) : null,
                    result: !isError ? /** @type {InternalResponsePayload} */ (parsed_message.payload) : null,
                });
        }
    }

    /**
     * @param {InternalRequestPayload} message 
     * @param {function(InternalResponseCallback): void} callback 
     * @returns {InternalServiceRequest}
     */
    wrapOutgoingMessage(message, callback) {
        let output_message = {
            message_id: ++this.messageId,
            payload: message
        };
        if (callback) this.callbacks[output_message.message_id] = callback;
        return output_message;
    }

    /**
     * @param {InternalRequestPayload} message 
     * @param {function(InternalResponseCallback): void} callback 
     */
    sendMessage(message, callback) {
        if (this.backend === null) {
            console.error(`Cannot send message, backend is closed: `, message);
            return;
        }
        let wrapped_message = this.wrapOutgoingMessage(message, callback);
        this.ref();
        let encoded = PagefindService.encodeMessage(wrapped_message);
        this.backend.stdin.write(encoded, (err) => {
            if (err) {
                this.close(err);
            }
        });
    }

    /**
     * @param {number} message_id 
     * @param {InternalResponseCallback} response_callback
     */
    returnValue(message_id, response_callback) {
        try {
            this.callbacks[message_id](response_callback);
        } finally {
            delete this.callbacks[message_id];
            this.unref();
        }
    }

    /**
     * @param {InternalServiceRequest} message 
     * @returns {string}
     */
    static encodeMessage(message) {
        return Buffer.from(JSON.stringify(message)).toString('base64') + ",";
    }

    /**
     * 
     * @param {string} message 
     * @returns {InternalServiceResponse}
     */
    static parseMessage(message) {
        const data = Buffer.from(message, 'base64');
        return JSON.parse(data.toString());
    }
}
