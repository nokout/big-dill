// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Structural lint rules for Gherkin documents.
//
// Every rule is a pure function of (document, lines) returning plain
// DiagnosticEntry objects. Nothing here knows what an editor is — mapping to
// editor diagnostics is the host's job.

import type { GherkinDocument } from '@cucumber/messages';
import type { StepCache } from '../steps/stepCache';

export interface DiagnosticEntry {
    line: number;      // 0-indexed
    message: string;
    severity: 'error' | 'warning' | 'info';
}

export function checkEmptyComments(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    return (doc.comments ?? [])
        .filter((c) => c.text.trim() === '#')
        .map((c) => ({
            line: (c.location?.line ?? 1) - 1,
            message: 'Empty comment not allowed',
            severity: 'warning' as const,
        }));
}

export function checkDuplicateExampleRows(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    for (const child of doc.feature?.children ?? []) {
        for (const examples of child.scenario?.examples ?? []) {
            const seen = new Set<string>();
            for (const row of examples.tableBody) {
                const key = row.cells.map((c) => c.value).join('\0');
                if (seen.has(key)) {
                    diags.push({
                        line: (row.location?.line ?? 1) - 1,
                        message: `Duplicate example row: ${row.cells.map((c) => c.value).join(', ')}`,
                        severity: 'warning',
                    });
                }
                seen.add(key);
            }
        }
    }
    return diags;
}

export function checkOversizedExampleTable(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    for (const child of doc.feature?.children ?? []) {
        for (const examples of child.scenario?.examples ?? []) {
            if (examples.tableBody.length > 20) {
                diags.push({
                    line: (examples.location?.line ?? 1) - 1,
                    message: `Examples table has ${examples.tableBody.length} rows — consider splitting (limit: 20)`,
                    severity: 'warning',
                });
            }
        }
    }
    return diags;
}

export function checkOutlineMissingExamples(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    for (const child of doc.feature?.children ?? []) {
        const scenario = child.scenario;
        if (!scenario) continue;
        if (scenario.keyword.trim().toLowerCase().includes('outline') && scenario.examples.length === 0) {
            diags.push({
                line: (scenario.location?.line ?? 1) - 1,
                message: `Scenario Outline '${scenario.name}' has no Examples block`,
                severity: 'error',
            });
        }
    }
    return diags;
}

export function checkEmptyExamplesBody(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    for (const child of doc.feature?.children ?? []) {
        for (const examples of child.scenario?.examples ?? []) {
            if (examples.tableHeader && examples.tableBody.length === 0) {
                diags.push({
                    line: (examples.location?.line ?? 1) - 1,
                    message: 'Examples block has no data rows',
                    severity: 'error',
                });
            }
        }
    }
    return diags;
}

export function checkTagAllowlist(
    doc: GherkinDocument,
    _lines: string[],
    allowedTags: string[],
): DiagnosticEntry[] {
    if (allowedTags.length === 0) return [];

    const allowed = new Set(allowedTags.map((t) => t.startsWith('@') ? t : `@${t}`));
    const diags: DiagnosticEntry[] = [];

    function checkTags(tags: ReadonlyArray<{ name: string; location?: { line?: number } }>) {
        for (const tag of tags) {
            if (!allowed.has(tag.name)) {
                diags.push({
                    line: (tag.location?.line ?? 1) - 1,
                    message: `Tag ${tag.name} is not in the allowed tags list`,
                    severity: 'warning',
                });
            }
        }
    }

    checkTags(doc.feature?.tags ?? []);
    for (const child of doc.feature?.children ?? []) {
        checkTags(child.scenario?.tags ?? []);
    }

    return diags;
}

// Bounded quantifier: /<[^>]+>/ is quadratic on a long run of unclosed '<',
// because the engine retries the inner scan from every one of them. The linter
// runs on every keystroke, so a pasted malformed line could stall the editor.
// No real Examples placeholder approaches 200 characters.
const EXAMPLE_PARAM_RE = /<[^>]{1,200}>/;

export function checkScenarioShouldBeOutline(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    for (const child of doc.feature?.children ?? []) {
        const scenario = child.scenario;
        if (!scenario) continue;
        if (scenario.keyword.trim().toLowerCase().includes('outline')) continue;
        for (const step of scenario.steps) {
            if (EXAMPLE_PARAM_RE.test(step.text ?? '')) {
                diags.push({
                    line: (scenario.location?.line ?? 1) - 1,
                    message: `Scenario '${scenario.name}' uses <param> syntax — use Scenario Outline`,
                    severity: 'warning',
                });
                break;
            }
        }
    }
    return diags;
}

