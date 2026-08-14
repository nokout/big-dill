// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Spawns pytest and collects discovery, execution, and lint payloads over the
// named-pipe IPC channel.
//
// Nothing here knows about an editor. Everything a host would otherwise read
// from editor state — the working directory, the interpreter, extra arguments,
// where the Python bridge lives, where log output goes, and how cancellation is
// signalled — arrives as plain options.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createIpcServer } from '../ipc/server';
import type {
    DiscoveredTestPayload,
    ExecutionTestPayload,
    LintDiagnosticEntry,
    LintDiagnosticPayload,
    StepDefinition,
    StepDefinitionPayload,
} from '../protocol/types';

export interface PytestOptions {
    /**
     * Working directory for the pytest process, already resolved. Hosts that
     * layer their own settings over this (an editor reading `cwd` from
     * configuration, say) resolve them before calling.
     */
    cwd: string;
    /** Interpreter used to run pytest. */
    interpreterPath: string;
    /** Directory holding run_pytest.py and the vscode_pytest package. */
    pythonFilesDir: string;
    /** Extra arguments appended to every pytest invocation. */
    pytestArgs?: string[];
    /** Receives subprocess stderr as it arrives. */
    log?: (text: string) => void;
    /** Aborts the run. Hosts with their own cancellation bridge to this. */
    signal?: AbortSignal;
}

export type DiscoveryResult = {
    discovery: DiscoveredTestPayload;
    stepDefinitions: StepDefinition[];
};

function buildPythonPath(extraDir: string): string {
    const existing = process.env.PYTHONPATH ?? '';
    return existing ? `${extraDir}${path.delimiter}${existing}` : extraDir;
}

/**
 * Wire an AbortSignal to a running subprocess.
 *
 * Handles the already-aborted case too: a signal that fired before the process
 * started would otherwise never deliver an 'abort' event, leaving the run
 * unkillable.
 */
function onAbort(signal: AbortSignal | undefined, handler: () => void): void {
    if (!signal) return;
    if (signal.aborted) {
        handler();
        return;
    }
    signal.addEventListener('abort', handler, { once: true });
}

export async function discoverTests(opts: PytestOptions): Promise<DiscoveryResult> {
    const { cwd, interpreterPath, pythonFilesDir, pytestArgs = [], log, signal } = opts;
    const ipc = await createIpcServer();

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TEST_RUN_PIPE: ipc.pipeName,
        PYTHONPATH: buildPythonPath(pythonFilesDir),
    };

    const args = [
        '-m', 'pytest',
        '--collect-only',
        '-q',
        '--rootdir', cwd,
        '--import-mode=importlib',
        '-p', 'vscode_pytest',
        ...pytestArgs,
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

        const proc = cp.spawn(interpreterPath, args, { cwd, env });

        const stderr: string[] = [];
        proc.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr.push(text);
            log?.(text);
        });

        onAbort(signal, () => {
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
    opts: PytestOptions & { testIds: string[] },
): Promise<ExecutionTestPayload[]> {
    const { cwd, interpreterPath, pythonFilesDir, pytestArgs = [], log, signal, testIds } = opts;
    const ipc = await createIpcServer();

    // mkdtempSync atomically creates a directory with a random suffix and 0700
    // permissions, so the path cannot be predicted or pre-created by another user
    // on a shared machine — unlike a name derived from a timestamp, where a
    // symlink planted at the predicted path turns this into an arbitrary write.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'big-dill-'));
    const testIdsFile = path.join(tmpDir, 'test-ids.txt');
    fs.writeFileSync(testIdsFile, testIds.join('\n'), 'utf-8');

    // Remove the whole directory, from every exit path including cancellation.
    const cleanup = (): void => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    };

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TEST_RUN_PIPE: ipc.pipeName,
        RUN_TEST_IDS_PIPE: testIdsFile,
        PYTHONPATH: buildPythonPath(pythonFilesDir),
    };

    const args = [path.join(pythonFilesDir, 'run_pytest.py'), ...pytestArgs];
    const payloads: ExecutionTestPayload[] = [];

    return new Promise<ExecutionTestPayload[]>((resolve, reject) => {
        ipc.onMessage((data) => {
            // Coverage payloads carry a 'coverage' key; they are not results.
            if (!('coverage' in data)) {
                payloads.push(data as unknown as ExecutionTestPayload);
            }
        });

        const proc = cp.spawn(interpreterPath, args, { cwd, env });

        proc.stderr.on('data', (chunk) => log?.(chunk.toString()));

        onAbort(signal, () => {
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

export async function runBddLint(
    opts: PytestOptions & { featureFilePath: string },
): Promise<LintDiagnosticEntry[]> {
    const { cwd, interpreterPath, pythonFilesDir, pytestArgs = [], log, signal, featureFilePath } = opts;
    const ipc = await createIpcServer();

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TEST_RUN_PIPE: ipc.pipeName,
        PYTHONPATH: buildPythonPath(pythonFilesDir),
    };

    const args = [
        '-m', 'pytest',
        '--bdd-lint', featureFilePath,
        '--rootdir', cwd,
        '--import-mode=importlib',
        '-p', 'vscode_pytest',
        ...pytestArgs,
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

        const proc = cp.spawn(interpreterPath, args, { cwd, env });

        proc.stderr.on('data', (chunk) => log?.(chunk.toString()));

        onAbort(signal, () => {
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
