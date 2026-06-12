# Step IDE Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the VS Code extension with eight step-metadata-powered IDE features — hover docs, go-to-definition, find references, unimplemented-step linting, step stub generation, a step browser panel, usage-frequency ranking in completions, and phrasing-linter severity graduation — all consuming the extended `StepCache` populated by Plan B's enriched Python plugin output.

**Architecture:** All features live in TypeScript only; no Python changes are required (Plan B must be merged first). `StepCache` is extended to hold the full enriched `StepMetadata` shape including `file`, `line`, `summary`, `tags`, and `param_types`, and to track `usage_count` by scanning workspace `.feature` files. Each new provider (`featureHover.ts`, `featureDefinition.ts`, `featureReferences.ts`, `featureCodeActions.ts`, `stepBrowserView.ts`) is registered in `extension.ts` against `{ language: 'feature' }` and reads exclusively from `StepCache`. `featureDiagnostics.ts` is extended with a static unimplemented-step pass that runs without a Python subprocess.

**Tech Stack:** TypeScript 5.x, VS Code API (`HoverProvider`, `DefinitionProvider`, `ReferenceProvider`, `CodeActionProvider`, `TreeDataProvider`, `WorkspaceEdit`, `DiagnosticCollection`), Jest, `vscode.workspace.findFiles` for reference scanning.

---

## Dependency

**Plan B (Python Plugin Enrichment) must be merged before this plan is executed.** After Plan B, each step object emitted by the Python plugin (and therefore each `StepDefinition` stored in `StepCache`) includes `file`, `line`, `summary`, `tags`, and `param_types`. This plan treats those fields as guaranteed present.

---

## File Map

### New TypeScript files

| File | Responsibility |
|---|---|
| `vscode-extension/src/featureHover.ts` | `HoverProvider` — markdown hover for a step |
| `vscode-extension/src/featureDefinition.ts` | `DefinitionProvider` — jump to Python implementation |
| `vscode-extension/src/featureReferences.ts` | `ReferenceProvider` — all `.feature` locations using a step |
| `vscode-extension/src/featureCodeActions.ts` | `CodeActionProvider` — generate Python step stub |
| `vscode-extension/src/stepBrowserView.ts` | `TreeDataProvider` — step browser panel |
| `vscode-extension/src/__tests__/featureHover.test.ts` | Jest tests |
| `vscode-extension/src/__tests__/featureDefinition.test.ts` | Jest tests |
| `vscode-extension/src/__tests__/featureReferences.test.ts` | Jest tests |
| `vscode-extension/src/__tests__/featureCodeActions.test.ts` | Jest tests |
| `vscode-extension/src/__tests__/stepBrowserView.test.ts` | Jest tests |

### Modified TypeScript files

| File | Change |
|---|---|
| `vscode-extension/src/testController/types.ts` | Extend `StepDefinition` with enriched fields |
| `vscode-extension/src/stepCache.ts` | Store enriched metadata; add `updateUsageCounts()`; expose `matchPattern()` |
| `vscode-extension/src/featureCompletion.ts` | Sort completions by `usage_count` descending |
| `vscode-extension/src/featureDiagnostics.ts` | Add static unimplemented-step pass |
| `vscode-extension/src/extension.ts` | Register all new providers; call `updateUsageCounts()` after discovery |
| `vscode-extension/__mocks__/vscode.ts` | Add `Hover`, `Location`, `MarkdownString`, `CodeAction`, `TreeItem`, `EventEmitter`, `DiagnosticSeverity`, `WorkspaceEdit`, `TreeItemCollapsibleState` mocks |

---

## Task 1 — Extend `StepDefinition` type and `StepCache`

### 1.1 — Test: enriched fields are stored and returned

- [ ] Create `vscode-extension/src/__tests__/stepCache.enriched.test.ts` with this content:

```typescript
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const RICH_STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [{
        name: 'state',
        type_name: 'AustralianState',
        suggested_values: ['NSW', 'Victoria'],
        has_validator: true,
    }],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: 'Set the current Australian state.',
    tags: ['geography'],
    param_types: ['AustralianState'],
};

const PLAIN_STEP: StepDefinition = {
    keyword: 'when',
    pattern: 'the user logs in',
    parameters: [],
    file: '/abs/tests/steps/auth_steps.py',
    line: 10,
    summary: 'Authenticate the test user.',
    tags: [],
    param_types: [],
};

describe('StepCache enriched metadata', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([RICH_STEP, PLAIN_STEP]);
    });

    test('getAll returns steps with enriched fields intact', () => {
        const all = cache.getAll();
        expect(all[0].file).toBe('/abs/tests/steps/state_steps.py');
        expect(all[0].line).toBe(42);
        expect(all[0].summary).toBe('Set the current Australian state.');
        expect(all[0].tags).toEqual(['geography']);
        expect(all[0].param_types).toEqual(['AustralianState']);
    });

    test('matchPattern returns matching step for exact step text', () => {
        const step = cache.matchPattern('the state is NSW');
        expect(step).not.toBeNull();
        expect(step!.pattern).toBe('the state is {state:AustralianState}');
    });

    test('matchPattern returns null when no match', () => {
        expect(cache.matchPattern('completely unrelated')).toBeNull();
    });

    test('updateUsageCounts sets usage_count on matched steps', () => {
        // Two feature lines reference the state step, one references auth step
        cache.updateUsageCounts([
            'Given the state is NSW',
            'Given the state is Victoria',
            'When the user logs in',
        ]);
        const all = cache.getAll();
        const stateStep = all.find(s => s.pattern === 'the state is {state:AustralianState}')!;
        const loginStep = all.find(s => s.pattern === 'the user logs in')!;
        expect(stateStep.usage_count).toBe(2);
        expect(loginStep.usage_count).toBe(1);
    });

    test('updateUsageCounts resets to 0 for unmatched steps', () => {
        cache.updateUsageCounts([]);
        const all = cache.getAll();
        expect(all.every(s => s.usage_count === 0)).toBe(true);
    });
});
```

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest stepCache.enriched --no-coverage 2>&1 | tail -20` — expected: **FAIL** (type errors / missing fields)

### 1.2 — Extend `StepDefinition` in `types.ts`

- [ ] Edit `vscode-extension/src/testController/types.ts` — replace:

```typescript
export type StepDefinition = {
    keyword: 'given' | 'when' | 'then' | 'step';
    pattern: string;
    parameters: StepParameter[];
};
```

with:

```typescript
export type StepDefinition = {
    keyword: 'given' | 'when' | 'then' | 'step';
    pattern: string;
    parameters: StepParameter[];
    /** Absolute path to the Python file where this step is defined (from Plan B). */
    file?: string;
    /** 1-indexed line number in the Python file (from Plan B). */
    line?: number;
    /** First line of the function docstring (from Plan B). */
    summary?: string;
    /** Tags from the Tags: docstring section (from Plan B). */
    tags?: string[];
    /** StepType/StepEnum class names used as parameter types (from Plan B). */
    param_types?: string[];
    /** Number of times this step pattern appears across workspace .feature files. Tracked by StepCache. */
    usage_count?: number;
};
```

### 1.3 — Extend `StepCache` in `stepCache.ts`

- [ ] Replace the entire contents of `vscode-extension/src/stepCache.ts` with:

```typescript
import { StepDefinition, StepParameter } from './testController/types';

export type LineMatch = {
    step: StepDefinition;
    params: Record<string, string>;
};

export type ParamAtPosition = {
    parameter: StepParameter;
    valueStart: number;
    valueEnd: number;
};

