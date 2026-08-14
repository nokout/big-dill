// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// The wire contract itself lives in @nokout/big-dill-core — it is plain data and
// has no editor dependency. What remains here are the two interfaces that are
// genuinely VS Code-shaped, because they hold TestItem/TestController/TestRun.

import { CancellationToken, TestController, TestItem, TestRun } from 'vscode';
import type { DiscoveredTestPayload, ExecutionTestPayload } from '@nokout/big-dill-core';

// Re-exported so existing imports of `./types` keep working; core is the source
// of truth for every one of these shapes.
export type {
    DiscoveredTestType,
    DiscoveredTestCommon,
    DiscoveredTestItem,
    DiscoveredTestNode,
    DiscoveredTestPayload,
    ExecutionTestPayload,
    StepParameter,
    StepDefinition,
    StepDefinitionPayload,
    LintDiagnosticEntry,
    LintDiagnosticPayload,
} from '@nokout/big-dill-core';

/** Maps TestItem ids maintained by this extension to their pytest run ids. */
export interface IBddTestItemIndex {
    /** extension TestItem.id → pytest runID (absolute nodeid) */
    readonly idToRunId: Map<string, string>;
    /** pytest runID → extension TestItem */
    readonly runIdToItem: Map<string, TestItem>;
}

export interface ITestResultResolver {
    readonly itemIndex: IBddTestItemIndex;
    resolveDiscovery(payload: DiscoveredTestPayload, testController: TestController, token?: CancellationToken): void;
    resolveExecution(payload: ExecutionTestPayload, run: TestRun): void;
}
