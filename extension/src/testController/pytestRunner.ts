// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. The pytest process handling lives in @nokout/big-dill-core; this
// resolves editor configuration, points core at the bundled Python bridge,
// bridges CancellationToken to AbortSignal, and routes output to the channel.

import * as path from 'path';
import { CancellationToken, Uri, workspace } from 'vscode';
import {
    discoverTests as coreDiscoverTests,
    runTests as coreRunTests,
    runBddLint as coreRunBddLint,
    type DiscoveryResult,
    type PytestOptions,
} from '@nokout/big-dill-core';
import type { ExecutionTestPayload, LintDiagnosticEntry } from './types';
import { outputChannel } from '../extension';

export type { DiscoveryResult };

// The extension is bundled to a single dist/extension.js, so __dirname is always
// <extension>/dist. Core takes this as a parameter rather than computing it,
// because only the host knows its own layout.
const PYTHON_FILES_DIR = path.join(__dirname, '..', 'python_files');

/**
 * Resolve the working directory for pytest subprocesses.
 *
 * Priority (highest to lowest):
 *   1. big-dill.cwd        — explicit override for this extension
 *   2. python.testing.cwd  — shared ms-python setting
 *   3. workspaceUri.fsPath — workspace root (default)
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

/** Bridge the editor's cancellation model onto the platform one core expects. */
function toSignal(token?: CancellationToken): AbortSignal | undefined {
    if (!token) return undefined;
    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());
    return controller.signal;
}

/** Assemble the options core needs from editor state. */
function options(workspaceUri: Uri, interpreterPath: string, token?: CancellationToken): PytestOptions {
    return {
        cwd: resolveCwd(workspaceUri),
        interpreterPath,
        pythonFilesDir: PYTHON_FILES_DIR,
        pytestArgs: workspace.getConfiguration('big-dill').get<string[]>('pytestArgs', []),
        log: (text) => outputChannel.append(text),
        signal: toSignal(token),
    };
}

export async function discoverTests(
    workspaceUri: Uri,
    interpreterPath: string,
    token?: CancellationToken,
): Promise<DiscoveryResult> {
    return coreDiscoverTests(options(workspaceUri, interpreterPath, token));
}

export async function runTests(
    workspaceUri: Uri,
    interpreterPath: string,
    testIds: string[],
    token?: CancellationToken,
): Promise<ExecutionTestPayload[]> {
    return coreRunTests({ ...options(workspaceUri, interpreterPath, token), testIds });
}

export async function runBddLint(
    featureFilePath: string,
    workspaceUri: Uri,
    interpreterPath: string,
    token?: CancellationToken,
): Promise<LintDiagnosticEntry[]> {
    return coreRunBddLint({ ...options(workspaceUri, interpreterPath, token), featureFilePath });
}