/** Convert a step pattern to a regex with named capture groups for each parameter. */
function patternToRegex(pattern: string): RegExp {
    // Escape regex metacharacters except our own {} placeholders
    const parts = pattern.split(/(\{[^}]+\})/);
    const regexStr = parts
        .map((part, i) => {
            if (i % 2 === 1) {
                // parameter placeholder — extract name, create named capture group
                const name = part.replace(/^\{(\w+)(?::[^}]+)?\}$/, '$1');
                return `(?<${name}>.+?)`;
            }
            // literal text — escape regex metacharacters
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('');
    return new RegExp(`^${regexStr}$`);
}

/** Strip Gherkin keyword prefix from a raw feature file step line. */
const KEYWORD_RE = /^\s*(?:Given|When|Then|And|But|\*)\s+/i;
function stripKeyword(line: string): string | null {
    const m = KEYWORD_RE.exec(line);
    return m ? line.slice(m[0].length) : null;
}

export class StepCache {
    private steps: StepDefinition[] = [];
    private distributedSteps: StepDefinition[] = [];

    update(steps: StepDefinition[]): void {
        this.steps = steps.map(s => ({ ...s, usage_count: s.usage_count ?? 0 }));
    }

    updateDistributed(steps: StepDefinition[]): void {
        this.distributedSteps = steps.map(s => ({ ...s, usage_count: s.usage_count ?? 0 }));
    }

    /**
     * Scan *lines* (raw text lines from .feature files) and set `usage_count`
     * on each step in the cache to the number of times that step pattern matches.
     * Resets all counts to 0 before counting.
     */
    updateUsageCounts(lines: string[]): void {
        // Reset
        for (const s of [...this.steps, ...this.distributedSteps]) {
            s.usage_count = 0;
        }

        for (const line of lines) {
            const stepText = stripKeyword(line);
            if (!stepText) continue;
            for (const step of [...this.steps, ...this.distributedSteps]) {
                const rx = patternToRegex(step.pattern);
                if (rx.test(stepText.trim())) {
                    step.usage_count = (step.usage_count ?? 0) + 1;
                }
            }
        }
    }

    getAll(): StepDefinition[] {
        return [...this.distributedSteps, ...this.steps];
    }

    getForKeyword(keyword: string): StepDefinition[] {
        const norm = keyword.toLowerCase();
        return this.getAll().filter(
            (s) => s.keyword === norm || s.keyword === 'step'
        );
    }

    /** Match full step text (no keyword prefix) against cached patterns. */
    matchLine(stepText: string): LineMatch | null {
        for (const step of this.steps) {
            const rx = patternToRegex(step.pattern);
            const m = rx.exec(stepText);
            if (m?.groups) {
                return { step, params: { ...m.groups } };
            }
        }
        return null;
    }

    /**
     * Return the step definition whose pattern matches *stepText* (no keyword prefix),
     * or null if no pattern matches. Used by hover, definition, and linting.
     */
    matchPattern(stepText: string): StepDefinition | null {
        const trimmed = stepText.trim();
        for (const step of this.getAll()) {
            const rx = patternToRegex(step.pattern);
            if (rx.test(trimmed)) {
                return step;
            }
        }
        return null;
    }

    /**
     * Return the parameter the cursor (at *column*) sits inside on *lineText*,
     * or null if the cursor is not inside a parameter value.
     */
    paramPositionAt(lineText: string, column: number): ParamAtPosition | null {
        for (const step of this.steps) {
            const rx = patternToRegex(step.pattern);
            const m = rx.exec(lineText);
            if (!m?.groups) continue;

            let searchFrom = 0;
            for (const param of step.parameters) {
                const value = m.groups[param.name];
                if (value === undefined) continue;
                const idx = lineText.indexOf(value, searchFrom);
                if (idx === -1) continue;
                const end = idx + value.length;
                if (column >= idx && column <= end) {
                    return { parameter: param, valueStart: idx, valueEnd: end };
                }
                searchFrom = end;
            }
        }
        return null;
    }
}
```

### 1.4 — Verify tests pass

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest stepCache --no-coverage 2>&1 | tail -20` — expected: **PASS** (all stepCache tests including enriched suite)

### 1.5 — Commit

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add vscode-extension/src/testController/types.ts vscode-extension/src/stepCache.ts vscode-extension/src/__tests__/stepCache.enriched.test.ts`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "feat(cache): extend StepDefinition and StepCache with enriched metadata fields"`

---

## Task 2 — Usage-frequency ranking in completions

### 2.1 — Test: completions sorted by usage_count

- [ ] Add to `vscode-extension/src/__tests__/featureCompletion.test.ts` a new `describe` block:

```typescript
describe('buildStepCompletions usage-frequency ranking', () => {
    test('returns steps sorted by usage_count descending', () => {
        const cache = new StepCache();
        const low: StepDefinition = { keyword: 'given', pattern: 'the alpha step', parameters: [], usage_count: 1 };
        const high: StepDefinition = { keyword: 'given', pattern: 'the beta step', parameters: [], usage_count: 5 };
        const zero: StepDefinition = { keyword: 'given', pattern: 'the gamma step', parameters: [], usage_count: 0 };
        cache.update([low, high, zero]);
        const items = buildStepCompletions('the', 'given', cache);
        expect(items[0].label).toBe('the beta step');
        expect(items[1].label).toBe('the alpha step');
        expect(items[2].label).toBe('the gamma step');
    });

    test('sortOrder property is set on each completion item', () => {
        const cache = new StepCache();
        cache.update([{ keyword: 'given', pattern: 'a step', parameters: [], usage_count: 3 }]);
        const items = buildStepCompletions('', 'given', cache);
        // sortText encodes inverted count so VS Code sorts ascending by sortText
        expect(items[0].sortText).toBeDefined();
    });
});
```

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureCompletion --no-coverage 2>&1 | tail -20` — expected: **FAIL** (ranking not implemented)

### 2.2 — Implement ranking in `featureCompletion.ts`

- [ ] Edit `buildStepCompletions` in `vscode-extension/src/featureCompletion.ts` — replace the `.map` block:

```typescript
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
        const snippet = patternToSnippet(s.pattern);
        item.insertText = snippet === s.pattern
            ? s.pattern  // no parameters — plain string
            : new vscode.SnippetString(snippet);
        item.detail = `${s.keyword} step`;
        // Encode position as zero-padded string so VS Code sorts ascending by sortText
        item.sortText = String(index).padStart(6, '0');
        return item;
    });
}
```

### 2.3 — Verify

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureCompletion --no-coverage 2>&1 | tail -20` — expected: **PASS**

### 2.4 — Commit

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add vscode-extension/src/featureCompletion.ts vscode-extension/src/__tests__/featureCompletion.test.ts`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "feat(completions): sort step completions by usage frequency"`

---

## Task 3 — Hover provider

### 3.1 — Expand vscode mock

- [ ] Edit `vscode-extension/__mocks__/vscode.ts` — add these exports after the existing `CompletionItem` class:

```typescript
export class MarkdownString {
    value: string;
    constructor(value = '') {
        this.value = value;
    }
    appendMarkdown(text: string): this {
        this.value += text;
        return this;
    }
    appendCodeblock(text: string, language?: string): this {
        this.value += `\`\`\`${language ?? ''}\n${text}\n\`\`\`\n`;
        return this;
    }
}

export class Hover {
    contents: MarkdownString[];
    range?: unknown;
    constructor(contents: MarkdownString | MarkdownString[], range?: unknown) {
        this.contents = Array.isArray(contents) ? contents : [contents];
        this.range = range;
    }
}

export class Location {
    uri: unknown;
    range: unknown;
    constructor(uri: unknown, range: unknown) {
        this.uri = uri;
        this.range = range;
    }
}

