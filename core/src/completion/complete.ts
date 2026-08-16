// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Completion for step lines in a .feature file.
//
// Two levels, tried in order:
//   1. parameter values — the cursor sits inside a value position of a known step
//   2. step patterns    — the text so far is a prefix of one or more known steps
//
// Results are plain entries. `insertText` may carry LSP snippet syntax when
// `snippet` is set; that format is a protocol convention rather than a
// particular editor's, so hosts can pass it straight through.

import type { StepCache } from '../steps/stepCache';
import type { StepParameter } from '../protocol/types';

const KEYWORD_RE = /^\s*(Given|When|Then|And|But|\*)\s+/i;
const PARAM_RE = /\{(\w+)(?::[^}]{1,200})?\}/g;

export type CompletionKind = 'step' | 'value';

export interface CompletionEntry {
    label: string;
    kind: CompletionKind;
    /** LSP snippet syntax when `snippet` is true, literal text otherwise. */
    insertText: string;
    snippet: boolean;
    detail?: string;
    sortText?: string;
}

export type KeywordAndText = { keyword: string; text: string };

/** Extract the Gherkin keyword and the step text from a raw line, or null. */
export function extractStepText(line: string): KeywordAndText | null {
    const m = KEYWORD_RE.exec(line);
    if (!m) return null;
    return { keyword: m[1].toLowerCase(), text: line.slice(m[0].length) };
}

/** Strip type annotations from parameter placeholders: {name:Type} → {name}. */
function normalizePattern(pattern: string): string {
    return pattern.replace(PARAM_RE, (_match, name) => `{${name}}`);
}

/** Escape for a snippet choice list, where , | \ $ } are special. */
function escapeChoice(v: string): string {
    return v.replace(/[\\|,$}]/g, '\\$&');
}

/**
 * Convert a step pattern to snippet syntax.
 *
 * Parameters with suggested values become choice tab stops (${1|NSW,VIC|}) so a
 * host can offer the values inline; the rest become plain placeholders
 * (${1:name}).
 */
function patternToSnippet(pattern: string, parameters: StepParameter[]): string {
    let i = 0;
    let paramIdx = 0;
    return pattern.replace(PARAM_RE, (_match, name) => {
        const param = parameters[paramIdx++];
        const values = param?.suggested_values ?? [];
        if (values.length > 0) {
            return `\${${++i}|${values.map(escapeChoice).join(',')}|}`;
        }
        return `\${${++i}:${name}}`;
    });
}

/**
 * Prefix-match regex for a step pattern: literals escaped, {param} placeholders
 * widened to `.*`, and no end anchor, so partially-typed steps still match.
 */
function buildPrefixRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withWildcards = escaped.replace(/\\\{[^}]{0,200}\\\}/g, '.*');
    return new RegExp(`^${withWildcards}`, 'i');
}

/**
 * Step patterns matching *partialText*, most-used first.
 *
 * Matches when the normalised pattern starts with the partial text, or when the
 * partial text matches the pattern with placeholders treated as wildcards — the
 * latter covers a user who has already typed values into parameter positions.
 */
export function completeStepPatterns(
    partialText: string,
    keyword: string,
    cache: StepCache,
): CompletionEntry[] {
    const lower = partialText.toLowerCase();
    const matched = cache
        .getForKeyword(keyword)
        .filter((s) =>
            normalizePattern(s.pattern).toLowerCase().startsWith(lower) ||
            buildPrefixRegex(s.pattern).test(partialText));

    matched.sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0));

    return matched.map((s, index) => {
        const snippet = patternToSnippet(s.pattern, s.parameters ?? []);
        const isSnippet = snippet !== s.pattern;
        return {
            label: normalizePattern(s.pattern),
            kind: 'step' as const,
            insertText: isSnippet ? snippet : s.pattern,
            snippet: isSnippet,
            detail: `${s.keyword} step`,
            // Pre-ranked, so hosts that sort alphabetically preserve usage order.
            sortText: String(index).padStart(6, '0'),
        };
    });
}

/**
 * Suggested values for the parameter the cursor sits in, if any.
 *
 * Three attempts, because the cursor is often mid-value where the line does not
 * yet match a pattern: the text as-is, then trimmed, then with a dummy character
 * appended so the pattern can match around the cursor.
 */
export function completeParameterValues(
    lineText: string,
    column: number,
    cache: StepCache,
): CompletionEntry[] {
    let pos = cache.paramPositionAt(lineText, column);

    if (!pos) {
        const textUpToCursor = lineText.slice(0, column);
        pos = cache.paramPositionAt(textUpToCursor.trimEnd(), column);
        if (!pos) {
            pos = cache.paramPositionAt(`${textUpToCursor}X`, column);
        }
    }

    if (!pos) return [];
    return pos.parameter.suggested_values.map((v) => ({
        label: v,
        kind: 'value' as const,
        insertText: v,
        snippet: false,
    }));
}

/**
 * Complete at a cursor position on a raw line.
 *
 * Parameter values win when available; step patterns are the fallback.
 */
export function completeAt(line: string, column: number, cache: StepCache): CompletionEntry[] {
    const stepText = extractStepText(line);
    if (!stepText) return [];

    // indexOf('') is 0 for any string, so an empty step text would wrongly anchor
    // at the start of the line. Nothing typed yet means the step starts here.
    const stepTextStart = stepText.text ? line.indexOf(stepText.text) : column;

    const values = completeParameterValues(stepText.text, column - stepTextStart, cache);
    if (values.length > 0) return values;

    return completeStepPatterns(line.slice(stepTextStart, column), stepText.keyword, cache);
}
