// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.

/**
 * The wire contract between the pytest side and any host.
 *
 * Everything here is plain data by construction — it crosses a pipe as JSON, so
 * it cannot reference editor types even in principle. Both ends must agree on
 * these shapes.
 *
 * These shapes began as ms-python's payload types, back when the Python half was
 * a vendored copy of its bridge. pytest-big-dill now produces them itself, so the
 * contract is ours to define and change.
 */

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
    /** Relative path to the .feature file (e.g. "features/states/basic_states.feature") */
    feature_path?: string;
    /** Display name for the scenario (may differ from name for outlines) */
    scenario_name?: string;
    /** Scenario tags from the .feature file (without the @ prefix) */
    scenario_tags?: string[];
    /** Feature-level tags from the Feature: declaration (without the @ prefix) */
    feature_tags?: string[];
    /** Feature display name from the Feature: declaration */
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
            /** Custom status string from pytest_report_customstatus */
            custom_status?: string;
        };
    };
    notFound?: string[];
    error: string;
};

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
    /** Absolute path to the Python file where this step is defined. */
    file?: string;
    /** 1-indexed line number in the Python file. */
    line?: number;
    /** First line of the function docstring. */
    summary?: string;
    /** Tags from the Tags: docstring section. */
    tags?: string[];
    /** StepType/StepEnum class names used as parameter types. */
    param_types?: string[];
    /** Times this step pattern appears across workspace .feature files. Tracked by StepCache. */
    usage_count?: number;
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