export class CodeAction {
    title: string;
    edit?: unknown;
    diagnostics?: unknown[];
    kind?: string;
    constructor(title: string, kind?: string) {
        this.title = title;
        this.kind = kind;
    }
}

export const CodeActionKind = {
    QuickFix: 'quickfix',
    Refactor: 'refactor',
};

export class WorkspaceEdit {
    private _edits: Array<{ uri: unknown; range: unknown; newText: string }> = [];
    replace(uri: unknown, range: unknown, newText: string): void {
        this._edits.push({ uri, range, newText });
    }
    insert(uri: unknown, position: unknown, text: string): void {
        this._edits.push({ uri, range: position, newText: text });
    }
    getEdits(): Array<{ uri: unknown; range: unknown; newText: string }> {
        return this._edits;
    }
}

export class TreeItem {
    label: string;
    collapsibleState?: number;
    description?: string;
    tooltip?: string;
    command?: unknown;
    contextValue?: string;
    constructor(label: string, collapsibleState?: number) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

export const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
};

export class EventEmitter<T = void> {
    private listeners: Array<(e: T) => void> = [];
    readonly event = (listener: (e: T) => void): { dispose: () => void } => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(data: T): void {
        this.listeners.forEach(l => l(data));
    }
    dispose(): void {
        this.listeners = [];
    }
}

export const DiagnosticSeverity = {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
};

export class Diagnostic {
    range: unknown;
    message: string;
    severity: number;
    source?: string;
    code?: string;
    constructor(range: unknown, message: string, severity: number) {
        this.range = range;
        this.message = message;
        this.severity = severity;
    }
}

export const languages = {
    createDiagnosticCollection: jest.fn().mockReturnValue({
        set: jest.fn(),
        clear: jest.fn(),
        delete: jest.fn(),
        dispose: jest.fn(),
    }),
};
```

### 3.2 — Test: hover provider

- [ ] Create `vscode-extension/src/__tests__/featureHover.test.ts`:

```typescript
import { buildHoverContent } from '../featureHover';
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const RICH_STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [{
        name: 'state',
        type_name: 'AustralianState',
        suggested_values: ['NSW', 'Victoria', 'Queensland'],
        has_validator: true,
    }],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: 'Set the current Australian state.',
    tags: ['geography', 'ui'],
    param_types: ['AustralianState'],
};

const PLAIN_STEP: StepDefinition = {
    keyword: 'when',
    pattern: 'the user logs in',
    parameters: [],
    file: '/abs/tests/steps/auth_steps.py',
    line: 10,
    summary: '',
    tags: [],
    param_types: [],
};

describe('buildHoverContent', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([RICH_STEP, PLAIN_STEP]);
    });

    test('returns null when no step matches', () => {
        expect(buildHoverContent('completely unrelated step', cache)).toBeNull();
    });

    test('includes step pattern in hover', () => {
        const md = buildHoverContent('the state is NSW', cache);
        expect(md).not.toBeNull();
        expect(md!.value).toContain('the state is');
    });

    test('includes docstring summary when present', () => {
        const md = buildHoverContent('the state is NSW', cache);
        expect(md!.value).toContain('Set the current Australian state.');
    });

    test('does not include empty summary section', () => {
        const md = buildHoverContent('the user logs in', cache);
        expect(md!.value).not.toContain('undefined');
    });

    test('includes param type with suggested values', () => {
        const md = buildHoverContent('the state is NSW', cache);
        expect(md!.value).toContain('AustralianState');
        expect(md!.value).toContain('NSW');
        expect(md!.value).toContain('Victoria');
    });

    test('includes tags when present', () => {
        const md = buildHoverContent('the state is NSW', cache);
        expect(md!.value).toContain('geography');
        expect(md!.value).toContain('ui');
    });

    test('does not include tags section when tags is empty', () => {
        const md = buildHoverContent('the user logs in', cache);
        expect(md!.value).not.toContain('Tags');
    });
});
```

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureHover --no-coverage 2>&1 | tail -20` — expected: **FAIL** (file does not exist)

### 3.3 — Implement `featureHover.ts`

- [ ] Create `vscode-extension/src/featureHover.ts`:

```typescript
import * as vscode from 'vscode';
import { StepCache } from './stepCache';
import { StepDefinition } from './testController/types';
import { extractStepText } from './featureCompletion';

/** Build markdown hover content for a step. Returns null if no match. */
export function buildHoverContent(
    stepText: string,
    cache: StepCache,
): vscode.MarkdownString | null {
    const step = cache.matchPattern(stepText);
    if (!step) return null;
    return renderStepHover(step);
}

function renderStepHover(step: StepDefinition): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    // Pattern heading
    md.appendMarkdown(`**\`${step.pattern}\`**\n\n`);

    // Docstring summary
    if (step.summary) {
        md.appendMarkdown(`${step.summary}\n\n`);
    }

    // Param types
    if (step.parameters.length > 0) {
        md.appendMarkdown('**Parameters:**\n\n');
        for (const param of step.parameters) {
            const values = param.suggested_values.length > 0
                ? param.suggested_values.join(', ')
                : '_(no suggested values)_';
            md.appendMarkdown(`- \`{${param.name}}\` — **${param.type_name}**: ${values}\n`);
        }
        md.appendMarkdown('\n');
    }

    // Tags
    if (step.tags && step.tags.length > 0) {
        const tagList = step.tags.map(t => `\`@${t}\``).join(' ');
        md.appendMarkdown(`**Tags:** ${tagList}\n\n`);
    }

    // Source location (non-clickable — just informational)
    if (step.file) {
        const loc = step.line ? `${step.file}:${step.line}` : step.file;
        md.appendMarkdown(`_Defined in \`${loc}\`_`);
    }

    return md;
}

/** VS Code HoverProvider for .feature files. */
export class FeatureHoverProvider implements vscode.HoverProvider {
    constructor(private readonly cache: StepCache) {}

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | null {
        const rawLine = document.lineAt(position).text;
        const stepText = extractStepText(rawLine);
        if (!stepText) return null;

        const content = buildHoverContent(stepText.text, this.cache);
        if (!content) return null;

        return new vscode.Hover(content);
    }
}
```

### 3.4 — Verify

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureHover --no-coverage 2>&1 | tail -20` — expected: **PASS**

### 3.5 — Commit

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add vscode-extension/__mocks__/vscode.ts vscode-extension/src/featureHover.ts vscode-extension/src/__tests__/featureHover.test.ts`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "feat(hover): add FeatureHoverProvider with step pattern, summary, params, and tags"`

---

## Task 4 — Go-to-definition provider

### 4.1 — Test

- [ ] Create `vscode-extension/src/__tests__/featureDefinition.test.ts`:

```typescript
import { buildDefinitionLocation } from '../featureDefinition';
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const STEP_WITH_LOCATION: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: '',
    tags: [],
    param_types: [],
};

const STEP_NO_LOCATION: StepDefinition = {
    keyword: 'when',
    pattern: 'no location step',
    parameters: [],
    // file and line intentionally absent
};

describe('buildDefinitionLocation', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([STEP_WITH_LOCATION, STEP_NO_LOCATION]);
    });

    test('returns Location for step with file and line', () => {
        const loc = buildDefinitionLocation('the state is NSW', cache);
        expect(loc).not.toBeNull();
        // loc.uri.fsPath should be the step file
        expect((loc!.uri as { fsPath: string }).fsPath).toBe('/abs/tests/steps/state_steps.py');
    });

    test('returns null when step has no file metadata', () => {
        expect(buildDefinitionLocation('no location step', cache)).toBeNull();
    });

    test('returns null when no step matches', () => {
        expect(buildDefinitionLocation('completely unknown step', cache)).toBeNull();
    });
});
```

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureDefinition --no-coverage 2>&1 | tail -20` — expected: **FAIL**

### 4.2 — Implement `featureDefinition.ts`

- [ ] Create `vscode-extension/src/featureDefinition.ts`:

```typescript
import * as vscode from 'vscode';
import { StepCache } from './stepCache';
import { extractStepText } from './featureCompletion';

