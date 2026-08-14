// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
// BIG-DILL: Spawns pytest subprocesses for discovery and execution, communicating
// via the named-pipe IPC server.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CancellationToken, Uri, workspace } from 'vscode';
import { createIpcServer } from '@nokout/big-dill-core';
import { DiscoveredTestPayload, ExecutionTestPayload, LintDiagnosticEntry, LintDiagnosticPayload, StepDefinition, StepDefinitionPayload } from './types';
import { outputChannel } from '../extension';

// The extension is bundled to a single dist/extension.js, so __dirname is always
// <extension>/dist regardless of which source file this line came from. Adding a
// directory level here would resolve outside the extension and break discovery at
// runtime with no compile error.
const PYTHON_FILES_DIR = path.join(__dirname, '..', 'python_files');

function getPythonPath(interpreterPath: string): string {
    return interpreterPath;
}

/**
 * Resolve the working directory for pytest subprocesses.
 *
 * Priority (highest to lowest):
 *   1. big-dill.cwd  — explicit override for this extension
 *   2. python.testing.cwd    — shared ms-python setting
 *   3. workspaceUri.fsPath   — workspace root (default)
 */
function resolveCwd(workspaceUri: Uri): string {
    const ours = (workspace.getConfiguration('big-dill').get<string | null>('cwd') ?? '').trim();
    if (ours) {
        return path.isAbsolute(ours) ? ours : path.join(workspaceUri.fsPath, ours);
    }
    const shared = (workspace.getConfiguration('python.testing').get<string | null>('cwd') ?? '').trim();
    if (shared) {
        return path.isAbsolute(shared) ? shared : path.join(workspaceUri.fsPath, shared);
    }
    return workspaceUri.fsPath;
}

export type DiscoveryResult = {
    discovery: DiscoveredTestPayload;
    stepDefinitions: StepDefinition[];
};

export async function discoverTests(
    workspaceUri: Uri,
    interpreterPath: string,
    token?: CancellationToken,
): Promise<DiscoveryResult> {
    const ipc = await createIpcServer();
    const cwd = resolveCwd(workspaceUri);
    const extraArgs = workspace.getConfiguration('big-dill').get<string[]>('pytestArgs', []);

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

    let discoveryPayload: DiscoveredTestPayload | null = null;
    const stepDefinitions: StepDefinition[] = [];

    return new Promise<DiscoveryResult>((resolve, reject) => {
        ipc.onMessage((data) => {
            const payload = data as Record<string, unknown>;
            if (payload['type'] === 'stepDefinitions') {
                const p = payload as unknown as StepDefinitionPayload;
                stepDefinitions.push(...p.stepDefinitions);
            } else if ('cwd' in payload) {
                discoveryPayload = payload as unknown as DiscoveredTestPayload;
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
            ipc.dispose();
            const discovery = discoveryPayload ?? {
                cwd,
                status: 'error' as const,
                error: code !== 0 ? stderr : [],
            };
            resolve({ discovery, stepDefinitions });
        });

        proc.on('error', (err) => {
            ipc.dispose();
            reject(err);
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
    const extraArgs = workspace.getConfiguration('big-dill').get<string[]>('pytestArgs', []);

    // mkdtempSync atomically creates a directory with a random suffix and 0700
    // permissions, so the path cannot be predicted or pre-created by another user
    // on a shared machine. The previous Date.now()-derived name in the shared temp
    // directory was guessable: a symlink planted at the predicted path would have
    // turned this write into an arbitrary-file write running as the user.
    // (CodeQL js/insecure-temporary-file.)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'big-dill-'));
    const testIdsFile = path.join(tmpDir, 'test-ids.txt');
    fs.writeFileSync(testIdsFile, testIds.join('\n'), 'utf-8');

    // Remove the whole directory, and from every exit path — cancellation
    // previously leaked the file.
    const cleanup = (): void => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    };

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
            cleanup();
            reject(new Error('Test run cancelled'));
        });

        proc.on('close', () => {
            ipc.dispose();
            cleanup();
            resolve(payloads);
        });

        proc.on('error', (err) => {
            ipc.dispose();
            cleanup();
            reject(err);
        });
    });
}

function buildPythonPath(extraDir: string): string {
    const existing = process.env.PYTHONPATH ?? '';
    return existing ? `${extraDir}${path.delimiter}${existing}` : extraDir;
}

export async function runBddLint(
    featureFilePath: string,
    workspaceUri: Uri,
    interpreterPath: string,
    token?: CancellationToken,
): Promise<LintDiagnosticEntry[]> {
    const ipc = await createIpcServer();
    const cwd = resolveCwd(workspaceUri);
    const extraArgs = workspace.getConfiguration('big-dill').get<string[]>('pytestArgs', []);

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TEST_RUN_PIPE: ipc.pipeName,
        PYTHONPATH: buildPythonPath(PYTHON_FILES_DIR),
    };

    const args = [
        '-m', 'pytest',
        '--bdd-lint', featureFilePath,
        '--rootdir', cwd,
        '--import-mode=importlib',
        '-p', 'vscode_pytest',
        ...extraArgs,
    ];

    const entries: LintDiagnosticEntry[] = [];

    return new Promise<LintDiagnosticEntry[]>((resolve, reject) => {
        ipc.onMessage((data) => {
            const payload = data as Record<string, unknown>;
            if (payload['type'] === 'lintDiagnostics') {
                const p = payload as unknown as LintDiagnosticPayload;
                entries.push(...p.diagnostics);
            }
        });

        const proc = cp.spawn(getPythonPath(interpreterPath), args, { cwd, env });

        proc.stderr.on('data', (chunk) => outputChannel.append(chunk.toString()));

        token?.onCancellationRequested(() => {
            proc.kill();
            ipc.dispose();
            reject(new Error('Lint cancelled'));
        });

        proc.on('close', () => {
            ipc.dispose();
            resolve(entries);
        });

        proc.on('error', (err) => {
            ipc.dispose();
            reject(err);
        });
    });
}
