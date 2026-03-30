// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// BDD-ORAMA: New file — resolves discovery and execution payloads for the
// pytest-bdd test runner.

import { CancellationToken, TestController, TestItem, TestMessage, TestRun, Uri, workspace } from 'vscode';
import { buildTree } from './treeBuilder';
import { DiscoveredTestPayload, ExecutionTestPayload, IBddTestItemIndex, ITestResultResolver } from './types';

// 'passed', 'failed', 'errored', 'skipped' are terminal states in VS Code's
// TestRun API and produce a persistent result when run.end() is called.
// 'enqueued' is a transient state: it shows a pending icon during the run but
// VS Code does not store it as a terminal result — the item appears as "not run"
// (visually indistinguishable from skipped) once the run ends. Use 'skipped'
// when the intent is "this test intentionally did not run this time."
type VscodeRunState = 'passed' | 'failed' | 'errored' | 'skipped' | 'enqueued';

const VALID_STATES = new Set<string>(['passed', 'failed', 'errored', 'skipped', 'enqueued']);

function readOutcomeMapping(): Record<string, string> {
    return workspace.getConfiguration('pytest-bdd-orama').get<Record<string, string>>('outcomeMapping', {});
}

const WAITING_PREFIX = '⏳ ';

function applyMappedState(run: TestRun, item: TestItem, state: VscodeRunState, label: string, duration: number | undefined): void {
    switch (state) {
        case 'passed':
            item.label = item.label.replace(WAITING_PREFIX, '');
            run.passed(item, duration);
            break;
        case 'failed':
            item.label = item.label.replace(WAITING_PREFIX, '');
            run.failed(item, [new TestMessage(label)], duration);
            break;
        case 'skipped':
            item.label = item.label.replace(WAITING_PREFIX, '');
            run.skipped(item);
            break;
        case 'enqueued':
            // Transient state — shows pending icon during the run; after run.end()
            // VS Code shows this as "not run" (same icon as skipped). Use 'skipped'
            // if you want an explicit terminal result instead.
            if (!item.label.startsWith(WAITING_PREFIX)) {
                item.label = `${WAITING_PREFIX}${item.label}`;
            }
            run.enqueued(item);
            break;
        case 'errored':
        default:
            item.label = item.label.replace(WAITING_PREFIX, '');
            run.errored(item, [new TestMessage(label)], duration);
            break;
    }
}

class BddTestItemIndex implements IBddTestItemIndex {
    readonly idToRunId = new Map<string, string>();
    readonly runIdToItem = new Map<string, TestItem>();
}

export class BddResultResolver implements ITestResultResolver {
    readonly itemIndex: IBddTestItemIndex = new BddTestItemIndex();

    resolveDiscovery(
        payload: DiscoveredTestPayload,
        testController: TestController,
        token?: CancellationToken,
    ): void {
        if (token?.isCancellationRequested) {
            return;
        }
        if (payload.status === 'error' || !payload.tests) {
            // Surface discovery errors as an error item at the root
            const errorItem = testController.createTestItem('discovery-error', 'Discovery error');
            errorItem.error = payload.error?.join('\n') ?? 'Unknown discovery error';
            testController.items.add(errorItem);
            return;
        }

        buildTree(testController, payload.tests, Uri.file(payload.cwd), this.itemIndex);
    }

    resolveExecution(payload: ExecutionTestPayload, run: TestRun): void {
        if (!payload.result) {
            return;
        }

        // Read fresh each call — no caching — so settings changes take effect immediately
        const outcomeMapping = readOutcomeMapping();

        for (const [runId, result] of Object.entries(payload.result)) {
            const item = this.itemIndex.runIdToItem.get(runId);
            if (!item) {
                // Item not in our tree — could be a non-BDD test from the same run
                continue;
            }

            const outcome = result.outcome ?? 'error';
            const duration = undefined; // pytest payload doesn't include duration currently
            const customStatus = result.custom_status;

            switch (outcome) {
                case 'success':
                    run.passed(item, duration);
                    break;

                case 'skipped':
                    run.skipped(item);
                    break;

                case 'failure':
                case 'error': {
                    if (customStatus) {
                        // Look up user mapping; fall back to 'errored'
                        const rawMapped = outcomeMapping[customStatus];
                        const mapped: VscodeRunState = VALID_STATES.has(rawMapped)
                            ? (rawMapped as VscodeRunState)
                            : 'errored';
                        applyMappedState(run, item, mapped, customStatus, duration);
                    } else {
                        const message = result.message ?? result.traceback ?? outcome;
                        run.failed(item, [new TestMessage(message)], duration);
                    }
                    break;
                }

                default:
                    run.errored(item, [new TestMessage(outcome)], duration);
                    break;
            }
        }

        // Mark any items that received no result as errored (e.g. crash during collection)
        if (payload.notFound) {
            for (const runId of payload.notFound) {
                const item = this.itemIndex.runIdToItem.get(runId);
                if (item) {
                    run.errored(item, [new TestMessage('Test not found')]);
                }
            }
        }
    }
}