/** Build a VS Code Location for the Python implementation of *stepText*. Returns null if unavailable. */
export function buildDefinitionLocation(
    stepText: string,
    cache: StepCache,
): vscode.Location | null {
    const step = cache.matchPattern(stepText);
    if (!step || !step.file) return null;

    const uri = vscode.Uri.file(step.file);
    // line is 1-indexed; VS Code Range is 0-indexed
    const lineIndex = step.line !== undefined ? Math.max(0, step.line - 1) : 0;
    const position = new vscode.Position(lineIndex, 0);
    const range = new vscode.Range(position, position);
    return new vscode.Location(uri, range);
}

/** VS Code DefinitionProvider for .feature files. */
export class FeatureDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private readonly cache: StepCache) {}

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Location | null {
        const rawLine = document.lineAt(position).text;
        const stepText = extractStepText(rawLine);
        if (!stepText) return null;
        return buildDefinitionLocation(stepText.text, this.cache);
    }
}
```

### 4.3 — Verify

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureDefinition --no-coverage 2>&1 | tail -20` — expected: **PASS**

### 4.4 — Commit

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add vscode-extension/src/featureDefinition.ts vscode-extension/src/__tests__/featureDefinition.test.ts`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "feat(definition): add FeatureDefinitionProvider for go-to-definition"`

---

## Task 5 — Find references provider

### 5.1 — Test

- [ ] Create `vscode-extension/src/__tests__/featureReferences.test.ts`:

```typescript
import { findReferencesInLines } from '../featureReferences';
import { StepDefinition } from '../testController/types';

const STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: '',
    tags: [],
    param_types: [],
};

describe('findReferencesInLines', () => {
    test('returns line numbers where step pattern matches', () => {
        const lines = [
            'Feature: States',                   // line 0 — not a step
            '  Scenario: Basic',                  // line 1
            '    Given the state is NSW',          // line 2 — match
            '    When the user logs in',           // line 3 — no match
            '    Given the state is Victoria',     // line 4 — match
        ];
        const matches = findReferencesInLines(lines, STEP);
        expect(matches).toHaveLength(2);
        expect(matches[0]).toBe(2);
        expect(matches[1]).toBe(4);
    });

    test('returns empty array when no lines match', () => {
        const lines = ['When the user logs in', 'Then it succeeds'];
        expect(findReferencesInLines(lines, STEP)).toHaveLength(0);
    });

    test('ignores comment lines starting with #', () => {
        const lines = ['# Given the state is NSW'];
        expect(findReferencesInLines(lines, STEP)).toHaveLength(0);
    });
});
```

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureReferences --no-coverage 2>&1 | tail -20` — expected: **FAIL**

### 5.2 — Implement `featureReferences.ts`

- [ ] Create `vscode-extension/src/featureReferences.ts`:

```typescript
import * as vscode from 'vscode';
import { StepCache } from './stepCache';
import { StepDefinition } from './testController/types';
import { extractStepText } from './featureCompletion';

const COMMENT_RE = /^\s*#/;
const KEYWORD_RE = /^\s*(?:Given|When|Then|And|But|\*)\s+/i;

/** Return 0-indexed line numbers within *lines* where *step*'s pattern matches. */
export function findReferencesInLines(lines: string[], step: StepDefinition): number[] {
    // Build a regex from the pattern
    const parts = step.pattern.split(/(\{[^}]+\})/);
    const regexStr = parts
        .map((part, i) => {
            if (i % 2 === 1) {
                const name = part.replace(/^\{(\w+)(?::[^}]+)?\}$/, '$1');
                return `(?<${name}>.+?)`;
            }
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('');
    const rx = new RegExp(`^${regexStr}$`);

    const results: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (COMMENT_RE.test(line)) continue;
        const m = KEYWORD_RE.exec(line);
        if (!m) continue;
        const text = line.slice(m[0].length).trim();
        if (rx.test(text)) {
            results.push(i);
        }
    }
    return results;
}

/** VS Code ReferenceProvider for .feature files.
 *
 * When invoked from a Python step definition (file:line matching a cached step),
 * scans all workspace .feature files and returns matching locations.
 * Also works when invoked from a .feature step line.
 */
export class FeatureReferencesProvider implements vscode.ReferenceProvider {
    constructor(private readonly cache: StepCache) {}

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.Location[]> {
        // Determine which step we are looking at
        let step: StepDefinition | null = null;

        if (document.fileName.endsWith('.feature')) {
            const rawLine = document.lineAt(position).text;
            const stepText = extractStepText(rawLine);
            if (stepText) {
                step = this.cache.matchPattern(stepText.text);
            }
        } else if (document.fileName.endsWith('.py')) {
            // Invoked from a Python file — match by file + line
            const lineNumber = position.line + 1; // 1-indexed
            const fsPath = document.uri.fsPath;
            step = this.cache.getAll().find(
                s => s.file === fsPath && s.line === lineNumber,
            ) ?? null;
        }

        if (!step) return [];

        // Scan all .feature files in the workspace
        const featureUris = await vscode.workspace.findFiles('**/*.feature', '**/node_modules/**');
        const locations: vscode.Location[] = [];

        for (const uri of featureUris) {
            const doc = await vscode.workspace.openTextDocument(uri);
            const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
            const matchedLines = findReferencesInLines(lines, step);
            for (const lineIndex of matchedLines) {
                const range = new vscode.Range(
                    new vscode.Position(lineIndex, 0),
                    new vscode.Position(lineIndex, lines[lineIndex].length),
                );
                locations.push(new vscode.Location(uri, range));
            }
        }

        return locations;
    }
}
```

### 5.3 — Verify

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureReferences --no-coverage 2>&1 | tail -20` — expected: **PASS**

### 5.4 — Commit

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add vscode-extension/src/featureReferences.ts vscode-extension/src/__tests__/featureReferences.test.ts`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "feat(references): add FeatureReferencesProvider for find-all-references"`

---

## Task 6 — Unimplemented step linting

### 6.1 — Test

- [ ] Create `vscode-extension/src/__tests__/featureDiagnostics.unimplemented.test.ts`:

```typescript
import { findUnimplementedSteps } from '../featureDiagnostics';
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const KNOWN_STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [],
};

describe('findUnimplementedSteps', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([KNOWN_STEP]);
    });

    test('returns empty array when all steps are implemented', () => {
        const lines = [
            'Feature: Test',
            '  Scenario: Basic',
            '    Given the state is NSW',
        ];
        expect(findUnimplementedSteps(lines, cache)).toHaveLength(0);
    });

    test('flags unmatched step with line number and text', () => {
        const lines = [
            'Feature: Test',
            '  Scenario: Basic',
            '    Given the unknown step here',
        ];
        const results = findUnimplementedSteps(lines, cache);
        expect(results).toHaveLength(1);
        expect(results[0].lineIndex).toBe(2);
        expect(results[0].stepText).toBe('the unknown step here');
    });

    test('ignores non-step lines', () => {
        const lines = [
            'Feature: Test',
            '  Scenario: Something',
            '  Background:',
            '    # comment',
        ];
        expect(findUnimplementedSteps(lines, cache)).toHaveLength(0);
    });

    test('flags multiple unimplemented steps', () => {
        const lines = [
            '    Given step one unknown',
            '    When step two unknown',
            '    Given the state is NSW',
        ];
        const results = findUnimplementedSteps(lines, cache);
        expect(results).toHaveLength(2);
        expect(results[0].lineIndex).toBe(0);
        expect(results[1].lineIndex).toBe(1);
    });
});
```

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureDiagnostics.unimplemented --no-coverage 2>&1 | tail -20` — expected: **FAIL**

### 6.2 — Extend `featureDiagnostics.ts`

- [ ] Replace the entire contents of `vscode-extension/src/featureDiagnostics.ts` with:

```typescript
import * as vscode from 'vscode';
import { runBddLint } from './testController/pytestRunner';
import { StepCache } from './stepCache';
import { extractStepText } from './featureCompletion';

