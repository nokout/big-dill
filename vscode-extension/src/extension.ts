// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// BDD-ORAMA: Extension entry point for the pytest-bdd test runner.

import * as vscode from 'vscode';
import { BddResultResolver } from './testController/resultResolver';
import { discoverTests, runTests } from './testController/pytestRunner';
import { StepCache } from './stepCache';
import { FeatureCompletionProvider } from './featureCompletion';
import { FeatureDiagnostics } from './featureDiagnostics';

let testController: vscode.TestController | undefined;
const resolvers = new Map<string, BddResultResolver>();
export let outputChannel: vscode.OutputChannel;
const stepCache = new StepCache();

async function loadDistributedStepMetadata(
    workspaceUri: vscode.Uri,
    interpreterPath: string,
    cache: StepCache,
): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cp = require('child_process') as typeof import('child_process');
    const script = [
        'import json, sys',
        'try:',
        '    from importlib.metadata import entry_points',
        '    eps = entry_points(group="pytest_bdd_orama.steps")',
        '    result = []',
        '    for ep in eps:',
        '        pkg, filename = ep.value.split(":", 1)',
        '        import importlib.resources, pathlib',
        '        path = pathlib.Path(str(importlib.resources.files(pkg))) / filename',
        '        data = json.loads(path.read_text())',
        '        result.append(data)',
        '    print(json.dumps(result))',
        'except Exception:',
        '    print(json.dumps([]))',
    ].join('\n');

    return new Promise((resolve) => {
        const proc = cp.spawn(interpreterPath, ['-c', script], {
            cwd: workspaceUri.fsPath,
        });
        let stdout = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.on('close', () => {
            try {
                type DistEntry = { version: number; step_types: Record<string, { suggested_values: string[]; has_validator: boolean }> };
                const entries: DistEntry[] = JSON.parse(stdout);
                const stepDefs = entries.flatMap((e) =>
                    Object.entries(e.step_types).map(([name, meta]) => ({
                        keyword: 'step' as const,
                        pattern: `{param:${name}}`,
                        parameters: [{
                            name: 'param',
                            type_name: name,
                            suggested_values: meta.suggested_values,
                            has_validator: meta.has_validator,
                        }],
                    }))
                );
                cache.updateDistributed(stepDefs);
            } catch { /* ignore */ }
            resolve();
        });
        proc.on('error', () => resolve());
    });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const enabled = vscode.workspace.getConfiguration('pytest-bdd-orama').get<boolean>('enabled', true);
    if (!enabled) {
        return;
    }

    outputChannel = vscode.window.createOutputChannel('pytest-bdd-orama');
    context.subscriptions.push(outputChannel);

    testController = vscode.tests.createTestController('pytest-bdd-orama', 'pytest-bdd');
    context.subscriptions.push(testController);

    // Run profile
    const runProfile = testController.createRunProfile(
        'Run',
        vscode.TestRunProfileKind.Run,
        (request, token) => runHandler(request, token),
        true,
    );
    context.subscriptions.push(runProfile);

    // Refresh handler
    testController.refreshHandler = async (token) => {
        await refreshAllWorkspaces(token);
    };

    // Load distributed step metadata from installed packages
    const firstFolder = vscode.workspace.workspaceFolders?.[0];
    if (firstFolder) {
        const interp = await getPythonInterpreter(firstFolder.uri);
        await loadDistributedStepMetadata(firstFolder.uri, interp, stepCache);
    }

    // Auto-discover on activation
    await refreshAllWorkspaces();

    // Re-discover when workspace settings change
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('pytest-bdd-orama')) {
                await refreshAllWorkspaces();
            }
        }),
    );

    // Re-discover when feature files are created, changed, or deleted
    const featureWatcher = vscode.workspace.createFileSystemWatcher('**/*.feature');
    featureWatcher.onDidCreate(() => refreshAllWorkspaces());
    featureWatcher.onDidChange(() => refreshAllWorkspaces());
    featureWatcher.onDidDelete(() => refreshAllWorkspaces());
    context.subscriptions.push(featureWatcher);

    // Re-discover when step definition files are created, changed, or deleted
    const stepDefGlob = vscode.workspace.getConfiguration('pytest-bdd-orama')
        .get<string>('stepDefinitionGlob', '{**/step_defs/**/*.py,**/steps/**/*.py}');
    const stepFileWatcher = vscode.workspace.createFileSystemWatcher(stepDefGlob);
    stepFileWatcher.onDidChange(() => refreshAllWorkspaces());
    stepFileWatcher.onDidCreate(() => refreshAllWorkspaces());
    stepFileWatcher.onDidDelete(() => refreshAllWorkspaces());
    context.subscriptions.push(stepFileWatcher);

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { pattern: '**/*.feature', scheme: 'file' },
        new FeatureCompletionProvider(stepCache),
        ' ',  // trigger on space after keyword
    );
    context.subscriptions.push(completionProvider);

    const featureDiagnostics = new FeatureDiagnostics(
        () => vscode.workspace.workspaceFolders?.[0]?.uri,
        (uri) => getPythonInterpreter(uri),
    );
    context.subscriptions.push(featureDiagnostics);

    vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.fileName.endsWith('.feature')) {
            featureDiagnostics.schedule(doc.uri);
        }
    }, null, context.subscriptions);
}

