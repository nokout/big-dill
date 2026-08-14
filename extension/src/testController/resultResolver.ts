// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. What an execution payload means is decided by
// @nokout/big-dill-core; this applies those decisions to a TestRun.

import { CancellationToken, TestController, TestItem, TestMessage, TestRun, Uri, workspace } from 'vscode';
import {
    resolveExecutionOutcomes,
    WAITING_PREFIX,
    type OutcomeDecision,
} from '@nokout/big-dill-core';
import { buildTree } from './treeBuilder';
import { DiscoveredTestPayload, ExecutionTestPayload, IBddTestItemIndex, ITestResultResolver } from './types';

class BddTestItemIndex implements IBddTestItemIndex {
    readonly idToRunId = new Map<string, string>();
    readonly runIdToItem = new Map<string, TestItem>();
}

/** Apply one decision to the run. Duration is not reported by pytest yet. */
function apply(run: TestRun, item: TestItem, decision: OutcomeDecision): void {
    if (decision.label === 'strip') {
        item.label = item.label.replace(WAITING_PREFIX, '');
    } else if (decision.label === 'prefix' && !item.label.startsWith(WAITING_PREFIX)) {
        item.label = `${WAITING_PREFIX}${item.label}`;
    }

    const messages = decision.message !== undefined ? [new TestMessage(decision.message)] : [];

    switch (decision.state) {
        case 'passed':
            run.passed(item, undefined);
            break;
        case 'failed':
            run.failed(item, messages, undefined);
            break;
        case 'skipped':
            run.skipped(item);
            break;
        case 'enqueued':
            run.enqueued(item);
            break;
        case 'errored':
        default:
            run.errored(item, messages, undefined);
            break;
    }
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
        // Read fresh each call — no caching — so settings changes take effect immediately.
        const outcomeMapping = workspace
            .getConfiguration('big-dill')
            .get<Record<string, string>>('outcomeMapping', {});

        for (const decision of resolveExecutionOutcomes(payload, outcomeMapping)) {
            const item = this.itemIndex.runIdToItem.get(decision.runId);
            // Not in our tree — a non-BDD test from the same run, for instance.
            if (item) {
                apply(run, item, decision);
            }
        }
    }
}