export type UnimplementedStep = {
    lineIndex: number;  // 0-indexed
    stepText: string;   // text after keyword
};

const COMMENT_RE = /^\s*#/;

/**
 * Scan *lines* and return entries for steps that have no matching pattern in *cache*.
 * Pure function — no I/O.
 */
export function findUnimplementedSteps(lines: string[], cache: StepCache): UnimplementedStep[] {
    const results: UnimplementedStep[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (COMMENT_RE.test(line)) continue;
        const parsed = extractStepText(line);
        if (!parsed) continue;
        if (!cache.matchPattern(parsed.text)) {
            results.push({ lineIndex: i, stepText: parsed.text });
        }
    }
    return results;
}

export class FeatureDiagnostics {
    private readonly collection: vscode.DiagnosticCollection;
    private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly getWorkspaceUri: () => vscode.Uri | undefined,
        private readonly getInterpreter: (uri: vscode.Uri) => Promise<string>,
        private readonly getStepCache: () => StepCache,
    ) {
        this.collection = vscode.languages.createDiagnosticCollection('pytest-bdd-orama');
    }

    /** Schedule a lint run for *uri* (debounced, 300 ms). Called on document save. */
    schedule(uri: vscode.Uri): void {
        const key = uri.fsPath;
        const existing = this.pending.get(key);
        if (existing) clearTimeout(existing);
        this.pending.set(key, setTimeout(() => { void this.lint(uri); }, 300));
    }

    private async lint(uri: vscode.Uri): Promise<void> {
        const workspaceUri = this.getWorkspaceUri();
        if (!workspaceUri) return;

        const interpreterPath = await this.getInterpreter(workspaceUri);
        let entries;
        try {
            entries = await runBddLint(uri.fsPath, workspaceUri, interpreterPath);
        } catch {
            return;  // subprocess error — don't clear existing diagnostics
        }

        const diagnostics: vscode.Diagnostic[] = entries.map((e) => {
            const line = Math.max(0, (e.line ?? 1) - 1);
            const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
            const severity =
                e.severity === 'error' ? vscode.DiagnosticSeverity.Error :
                e.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
                vscode.DiagnosticSeverity.Information;
            return new vscode.Diagnostic(range, e.message, severity);
        });

        // Static pass: flag unimplemented steps
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
            const cache = this.getStepCache();
            const unimplemented = findUnimplementedSteps(lines, cache);
            for (const u of unimplemented) {
                const range = new vscode.Range(u.lineIndex, 0, u.lineIndex, Number.MAX_SAFE_INTEGER);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Step not implemented: "${u.stepText}"`,
                    vscode.DiagnosticSeverity.Warning,
                ));
            }
        } catch { /* ignore document read errors */ }

        this.collection.set(uri, diagnostics);
    }

    dispose(): void {
        this.collection.dispose();
        for (const t of this.pending.values()) clearTimeout(t);
        this.pending.clear();
    }
}
```

**Note:** `FeatureDiagnostics` constructor now takes a third parameter `getStepCache`. Update `extension.ts` in Task 9.

### 6.3 — Verify

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureDiagnostics --no-coverage 2>&1 | tail -20` — expected: **PASS**

### 6.4 — Commit

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add vscode-extension/src/featureDiagnostics.ts vscode-extension/src/__tests__/featureDiagnostics.unimplemented.test.ts`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "feat(lint): flag unimplemented steps as Warnings in DiagnosticCollection"`

---

## Task 7 — Step stub code action

### 7.1 — Test

- [ ] Create `vscode-extension/src/__tests__/featureCodeActions.test.ts`:

```typescript
import { buildStepStub, patternToFunctionName } from '../featureCodeActions';

describe('patternToFunctionName', () => {
    test('converts simple pattern to snake_case', () => {
        expect(patternToFunctionName('the user logs in')).toBe('the_user_logs_in');
    });

    test('strips parameter placeholders', () => {
        expect(patternToFunctionName('the state is {state:AustralianState}')).toBe('the_state_is_state');
    });

    test('strips non-word characters', () => {
        expect(patternToFunctionName('user (with spaces) and "quotes"')).toBe('user_with_spaces_and_quotes');
    });
});

describe('buildStepStub', () => {
    test('generates a @given stub for a given step', () => {
        const stub = buildStepStub('the user logs in', 'Given');
        expect(stub).toContain('@given("the user logs in")');
        expect(stub).toContain('def the_user_logs_in():');
        expect(stub).toContain('raise NotImplementedError');
    });

    test('generates a @when stub', () => {
        const stub = buildStepStub('the button is clicked', 'When');
        expect(stub).toContain('@when("the button is clicked")');
        expect(stub).toContain('def the_button_is_clicked():');
    });

    test('generates a @then stub', () => {
        const stub = buildStepStub('the result is shown', 'Then');
        expect(stub).toContain('@then("the result is shown")');
    });

    test('uses @step for And/But/unknown keyword', () => {
        const stub = buildStepStub('something happens', 'And');
        expect(stub).toContain('@step("something happens")');
    });

    test('includes parameter names as function args when pattern has params', () => {
        const stub = buildStepStub('the state is {state:AustralianState}', 'Given');
        expect(stub).toContain('def the_state_is_state(state):');
    });
});
```

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureCodeActions --no-coverage 2>&1 | tail -20` — expected: **FAIL**

### 7.2 — Implement `featureCodeActions.ts`

- [ ] Create `vscode-extension/src/featureCodeActions.ts`:

```typescript
import * as vscode from 'vscode';
import { StepCache } from './stepCache';
import { extractStepText } from './featureCompletion';

const PARAM_RE = /\{(\w+)(?::[^}]+)?\}/g;
const UNIMPLEMENTED_CODE = 'pytest-bdd-orama.unimplementedStep';

/** Convert a step pattern to a Python snake_case function name. */
export function patternToFunctionName(pattern: string): string {
    return pattern
        .replace(PARAM_RE, '$1')           // replace {name:Type} → name
        .replace(/[^\w\s]/g, ' ')           // strip non-word chars
        .trim()
        .replace(/\s+/g, '_')              // spaces → underscores
        .replace(/_+/g, '_')               // collapse multiple underscores
        .toLowerCase();
}

const KEYWORD_TO_DECORATOR: Record<string, string> = {
    given: 'given',
    when: 'when',
    then: 'then',
};

/**
 * Generate a Python step function stub for *stepText* with the given Gherkin *keyword*.
 * *keyword* is the raw Gherkin word (Given, When, Then, And, But, *).
 */
export function buildStepStub(stepText: string, keyword: string): string {
    const kw = keyword.toLowerCase();
    const decorator = KEYWORD_TO_DECORATOR[kw] ?? 'step';

    // Extract parameter names from pattern (handles {name} and {name:Type})
    const paramNames: string[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(PARAM_RE.source, 'g');
    while ((m = re.exec(stepText)) !== null) {
        paramNames.push(m[1]);
    }

    const fnName = patternToFunctionName(stepText);
    const args = paramNames.length > 0 ? paramNames.join(', ') : '';
    const fnArgs = args ? `(${args})` : '()';

    return [
        `@${decorator}("${stepText}")`,
        `def ${fnName}${fnArgs}:`,
        `    raise NotImplementedError`,
    ].join('\n');
}

/** VS Code CodeActionProvider for unimplemented step diagnostics. */
export class FeatureCodeActionsProvider implements vscode.CodeActionProvider {
    constructor(private readonly cache: StepCache) {}

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range,
        context: vscode.CodeActionContext,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.code !== UNIMPLEMENTED_CODE) continue;

            const lineIndex = (diagnostic.range as vscode.Range).start.line;
            const rawLine = document.lineAt(lineIndex).text;
            const stepText = extractStepText(rawLine);
            if (!stepText) continue;

            // Already implemented — skip (race condition guard)
            if (this.cache.matchPattern(stepText.text)) continue;

            const action = new vscode.CodeAction(
                `Generate step stub: "${stepText.text}"`,
                vscode.CodeActionKind.QuickFix,
            );
            action.diagnostics = [diagnostic];

            // Generate stub content
            const stub = buildStepStub(stepText.text, stepText.keyword);
            const stubWithImport = [
                'from pytest_bdd import given, when, then, step',
                '',
                '',
                stub,
                '',
            ].join('\n');

            // Create a new untitled document with the stub
            // (WorkspaceEdit cannot create untitled files portably — use a snippet approach
            //  by inserting into a new editor via command)
            const edit = new vscode.WorkspaceEdit();
            // Insert the stub at the end of an existing conftest.py if present,
            // otherwise create a new file. For simplicity, we insert into a
            // new untitled file by opening one. We communicate the text via
            // the edit's metadata.
            const newFileUri = vscode.Uri.file(
                document.uri.fsPath.replace(/[^/\\]+\.feature$/, 'steps_stub.py'),
            );
            edit.insert(newFileUri, new vscode.Position(0, 0), stubWithImport);
            action.edit = edit;

            actions.push(action);
        }

        return actions;
    }
}

/** Diagnostic code used to identify unimplemented step warnings so CodeActions can filter. */
export { UNIMPLEMENTED_CODE };
```

### 7.3 — Verify

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureCodeActions --no-coverage 2>&1 | tail -20` — expected: **PASS**

### 7.4 — Commit

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add vscode-extension/src/featureCodeActions.ts vscode-extension/src/__tests__/featureCodeActions.test.ts`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "feat(code-actions): add step stub generator code action"`

---

## Task 8 — Step browser panel

### 8.1 — Test

- [ ] Create `vscode-extension/src/__tests__/stepBrowserView.test.ts`:

```typescript
import { StepBrowserProvider, GroupingMode, StepBrowserItem } from '../stepBrowserView';
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const STEP_A: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: 'Set the current state.',
    tags: ['geography'],
    param_types: ['AustralianState'],
};

const STEP_B: StepDefinition = {
    keyword: 'when',
    pattern: 'the user logs in',
    parameters: [],
    file: '/abs/tests/steps/auth_steps.py',
    line: 10,
    summary: 'Authenticate the user.',
    tags: ['auth', 'geography'],
    param_types: [],
};

const STEP_C: StepDefinition = {
    keyword: 'then',
    pattern: 'the result is shown',
    parameters: [],
    file: '/abs/tests/steps/auth_steps.py',
    line: 20,
    summary: 'Verify the result.',
    tags: [],
    param_types: [],
};

describe('StepBrowserProvider', () => {
    let cache: StepCache;
    let provider: StepBrowserProvider;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([STEP_A, STEP_B, STEP_C]);
        provider = new StepBrowserProvider(cache);
    });

    describe('grouping by file', () => {
        beforeEach(() => provider.setGroupingMode(GroupingMode.ByFile));

        test('root children are file path nodes', async () => {
            const roots = await provider.getChildren(undefined);
            const labels = roots.map(n => n.label);
            expect(labels).toContain('state_steps.py');
            expect(labels).toContain('auth_steps.py');
        });

        test('file node children are step items', async () => {
            const roots = await provider.getChildren(undefined);
            const authNode = roots.find(n => n.label === 'auth_steps.py')!;
            const children = await provider.getChildren(authNode);
            expect(children).toHaveLength(2);
        });
    });

    describe('grouping by step type', () => {
        beforeEach(() => provider.setGroupingMode(GroupingMode.ByStepType));

        test('root children are param type group nodes', async () => {
            const roots = await provider.getChildren(undefined);
            const labels = roots.map(n => n.label);
            expect(labels).toContain('AustralianState');
        });

        test('steps with no param_types appear under (no type) group', async () => {
            const roots = await provider.getChildren(undefined);
            const noTypeNode = roots.find(n => n.label === '(no type)');
            expect(noTypeNode).toBeDefined();
            const children = await provider.getChildren(noTypeNode!);
            expect(children.length).toBeGreaterThan(0);
        });
    });

    describe('grouping by tag', () => {
        beforeEach(() => provider.setGroupingMode(GroupingMode.ByTag));

        test('root children are tag nodes', async () => {
            const roots = await provider.getChildren(undefined);
            const labels = roots.map(n => n.label);
            expect(labels).toContain('@geography');
            expect(labels).toContain('@auth');
        });

        test('steps with no tags appear under (untagged) group', async () => {
            const roots = await provider.getChildren(undefined);
            const untagged = roots.find(n => n.label === '(untagged)');
            expect(untagged).toBeDefined();
        });

        test('step appears in each tag group it belongs to', async () => {
            const roots = await provider.getChildren(undefined);
            const geoNode = roots.find(n => n.label === '@geography')!;
            const children = await provider.getChildren(geoNode);
            const patterns = children.map(c => c.stepDefinition?.pattern);
            expect(patterns).toContain('the state is {state:AustralianState}');
            expect(patterns).toContain('the user logs in');
        });
    });

    describe('empty cache', () => {
        test('returns awaiting placeholder when cache is empty', async () => {
            const emptyCache = new StepCache();
            const emptyProvider = new StepBrowserProvider(emptyCache);
            const roots = await emptyProvider.getChildren(undefined);
            expect(roots).toHaveLength(1);
            expect(roots[0].label).toBe('Awaiting discovery...');
        });
    });
});
```

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest stepBrowserView --no-coverage 2>&1 | tail -20` — expected: **FAIL**

