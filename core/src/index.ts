// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.

/**
 * @nokout/big-dill-core — the headless engine behind Big Dill.
 *
 * Nothing exported here depends on an editor. Results are plain data; mapping
 * them onto editor types is the host's responsibility. See
 * docs/adapter-contract.md for what a host must provide.
 */

// ── Gherkin parsing ─────────────────────────────────────────────────────────
export {
    parseSource,
    GherkinParseCache,
    type ParseResult,
    type CacheableDocument,
} from './gherkin/parser';

// ── Structural linting ──────────────────────────────────────────────────────
export {
    lintDocument,
    graduatePhrasingSeverity,
    RULES,
    checkEmptyComments,
    checkDuplicateExampleRows,
    checkOversizedExampleTable,
    checkOutlineMissingExamples,
    checkEmptyExamplesBody,
    checkTagAllowlist,
    checkScenarioShouldBeOutline,
    checkScenarioHasExamplesNotOutline,
    checkUndefinedExampleColumn,
    checkUnusedExampleColumn,
    checkDuplicateScenarioName,
    checkDuplicateExamplesColumn,
    checkEmptyScenario,
    checkOutlineSingleRow,
    checkPhrasingRules,
    type DiagnosticEntry,
    type PhrasingRule,
    type LintConfig,
} from './lint/rules';

// ── Step indexing ───────────────────────────────────────────────────────────
export { StepCache, type LineMatch, type ParamAtPosition } from './steps/stepCache';

// ── pytest IPC ──────────────────────────────────────────────────────────────
export { createIpcServer, type IIpcServer, type IpcMessageHandler } from './ipc/server';

// ── Test tree shape ─────────────────────────────────────────────────────────
export {
    buildTestTree,
    type TreeNode,
    type TreeNodeUri,
    type TreeNodeRange,
    type BuiltTree,
} from './tree/builder';

// ── Running pytest ──────────────────────────────────────────────────────────
export {
    discoverTests,
    runTests,
    runBddLint,
    type PytestOptions,
    type DiscoveryResult,
} from './pytest/runner';

// ── Wire protocol ───────────────────────────────────────────────────────────
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
} from './protocol/types';
