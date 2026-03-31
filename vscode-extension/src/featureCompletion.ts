import * as vscode from 'vscode';
import { StepCache } from './stepCache';

const KEYWORD_RE = /^\s*(Given|When|Then|And|But|\*)\s+/i;
const PARAM_RE = /\{(\w+)(?::[^}]+)?\}/g;

export type KeywordAndText = { keyword: string; text: string };

/** Extract the Gherkin keyword and the step text from a raw line, or null. */
export function extractStepText(line: string): KeywordAndText | null {
    const m = KEYWORD_RE.exec(line);
    if (!m) return null;
    return { keyword: m[1].toLowerCase(), text: line.slice(m[0].length) };
}

/** Convert a step pattern to a VS Code snippet string with numbered tab stops. */
function patternToSnippet(pattern: string): string {
    let i = 0;
    return pattern.replace(PARAM_RE, (_match, name) => `\${${++i}:${name}}`);
}

/**
 * Level 1: return snippet completion items for step patterns matching *partialText*.
 */
export function buildStepCompletions(
    partialText: string,
    keyword: string,
    cache: StepCache,
): vscode.CompletionItem[] {
    const lower = partialText.toLowerCase();
    return cache
        .getForKeyword(keyword)
        .filter((s) => s.pattern.toLowerCase().startsWith(lower))
        .map((s) => {
            const item = new vscode.CompletionItem(s.pattern, vscode.CompletionItemKind.Snippet);
            const snippet = patternToSnippet(s.pattern);
            item.insertText = snippet === s.pattern
                ? s.pattern  // no parameters — plain string
                : new vscode.SnippetString(snippet);
            item.detail = `${s.keyword} step`;
            return item;
        });
}

/**
 * Level 2: return domain value completion items when the cursor is inside a
 * parameter value position on a line that matches a known step pattern.
 */
export function buildDomainCompletions(
    lineText: string,
    column: number,
    cache: StepCache,
): vscode.CompletionItem[] {
    // Try exact match first (cursor is inside an already-typed value)
    let pos = cache.paramPositionAt(lineText, column);

    if (!pos) {
        // Cursor may be at/after a partial value; try matching with the partial
        // value replaced by a placeholder so paramPositionAt can locate the param.
        // Strategy: try each prefix length from column down to find a match.
        const textUpToCursor = lineText.slice(0, column);
        // Try trimming trailing partial word to see if bare prefix matches
        const trimmed = textUpToCursor.trimEnd();
        pos = cache.paramPositionAt(trimmed, column);

        if (!pos) {
            // Try appending a dummy value so the full-line regex matches
            // e.g. "the state is " → "the state is X" then check col=13
            const withDummy = textUpToCursor + 'X';
            pos = cache.paramPositionAt(withDummy, column);
        }
    }

    if (!pos) return [];
    return pos.parameter.suggested_values.map(
        (v) => new vscode.CompletionItem(v, vscode.CompletionItemKind.EnumMember),
    );
}

/** VS Code CompletionItemProvider for .feature files. */
export class FeatureCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly cache: StepCache) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const rawLine = document.lineAt(position).text;
        const column = position.character;
        const stepText = extractStepText(rawLine);
        if (!stepText) return [];

        // Level 2: domain values if cursor is inside a param value
        const stepTextStart = rawLine.indexOf(stepText.text);
        const colInStep = column - stepTextStart;
        const domainItems = buildDomainCompletions(stepText.text, colInStep, this.cache);
        if (domainItems.length > 0) return domainItems;

        // Level 1: step pattern completions
        const partialUpToCursor = rawLine.slice(stepTextStart, column);
        return buildStepCompletions(partialUpToCursor, stepText.keyword, this.cache);
    }
}