### 8.2 — Implement `stepBrowserView.ts`

- [ ] Create `vscode-extension/src/stepBrowserView.ts`:

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { StepCache } from './stepCache';
import { StepDefinition } from './testController/types';

export enum GroupingMode {
    ByFile = 'file',
    ByStepType = 'stepType',
    ByTag = 'tag',
}

export class StepBrowserItem extends vscode.TreeItem {
    stepDefinition?: StepDefinition;

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        stepDef?: StepDefinition,
    ) {
        super(label, collapsibleState);
        this.stepDefinition = stepDef;
        if (stepDef) {
            this.tooltip = stepDef.summary || stepDef.pattern;
            this.description = stepDef.keyword;
            this.contextValue = 'stepItem';
            if (stepDef.file && stepDef.line !== undefined) {
                this.command = {
                    command: 'vscode.open',
                    title: 'Go to definition',
                    arguments: [
                        vscode.Uri.file(stepDef.file),
                        { selection: new vscode.Range(stepDef.line - 1, 0, stepDef.line - 1, 0) },
                    ],
                };
            }
        } else {
            this.contextValue = 'stepGroup';
        }
    }
}

export class StepBrowserProvider implements vscode.TreeDataProvider<StepBrowserItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<StepBrowserItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private groupingMode: GroupingMode = GroupingMode.ByFile;

    constructor(private readonly cache: StepCache) {}

    setGroupingMode(mode: GroupingMode): void {
        this.groupingMode = mode;
        this._onDidChangeTreeData.fire();
    }

    getGroupingMode(): GroupingMode {
        return this.groupingMode;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StepBrowserItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: StepBrowserItem): Promise<StepBrowserItem[]> {
        const allSteps = this.cache.getAll();

        if (allSteps.length === 0) {
            if (element) return [];
            return [new StepBrowserItem('Awaiting discovery...', vscode.TreeItemCollapsibleState.None)];
        }

        // Leaf node — no children
        if (element?.stepDefinition) return [];

        // Root or group node
        if (!element) {
            return this.buildGroups(allSteps);
        }

        // Group node — return its steps
        return this.buildStepItems(allSteps, element.label as string);
    }

    private buildGroups(steps: StepDefinition[]): StepBrowserItem[] {
        switch (this.groupingMode) {
            case GroupingMode.ByFile:
                return this.groupsByFile(steps);
            case GroupingMode.ByStepType:
                return this.groupsByStepType(steps);
            case GroupingMode.ByTag:
                return this.groupsByTag(steps);
        }
    }

    private groupsByFile(steps: StepDefinition[]): StepBrowserItem[] {
        const fileMap = new Map<string, StepDefinition[]>();
        for (const step of steps) {
            const key = step.file ? path.basename(step.file) : '(unknown file)';
            if (!fileMap.has(key)) fileMap.set(key, []);
            fileMap.get(key)!.push(step);
        }
        return Array.from(fileMap.keys())
            .sort()
            .map(k => new StepBrowserItem(k, vscode.TreeItemCollapsibleState.Collapsed));
    }

    private groupsByStepType(steps: StepDefinition[]): StepBrowserItem[] {
        const typeMap = new Map<string, StepDefinition[]>();
        for (const step of steps) {
            const types = step.param_types && step.param_types.length > 0
                ? step.param_types
                : ['(no type)'];
            for (const t of types) {
                if (!typeMap.has(t)) typeMap.set(t, []);
                typeMap.get(t)!.push(step);
            }
        }
        return Array.from(typeMap.keys())
            .sort()
            .map(k => new StepBrowserItem(k, vscode.TreeItemCollapsibleState.Collapsed));
    }

    private groupsByTag(steps: StepDefinition[]): StepBrowserItem[] {
        const tagMap = new Map<string, StepDefinition[]>();
        for (const step of steps) {
            const tags = step.tags && step.tags.length > 0
                ? step.tags.map(t => `@${t}`)
                : ['(untagged)'];
            for (const tag of tags) {
                if (!tagMap.has(tag)) tagMap.set(tag, []);
                tagMap.get(tag)!.push(step);
            }
        }
        return Array.from(tagMap.keys())
            .sort()
            .map(k => new StepBrowserItem(k, vscode.TreeItemCollapsibleState.Collapsed));
    }

    private buildStepItems(steps: StepDefinition[], groupLabel: string): StepBrowserItem[] {
        let filtered: StepDefinition[];

        switch (this.groupingMode) {
            case GroupingMode.ByFile: {
                filtered = steps.filter(s =>
                    (s.file ? path.basename(s.file) : '(unknown file)') === groupLabel,
                );
                break;
            }
            case GroupingMode.ByStepType: {
                filtered = steps.filter(s => {
                    if (groupLabel === '(no type)') {
                        return !s.param_types || s.param_types.length === 0;
                    }
                    return s.param_types?.includes(groupLabel) ?? false;
                });
                break;
            }
            case GroupingMode.ByTag: {
                filtered = steps.filter(s => {
                    if (groupLabel === '(untagged)') {
                        return !s.tags || s.tags.length === 0;
                    }
                    return s.tags?.includes(groupLabel.replace(/^@/, '')) ?? false;
                });
                break;
            }
        }

        return filtered
            .sort((a, b) => a.pattern.localeCompare(b.pattern))
            .map(s => new StepBrowserItem(
                s.pattern,
                vscode.TreeItemCollapsibleState.None,
                s,
            ));
    }
}
```

### 8.3 — Verify

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest stepBrowserView --no-coverage 2>&1 | tail -20` — expected: **PASS**

