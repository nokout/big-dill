// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// BDD-ORAMA: Named-pipe IPC server — receives JSON-RPC messages from vscode_pytest.
// Protocol mirrors ms-python: content-length framing over a named pipe.

import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

export type IpcMessageHandler = (data: Record<string, unknown>) => void;

export interface IIpcServer {
    readonly pipeName: string;
    onMessage(handler: IpcMessageHandler): void;
    dispose(): void;
}

/**
 * Start a named-pipe server.  Returns a promise that resolves once the server
 * is listening.  The caller should pass `server.pipeName` to the subprocess as
 * the `TEST_RUN_PIPE` env var.
 */
export async function createIpcServer(): Promise<IIpcServer> {
    const pipeName = os.platform() === 'win32'
        ? `\\\\.\\pipe\\pytest-bdd-${crypto.randomUUID()}`
        : path.join(os.tmpdir(), `pytest-bdd-${crypto.randomUUID()}.sock`);

    const handlers: IpcMessageHandler[] = [];
    const server = net.createServer((socket) => {
        let buffer = '';
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf-8');
            // Parse all complete content-length framed messages from buffer
            while (true) {
                const headerEnd = buffer.indexOf('\r\n\r\n');
                if (headerEnd === -1) break;

                const header = buffer.substring(0, headerEnd);
                const lengthMatch = header.match(/content-length:\s*(\d+)/i);
                if (!lengthMatch) {
                    // Malformed frame — discard up to the double-CRLF
                    buffer = buffer.substring(headerEnd + 4);
                    break;
                }

                const contentLength = parseInt(lengthMatch[1], 10);
                const bodyStart = headerEnd + 4;
                if (buffer.length < bodyStart + contentLength) {
                    break; // need more data
                }

                const body = buffer.substring(bodyStart, bodyStart + contentLength);
                buffer = buffer.substring(bodyStart + contentLength);

                try {
                    const rpc = JSON.parse(body) as { params?: Record<string, unknown> };
                    const payload = rpc.params ?? rpc;
                    for (const handler of handlers) {
                        handler(payload);
                    }
                } catch {
                    // ignore malformed JSON
                }
            }
        });
        socket.on('error', () => { /* ignore socket errors */ });
    });

    await new Promise<void>((resolve, reject) => {
        server.listen(pipeName, resolve);
        server.once('error', reject);
    });

    return {
        pipeName,
        onMessage(handler: IpcMessageHandler) {
            handlers.push(handler);
        },
        dispose() {
            server.close();
        },
    };
}
