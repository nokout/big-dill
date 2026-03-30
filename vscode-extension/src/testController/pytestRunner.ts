// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// BDD-ORAMA: Spawns pytest subprocesses for discovery and execution, communicating
// via the named-pipe IPC server.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CancellationToken, Uri, workspace } from 'vscode';
import { createIpcServer } from './ipc';
import { DiscoveredTestPayload, ExecutionTestPayload } from './types';
import { outputChannel } from '../extension';

const PYTHON_FILES_DIR = path.join(__dirname, '..', '..', 'python_files');

function getPythonPath(interpreterPath: string): string {
    return interpreterPath;
}

/**
 * Resolve the working directory for pytest subprocesses.
 *
 * Priority (highest to lowest):
 *   1. pytest-bdd-orama.cwd  — explicit override for this extension
 *   2. python.testing.cwd    — shared ms-python setting
 *   3. workspaceUri.fsPath   — workspace root (default)
 */
function resolveCwd(workspaceUri: Uri): string {
    const ours = workspace.getConfiguration('pytest-bdd-orama').get<string>('cwd', '').trim();
    if (ours) {
        return path.isAbsolute(ours) ? ours : path.join(workspaceUri.fsPath, ours);
    }
    const shared = workspace.getConfiguration('python.testing').get<string>('cwd', '').trim();
    if (shared) {
        return path.isAbsolute(shared) ? shared : path.join(workspaceUri.fsPath, shared);
    }
    return workspaceUri.fsPath;
}

export async function discoverTests(
    workspaceUri: Uri,
    interpreterPath: string,
    token?: CancellationToken,
): Promise<DiscoveredTestPayload> {
    const ipc = await createIpcServer();
    const cwd = resolveCwd(workspaceUri);
    const extraArgs = workspace.getConfiguration('pytest-bdd-orama').get<string[]>('pytestArgs', []);

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TEST_RUN_PIPE: ipc.pipeName,
        PYTHONPATH: buildPythonPath(PYTHON_FILES_DIR),
    };

    const args = [
        '-m', 'pytest',
        '--collect-only',
        '-q',
        '--rootdir', cwd,
        `--import-mode=importlib`,
        `-p`, `vscode_pytest`,
        ...extraArgs,
    ];

    return new Promise<DiscoveredTestPayload>((resolve, reject) => {
        let resolved = false;

        ipc.onMessage((data) => {
            if (!resolved) {
                resolved = true;
                ipc.dispose();
                resolve(data as unknown as DiscoveredTestPayload);
            }
        });

        const proc = cp.spawn(getPythonPath(interpreterPath), args, {
            cwd,
            env,
        });

        const stderr: string[] = [];
        proc.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr.push(text);
            outputChannel.append(text);
        });

        token?.onCancellationRequested(() => {
            proc.kill();
            ipc.dispose();
            reject(new Error('Discovery cancelled'));
        });

        proc.on('close', (code) => {
            if (!resolved) {
                ipc.dispose();
                if (code !== 0 && code !== 1 && code !== 5) {
                    reject(new Error(`pytest exited with code ${code}:\n${stderr.join('')}`));
                } else {
                    // Timed out waiting for the IPC message — treat as empty
                    resolve({ cwd, status: 'error', error: stderr });
                }
            }
        });
    });
}

export async function runTests(
    workspaceUri: Uri,
    interpreterPath: string,
    testIds: string[],
    token?: CancellationToken,
): Promise<ExecutionTestPayload[]> {
    const ipc = await createIpcServer();
    const cwd = resolveCwd(workspaceUri);
    const extraArgs = workspace.getConfiguration('pytest-bdd-orama').get<string[]>('pytestArgs', []);

    // Write test ids to a temp file (same approach as ms-python)
    const testIdsFile = path.join(os.tmpdir(), `pytest-bdd-ids-${Date.now()}.txt`);
    fs.writeFileSync(testIdsFile, testIds.join('\n'), 'utf-8');

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TEST_RUN_PIPE: ipc.pipeName,
        RUN_TEST_IDS_PIPE: testIdsFile,
        PYTHONPATH: buildPythonPath(PYTHON_FILES_DIR),
    };

    const runScriptPath = path.join(PYTHON_FILES_DIR, 'run_pytest.py');
    const args = [runScriptPath, ...extraArgs];

    const payloads: ExecutionTestPayload[] = [];

    return new Promise<ExecutionTestPayload[]>((resolve, reject) => {
        ipc.onMessage((data) => {
            // Coverage payloads have a 'coverage' key; skip them
            if (!('coverage' in data)) {
                payloads.push(data as unknown as ExecutionTestPayload);
            }
        });

        const proc = cp.spawn(getPythonPath(interpreterPath), args, {
            cwd,
            env,
        });

        const stderr: string[] = [];
        proc.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr.push(text);
            outputChannel.append(text);
        });

        token?.onCancellationRequested(() => {
            proc.kill();
            ipc.dispose();
            reject(new Error('Test run cancelled'));
        });

        proc.on('close', () => {
            ipc.dispose();
            try { fs.unlinkSync(testIdsFile); } catch { /* ignore */ }
            resolve(payloads);
        });

        proc.on('error', (err) => {
            ipc.dispose();
            try { fs.unlinkSync(testIdsFile); } catch { /* ignore */ }
            reject(err);
        });
    });
}

function buildPythonPath(extraDir: string): string {
    const existing = process.env.PYTHONPATH ?? '';
    return existing ? `${extraDir}${path.delimiter}${existing}` : extraDir;
}