### 8.4 — Commit

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add vscode-extension/src/stepBrowserView.ts vscode-extension/src/__tests__/stepBrowserView.test.ts`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "feat(browser): add StepBrowserProvider TreeDataProvider with file/type/tag grouping"`

---

## Task 9 — Phrasing linter severity graduation

This task requires `featureLinter.ts` from Plan A (Gherkin Format + Lint) to exist. If Plan A is not yet merged, skip this task and return to it after Plan A is complete.

### 9.1 — Test

- [ ] Create `vscode-extension/src/__tests__/featureLinter.phrasingSeverity.test.ts`:

```typescript
import { graduatePhrasingSeverity } from '../featureLinter';
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const IMPLEMENTED_STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [],
};

describe('graduatePhrasingSeverity', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([IMPLEMENTED_STEP]);
    });

    test('returns Warning when step text is unimplemented', () => {
        const sev = graduatePhrasingSeverity('a new unimplemented step here', cache);
        expect(sev).toBe('warning');
    });

    test('returns Information when step text is implemented', () => {
        const sev = graduatePhrasingSeverity('the state is NSW', cache);
        expect(sev).toBe('information');
    });
});
```

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureLinter.phrasingSeverity --no-coverage 2>&1 | tail -20` — expected: **FAIL** (featureLinter.ts does not exist yet; will pass after Plan A)

### 9.2 — Implement `graduatePhrasingSeverity` export in `featureLinter.ts`

When Plan A creates `featureLinter.ts`, add this export to it:

```typescript
import { StepCache } from './stepCache';

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
```

**Note:** The phrasing linter calls `graduatePhrasingSeverity(stepText, cache)` instead of always using `Warning`.

### 9.3 — Verify (after Plan A)

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest featureLinter --no-coverage 2>&1 | tail -20` — expected: **PASS**

### 9.4 — Commit (after Plan A)

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add vscode-extension/src/featureLinter.ts vscode-extension/src/__tests__/featureLinter.phrasingSeverity.test.ts`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "feat(linter): graduate phrasing violation severity based on StepCache membership"`

---

## Task 10 — Wire all providers into `extension.ts`

### 10.1 — Test: extension registers providers

- [ ] The existing extension activation test (if any) should still pass. No new test required here — the providers are integration-tested individually in Tasks 3–8.

### 10.2 — Update `extension.ts`

- [ ] Edit `vscode-extension/src/extension.ts`:

**Add imports** (after existing imports):

```typescript
import { FeatureHoverProvider } from './featureHover';
import { FeatureDefinitionProvider } from './featureDefinition';
import { FeatureReferencesProvider } from './featureReferences';
import { FeatureCodeActionsProvider } from './featureCodeActions';
import { StepBrowserProvider, GroupingMode } from './stepBrowserView';
```

**Replace the `FeatureDiagnostics` constructor call** (which now requires `getStepCache`):

Old:
```typescript
    const featureDiagnostics = new FeatureDiagnostics(
        () => vscode.workspace.workspaceFolders?.[0]?.uri,
        (uri) => getPythonInterpreter(uri),
    );
```