export function checkScenarioHasExamplesNotOutline(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    for (const child of doc.feature?.children ?? []) {
        const scenario = child.scenario;
        if (!scenario) continue;
        if (scenario.keyword.trim().toLowerCase().includes('outline')) continue;
        if (scenario.examples.length > 0) {
            diags.push({
                line: (scenario.examples[0].location?.line ?? scenario.location?.line ?? 1) - 1,
                message: `Examples table found under Scenario '${scenario.name}' — change keyword to Scenario Outline`,
                severity: 'error',
            });
        }
    }
    return diags;
}

const PLACEHOLDER_RE = /<([^<>]+)>/g;

type Scenario = NonNullable<NonNullable<GherkinDocument['feature']>['children'][number]['scenario']>;
type Step = Scenario['steps'][number];

/** All scenarios in the document, including those nested inside Rule blocks. */
function allScenarios(doc: GherkinDocument): Scenario[] {
    return (doc.feature?.children ?? []).flatMap((child) =>
        child.scenario ? [child.scenario]
            : (child.rule?.children ?? []).flatMap((rc) => rc.scenario ? [rc.scenario] : []),
    );
}

function isOutline(scenario: Scenario): boolean {
    return scenario.keyword.trim().toLowerCase().includes('outline');
}

/**
 * Texts in which Example placeholders are substituted: step text, datatable
 * cells, and docstring content (pytest-bdd ≥8) — each with its 0-indexed line.
 */
function placeholderSources(step: Step): Array<{ text: string; line: number }> {
    const sources = [{ text: step.text ?? '', line: (step.location?.line ?? 1) - 1 }];
    for (const row of step.dataTable?.rows ?? []) {
        sources.push({
            text: row.cells.map((c) => c.value).join(' '),
            line: (row.location?.line ?? step.location?.line ?? 1) - 1,
        });
    }
    if (step.docString) {
        const startLine = step.docString.location?.line ?? step.location?.line ?? 1;
        step.docString.content.split('\n').forEach((text, i) => {
            sources.push({ text, line: startLine + i }); // content starts after the opening """
        });
    }
    return sources;
}

export function checkUndefinedExampleColumn(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    for (const scenario of allScenarios(doc)) {
        if (!isOutline(scenario)) continue;

        const headers = scenario.examples.filter((e) => e.tableHeader);
        if (headers.length === 0) continue;
        const columns = new Set(headers.flatMap((e) => e.tableHeader!.cells.map((c) => c.value)));

        for (const step of scenario.steps) {
            const missing = new Map<string, number>();
            for (const { text, line } of placeholderSources(step)) {
                for (const match of text.matchAll(PLACEHOLDER_RE)) {
                    if (!columns.has(match[1]) && !missing.has(match[1])) missing.set(match[1], line);
                }
            }
            for (const [name, line] of missing) {
                diags.push({
                    line,
                    message: `Step references <${name}> but no Examples column '${name}' exists`,
                    severity: 'error',
                });
            }
        }
    }
    return diags;
}

export function checkUnusedExampleColumn(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    for (const scenario of allScenarios(doc)) {
        if (!isOutline(scenario)) continue;

        const referenced = new Set<string>();
        for (const step of scenario.steps) {
            for (const { text } of placeholderSources(step)) {
                for (const match of text.matchAll(PLACEHOLDER_RE)) referenced.add(match[1]);
            }
        }

        // An undefined reference is usually the other half of the same typo —
        // leave that outline to checkUndefinedExampleColumn and re-evaluate
        // unused columns once the reference is fixed.
        const columns = new Set(
            scenario.examples.flatMap((e) => e.tableHeader?.cells.map((c) => c.value) ?? []),
        );
        if ([...referenced].some((name) => !columns.has(name))) continue;

        for (const examples of scenario.examples) {
            for (const cell of examples.tableHeader?.cells ?? []) {
                if (!referenced.has(cell.value)) {
                    diags.push({
                        line: (cell.location?.line ?? examples.location?.line ?? 1) - 1,
                        message: `Examples column '${cell.value}' is never referenced by any step`,
                        severity: 'warning',
                    });
                }
            }
        }
    }
    return diags;
}

