import * as vscode from 'vscode';
import { StepCache } from './stepCache';
import { StepParameter } from './testController/types';
import { outputChannel } from './extension';

const KEYWORD_RE = /^\s*(Given|When|Then|And|But|\*)\s+/i;
const PARAM_RE = /\{(\w+)(?::[^}]+)?\}/g;

export type KeywordAndText = { keyword: string; text: string };

/** Extract the Gherkin keyword and the step text from a raw line, or null. */
export function extractStepText(line: string): KeywordAndText | null {
    const m = KEYWORD_RE.exec(line);
    if (!m) return null;
    return { keyword: m[1].toLowerCase(), text: line.slice(m[0].length) };
}

/**
 * Escape a string for use inside a VS Code snippet choice list.
 * The characters `,`, `|`, `\`, `$`, `}` are special inside `${N|...|}.
 */
function escapeChoice(v: string): string {
    return v.replace(/[\\|,$}]/g, '\\$&');
}

/**
 * Convert a step pattern to a VS Code snippet string.
 * Parameters with suggested_values become choice tab stops (${1|NSW,VIC,...|})
 * so VS Code shows the inline choice picker as soon as the tab stop activates.
 * Parameters without suggested_values fall back to a plain placeholder (${1:name}).
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
 * Level 1: return snippet completion items for step patterns matching *partialText*.
 */
export function buildStepCompletions(
    partialText: string,
    keyword: string,
    cache: StepCache,
): vscode.CompletionItem[] {
    const lower = partialText.toLowerCase();
    const matched = cache
        .getForKeyword(keyword)
        .filter((s) => s.pattern.toLowerCase().startsWith(lower));

    // Sort by usage_count descending before building items
    matched.sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0));

    return matched.map((s, index) => {
        const item = new vscode.CompletionItem(s.pattern, vscode.CompletionItemKind.Snippet);
        const snippet = patternToSnippet(s.pattern, s.parameters ?? []);
        item.insertText = snippet !== s.pattern ? new vscode.SnippetString(snippet) : s.pattern;
        item.detail = `${s.keyword} step`;
        item.sortText = String(index).padStart(6, '0');
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
        try {
            return this._provideCompletionItems(document, position);
        } catch (err) {
            outputChannel?.appendLine(`[completions] ERROR: ${err}`);
            return [];
        }
    }

    private _provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const rawLine = document.lineAt(position).text;
        const column = position.character;
        const stepText = extractStepText(rawLine);
        if (!stepText) return [];

        outputChannel?.appendLine(`[completions] keyword=${stepText.keyword} text="${stepText.text}" cacheSize=${this.cache.getAll().length}`);

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