New:
```typescript
    const featureDiagnostics = new FeatureDiagnostics(
        () => vscode.workspace.workspaceFolders?.[0]?.uri,
        (uri) => getPythonInterpreter(uri),
        () => stepCache,
    );
```

**Add provider registrations** after the completion provider registration:

```typescript
    // Hover provider
    const hoverProvider = vscode.languages.registerHoverProvider(
        { pattern: '**/*.feature', scheme: 'file' },
        new FeatureHoverProvider(stepCache),
    );
    context.subscriptions.push(hoverProvider);

    // Go-to-definition provider
    const definitionProvider = vscode.languages.registerDefinitionProvider(
        { pattern: '**/*.feature', scheme: 'file' },
        new FeatureDefinitionProvider(stepCache),
    );
    context.subscriptions.push(definitionProvider);

    // Find references provider (works from both .feature and .py files)
    const referencesProvider = vscode.languages.registerReferenceProvider(
        [
            { pattern: '**/*.feature', scheme: 'file' },
            { pattern: '**/*.py', scheme: 'file' },
        ],
        new FeatureReferencesProvider(stepCache),
    );
    context.subscriptions.push(referencesProvider);

    // Code actions provider (step stub generation)
    const codeActionsProvider = vscode.languages.registerCodeActionsProvider(
        { pattern: '**/*.feature', scheme: 'file' },
        new FeatureCodeActionsProvider(stepCache),
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    );
    context.subscriptions.push(codeActionsProvider);

    // Step browser panel
    const stepBrowserProvider = new StepBrowserProvider(stepCache);
    const stepBrowserView = vscode.window.createTreeView('pytest-bdd-orama.stepBrowser', {
        treeDataProvider: stepBrowserProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(stepBrowserView);

    // Grouping mode toggle commands
    context.subscriptions.push(
        vscode.commands.registerCommand('pytest-bdd-orama.stepBrowser.groupByFile', () => {
            stepBrowserProvider.setGroupingMode(GroupingMode.ByFile);
        }),
        vscode.commands.registerCommand('pytest-bdd-orama.stepBrowser.groupByStepType', () => {
            stepBrowserProvider.setGroupingMode(GroupingMode.ByStepType);
        }),
        vscode.commands.registerCommand('pytest-bdd-orama.stepBrowser.groupByTag', () => {
            stepBrowserProvider.setGroupingMode(GroupingMode.ByTag);
        }),
    );
```

**After `stepCache.update(stepDefinitions)`** in `refreshWorkspace`, add usage count update:

```typescript
        stepCache.update(stepDefinitions);
        // Scan feature files to update usage counts
        void vscode.workspace.findFiles('**/*.feature', '**/node_modules/**').then(async (uris) => {
            const lines: string[] = [];
            for (const uri of uris) {
                try {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    for (let i = 0; i < doc.lineCount; i++) {
                        lines.push(doc.lineAt(i).text);
                    }
                } catch { /* skip unreadable files */ }
            }
            stepCache.updateUsageCounts(lines);
            stepBrowserProvider.refresh();
        });
```

**Note:** `stepBrowserProvider` must be declared in the outer `activate` scope. Move it before `refreshWorkspace` calls or forward-declare with `let stepBrowserProvider: StepBrowserProvider | undefined`.

The cleanest approach: declare `let stepBrowserProvider: StepBrowserProvider` before `refreshAllWorkspaces()` is called, then assign it in the provider registration block, and guard its use in the `refreshWorkspace` callback:

```typescript
    let stepBrowserProvider: StepBrowserProvider | undefined;

    // ... existing refresh and watcher setup ...

    stepBrowserProvider = new StepBrowserProvider(stepCache);
    // ... rest of provider registrations ...
```

In `refreshWorkspace`, replace `stepCache.update(stepDefinitions)` with:

```typescript
        stepCache.update(stepDefinitions);
        void vscode.workspace.findFiles('**/*.feature', '**/node_modules/**').then(async (uris) => {
            const lines: string[] = [];
            for (const uri of uris) {
                try {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    for (let i = 0; i < doc.lineCount; i++) {
                        lines.push(doc.lineAt(i).text);
                    }
                } catch { /* skip */ }
            }
            stepCache.updateUsageCounts(lines);
            stepBrowserProvider?.refresh();
        });
```

### 10.3 — Update `package.json` to declare the view and commands

- [ ] Edit `vscode-extension/package.json` — add to `contributes`:

```json
"views": {
    "explorer": [
        {
            "id": "pytest-bdd-orama.stepBrowser",
            "name": "Step Browser",
            "when": "pytest-bdd-orama.enabled"
        }
    ]
},
"commands": [
    {
        "command": "pytest-bdd-orama.stepBrowser.groupByFile",
        "title": "Group by File",
        "icon": "$(file)"
    },
    {
        "command": "pytest-bdd-orama.stepBrowser.groupByStepType",
        "title": "Group by Step Type",
        "icon": "$(symbol-class)"
    },
    {
        "command": "pytest-bdd-orama.stepBrowser.groupByTag",
        "title": "Group by Tag",
        "icon": "$(tag)"
    }
],
"menus": {
    "view/title": [
        {
            "command": "pytest-bdd-orama.stepBrowser.groupByFile",
            "when": "view == pytest-bdd-orama.stepBrowser",
            "group": "navigation"
        },
        {
            "command": "pytest-bdd-orama.stepBrowser.groupByStepType",
            "when": "view == pytest-bdd-orama.stepBrowser",
            "group": "navigation"
        },
        {
            "command": "pytest-bdd-orama.stepBrowser.groupByTag",
            "when": "view == pytest-bdd-orama.stepBrowser",
            "group": "navigation"
        }
    ]
}
```

### 10.4 — Run full test suite

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest --no-coverage 2>&1 | tail -30` — expected: **all suites PASS** (Tasks 1–8 tests green)

### 10.5 — Commit

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add vscode-extension/src/extension.ts vscode-extension/package.json`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "feat(extension): register hover, definition, references, code-actions, and step browser providers"`

---

## Task 11 — Final verification

### 11.1 — Run TypeScript compiler

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx tsc --noEmit 2>&1 | head -40` — expected: **no errors**

### 11.2 — Run full test suite

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npx jest --no-coverage 2>&1 | tail -20` — expected output includes:

```
Test Suites: X passed, X total
Tests:       X passed, X total
```

### 11.3 — Build extension package

- [ ] Run `cd /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66/vscode-extension && npm run compile 2>&1 | tail -10` — expected: **exits 0**

### 11.4 — Final commit

- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 add -A`
- [ ] `git -C /home/nokout/git-workspace/pytest-bdd-orama/.claude/worktrees/vigilant-williamson-401b66 commit -m "chore: Plan C implementation complete — step IDE features"`

---

## Summary

| Task | Feature | Files |
|---|---|---|
| 1 | StepCache enrichment + `matchPattern` + `updateUsageCounts` | `types.ts`, `stepCache.ts` |
| 2 | Usage-frequency ranking | `featureCompletion.ts` |
| 3 | Hover provider | `featureHover.ts` |
| 4 | Go-to-definition | `featureDefinition.ts` |
| 5 | Find references | `featureReferences.ts` |
| 6 | Unimplemented step linting | `featureDiagnostics.ts` |
| 7 | Step stub code action | `featureCodeActions.ts` |
| 8 | Step browser panel | `stepBrowserView.ts` |
| 9 | Phrasing linter severity graduation | `featureLinter.ts` (after Plan A) |
| 10 | Provider wiring | `extension.ts`, `package.json` |
| 11 | Final verification | — |