export function checkDuplicateScenarioName(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    const firstSeen = new Map<string, number>();
    for (const scenario of allScenarios(doc)) {
        const name = scenario.name.trim();
        if (!name) continue;
        const line = scenario.location?.line ?? 1;
        const first = firstSeen.get(name);
        if (first !== undefined) {
            diags.push({
                line: line - 1,
                message: `Duplicate scenario name '${name}' (first used on line ${first})`,
                severity: 'warning',
            });
        } else {
            firstSeen.set(name, line);
        }
    }
    return diags;
}

export function checkDuplicateExamplesColumn(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    for (const scenario of allScenarios(doc)) {
        for (const examples of scenario.examples) {
            const seen = new Set<string>();
            const reported = new Set<string>();
            for (const cell of examples.tableHeader?.cells ?? []) {
                if (seen.has(cell.value) && !reported.has(cell.value)) {
                    diags.push({
                        line: (cell.location?.line ?? examples.location?.line ?? 1) - 1,
                        message: `Duplicate Examples column '${cell.value}'`,
                        severity: 'error',
                    });
                    reported.add(cell.value);
                }
                seen.add(cell.value);
            }
        }
    }
    return diags;
}

export function checkEmptyScenario(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    return allScenarios(doc)
        .filter((scenario) => scenario.steps.length === 0)
        .map((scenario) => ({
            line: (scenario.location?.line ?? 1) - 1,
            message: `Scenario '${scenario.name}' has no steps`,
            severity: 'error' as const,
        }));
}

export function checkOutlineSingleRow(doc: GherkinDocument, _lines: string[]): DiagnosticEntry[] {
    const diags: DiagnosticEntry[] = [];
    for (const scenario of allScenarios(doc)) {
        if (!isOutline(scenario)) continue;
        if (scenario.examples.length !== 1) continue;
        if (scenario.examples[0].tableBody.length === 1) {
            diags.push({
                line: (scenario.location?.line ?? 1) - 1,
                message: `Scenario Outline '${scenario.name}' has a single example row — consider a plain Scenario`,
                severity: 'info',
            });
        }
    }
    return diags;
}

export interface PhrasingRule {
    pattern: string;
    message: string;
}

export function checkPhrasingRules(
    doc: GherkinDocument,
    _lines: string[],
    rules: PhrasingRule[],
): DiagnosticEntry[] {
    if (rules.length === 0) return [];

    const compiled = rules.map((r) => ({ re: new RegExp(r.pattern, 'i'), message: r.message }));
    const diags: DiagnosticEntry[] = [];

    for (const child of doc.feature?.children ?? []) {
        const steps = child.scenario?.steps ?? child.background?.steps ?? [];
        for (const step of steps) {
            const text = step.text ?? '';
            for (const { re, message } of compiled) {
                if (re.test(text)) {
                    diags.push({
                        line: (step.location?.line ?? 1) - 1,
                        message,
                        severity: 'warning',
                    });
                    break; // one diagnostic per step per pass
                }
            }
        }
    }

    return diags;
}

export const RULES = [
    checkEmptyComments,
    checkDuplicateExampleRows,
    checkOversizedExampleTable,
    checkOutlineMissingExamples,
    checkEmptyExamplesBody,
    checkScenarioShouldBeOutline,
    checkScenarioHasExamplesNotOutline,
    checkUndefinedExampleColumn,
    checkUnusedExampleColumn,
    checkDuplicateScenarioName,
    checkDuplicateExamplesColumn,
    checkEmptyScenario,
    checkOutlineSingleRow,
];
/**
 * Return the appropriate diagnostic severity for a phrasing violation on *stepText*.
 * - 'warning' if the step has no matching implementation (proposing new wording)
 * - 'information' if the step matches a known implementation (existing convention violation)
 */
export function graduatePhrasingSeverity(
    stepText: string,
    cache: StepCache,
): 'warning' | 'information' {
    return cache.matchPattern(stepText) ? 'information' : 'warning';
}

/** Configuration consumed by the lint pass, as plain data. */
export interface LintConfig {
    allowedTags?: string[];
    phrasingRules?: PhrasingRule[];
}

/**
 * Run every structural rule plus the configurable checks over a parsed document.
 *
 * This is the entry point a host should call; it replaces the dispatch that
 * previously lived inside the VS Code linter class.
 */
export function lintDocument(
    doc: GherkinDocument,
    lines: string[],
    config: LintConfig = {},
): DiagnosticEntry[] {
    return [
        ...RULES.flatMap((rule) => rule(doc, lines)),
        ...checkTagAllowlist(doc, lines, config.allowedTags ?? []),
        ...checkPhrasingRules(doc, lines, config.phrasingRules ?? []),
    ];
}