export function deactivate(): void {
    testController?.dispose();
}

async function getPythonInterpreter(workspaceUri: vscode.Uri): Promise<string> {
    // Use ms-python's public extension API to get the active Python interpreter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pythonExt = vscode.extensions.getExtension<any>('ms-python.python');
    if (pythonExt) {
        if (!pythonExt.isActive) {
            await pythonExt.activate();
        }
        try {
            const env = await pythonExt.exports.environments.getActiveEnvironmentPath(workspaceUri);
            if (env?.path) {
                return env.path;
            }
        } catch {
            // fall through
        }
    }
    return 'python'; // fallback to PATH
}

async function refreshAllWorkspaces(token?: vscode.CancellationToken): Promise<void> {
    if (!testController) return;

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        await refreshWorkspace(folder.uri, token);
    }
}

async function refreshWorkspace(workspaceUri: vscode.Uri, token?: vscode.CancellationToken): Promise<void> {
    if (!testController) return;

    const interpreterPath = await getPythonInterpreter(workspaceUri);
    let resolver = resolvers.get(workspaceUri.fsPath);
    if (!resolver) {
        resolver = new BddResultResolver();
        resolvers.set(workspaceUri.fsPath, resolver);
    }

    outputChannel.appendLine(`[discovery] interpreter: ${interpreterPath}`);
    try {
        const { discovery, stepDefinitions } = await discoverTests(workspaceUri, interpreterPath, token);
        outputChannel.appendLine(`[discovery] status=${discovery.status} stepDefs=${stepDefinitions.length}`);
        resolver.resolveDiscovery(discovery, testController, token);
        stepCache.update(stepDefinitions);
    } catch (err) {
        outputChannel.appendLine(`[discovery] ERROR: ${err}`);
        const errorItem = testController.createTestItem('discovery-error', 'Discovery error');
        errorItem.error = String(err);
        testController.items.add(errorItem);
    }
}

async function runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
): Promise<void> {
    if (!testController) return;

    const run = testController.createTestRun(request);

    // Collect test items to run and their pytest runIDs
    const testIds: string[] = [];
    const workspaceUris = new Set<string>();

    function collectItem(item: vscode.TestItem, workspaceUri: string): void {
        const resolver = resolvers.get(workspaceUri);
        if (!resolver) return;

        if (!item.children.size) {
            // Leaf
            const runId = resolver.itemIndex.idToRunId.get(item.id);
            if (runId) {
                testIds.push(runId);
                run.enqueued(item);
            }
        } else {
            item.children.forEach((child) => collectItem(child, workspaceUri));
        }
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        workspaceUris.add(folder.uri.fsPath);
    }

    if (request.include) {
        for (const item of request.include) {
            for (const wsPath of workspaceUris) {
                collectItem(item, wsPath);
            }
        }
    } else {
        // Run all
        testController.items.forEach((item) => {
            for (const wsPath of workspaceUris) {
                collectItem(item, wsPath);
            }
        });
    }

    if (testIds.length === 0) {
        run.end();
        return;
    }

    // Use the first workspace folder (single-folder assumption for now)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        run.end();
        return;
    }
    const workspaceUri = workspaceFolders[0].uri;
    const interpreterPath = await getPythonInterpreter(workspaceUri);
    const resolver = resolvers.get(workspaceUri.fsPath);
    if (!resolver) {
        run.end();
        return;
    }

    try {
        const payloads = await runTests(workspaceUri, interpreterPath, testIds, token);
        for (const payload of payloads) {
            resolver.resolveExecution(payload, run);
        }
    } catch (err) {
        // Surface error on all enqueued items
        testController.items.forEach((item) => {
            item.children.forEach((child) => {
                if (child.children.size === 0) {
                    run.errored(child, [new vscode.TestMessage(String(err))]);
                }
            });
        });
    } finally {
        run.end();
    }
}
