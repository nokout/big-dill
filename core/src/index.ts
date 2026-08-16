// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.

/**
 * @nokout/big-dill-core — the headless engine behind Big Dill.
 *
 * Nothing exported here depends on an editor. Results are plain data; mapping
 * them onto editor types is the host's responsibility. See the "Building a
 * host" section of README.md for what a host must provide.
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

// ── Completion ──────────────────────────────────────────────────────────────
export {
    completeAt,
    completeStepPatterns,
    completeParameterValues,
    extractStepText,
    type CompletionEntry,
    type CompletionKind,
    type KeywordAndText,
} from './completion/complete';

// ── Document outline ────────────────────────────────────────────────────────
export { buildSymbolTree, type SymbolNode, type SymbolNodeKind } from './symbols/outline';

// ── Semantic tokens ─────────────────────────────────────────────────────────
export {
    buildTableTokens,
    TOKEN_TYPES,
    TYPE_INDEX,
    type TokenType,
    type TokenEntry,
} from './tokens/semanticTokens';

// ── Table formatting ────────────────────────────────────────────────────────
export { formatTables, type TextEditEntry } from './format/tables';

// ── Step documentation, stubs, references ───────────────────────────────────
export { renderStepMarkdown } from './steps/documentation';
export { buildStepStub, patternToFunctionName } from './steps/stubs';
export { findReferencesInLines } from './steps/references';
export { findUnimplementedSteps, type UnimplementedStep } from './steps/unimplemented';

// ── Step browser model ──────────────────────────────────────────────────────
export {
    browseSteps,
    filterSteps,
    groupLabels,
    stepsInGroup,
    UNKNOWN_FILE,
    NO_TYPE,
    UNTAGGED,
    type GroupingMode,
    type StepBrowserNode,
    type BrowseOptions,
} from './steps/browser';

// ── Step indexing ───────────────────────────────────────────────────────────
export { StepCache, patternToRegex, type LineMatch, type ParamAtPosition } from './steps/stepCache';

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

// ── Execution outcomes ──────────────────────────────────────────────────────
export {
    resolveExecutionOutcomes,
    WAITING_PREFIX,
    type RunState,
    type OutcomeDecision,
} from './results/outcomes';

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
