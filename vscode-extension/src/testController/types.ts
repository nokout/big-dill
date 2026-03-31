// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Adapted from microsoft/vscode-python (commit 5c2c3948e1c8c8a1dfe848104773477e70d0b83b).
//
// BDD-ORAMA modifications:
//   - DiscoveredTestItem: added feature_path and scenario_name optional fields.
//   - ExecutionTestPayload result entries: added custom_status optional field.

import { CancellationToken, TestController, TestItem, TestRun } from 'vscode';

export type DiscoveredTestType = 'folder' | 'file' | 'class' | 'function' | 'test';

export type DiscoveredTestCommon = {
    path: string;
    name: string;
    type_: DiscoveredTestType;
    id_: string;
};

export type DiscoveredTestItem = DiscoveredTestCommon & {
    lineno: number | string;
    runID: string;
    /** BDD-ORAMA: relative path to the .feature file (e.g. "features/states/basic_states.feature") */
    feature_path?: string;
    /** BDD-ORAMA: display name for the scenario (may differ from name for outlines) */
    scenario_name?: string;
    /** BDD-ORAMA: scenario tags from the .feature file (without the @ prefix) */
    scenario_tags?: string[];
    /** BDD-ORAMA: feature-level tags from the Feature: declaration (without the @ prefix) */
    feature_tags?: string[];
    /** BDD-ORAMA: feature display name from the Feature: declaration */
    feature_name?: string;
};

export type DiscoveredTestNode = DiscoveredTestCommon & {
    children: (DiscoveredTestNode | DiscoveredTestItem)[];
    lineno?: number | string;
};

export type DiscoveredTestPayload = {
    cwd: string;
    tests?: DiscoveredTestNode;
    status: 'success' | 'error';
    error?: string[];
};

export type ExecutionTestPayload = {
    cwd: string;
    status: 'success' | 'error';
    result?: {
        [testRunID: string]: {
            test?: string;
            outcome?: string;
            message?: string;
            traceback?: string;
            subtest?: string;
            /** BDD-ORAMA: custom status string from pytest_report_customstatus */
            custom_status?: string;
        };
    };
    notFound?: string[];
    error: string;
};

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

// ── Step definition types (for completions and validation) ─────────────────

export type StepParameter = {
    name: string;
    type_name: string;
    suggested_values: string[];
    has_validator: boolean;
};

export type StepDefinition = {
    keyword: 'given' | 'when' | 'then' | 'step';
    pattern: string;
    parameters: StepParameter[];
};

export type StepDefinitionPayload = {
    type: 'stepDefinitions';
    stepDefinitions: StepDefinition[];
};

// ── Lint diagnostic types ───────────────────────────────────────────────────

export type LintDiagnosticEntry = {
    path: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    line: number | null;
};

export type LintDiagnosticPayload = {
    type: 'lintDiagnostics';
    diagnostics: LintDiagnosticEntry[];
};
