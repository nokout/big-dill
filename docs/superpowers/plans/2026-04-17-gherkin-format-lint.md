# Gherkin Table Highlighting, Formatting & Linting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add semantic table highlighting, column-aligned formatting, and structural linting to the pytest-bdd-orama VS Code extension via a shared `@cucumber/gherkin` parse pipeline.

**Architecture:** A `GherkinParseCache` service parses `.feature` files once per document version and shares results across three providers: a `DocumentSemanticTokensProvider` distinguishing datatables from Examples tables (with quoted-string cell variants), a `DocumentFormattingEditProvider` applying per-type column alignment, and a structural `FeatureLinter` with five built-in rules. Core logic lives in pure functions (no VSCode dependency) for testability. Providers layer on top of cucumberautocomplete's TextMate grammar via `{ language: 'feature' }`.

**Tech Stack:** TypeScript, `@cucumber/gherkin` v37, `@cucumber/messages`, VSCode Extension API, Jest + ts-jest.

**Spec:** [`2026-04-17-gherkin-format-lint-design.md`](../specs/2026-04-17-gherkin-format-lint-design.md)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `vscode-extension/src/gherkinParser.ts` | Create | `parseSource()` + `GherkinParseCache` — version-keyed AST shared by all consumers |
| `vscode-extension/src/__tests__/gherkinParser.test.ts` | Create | Cache hit/miss and error recovery tests |
| `vscode-extension/src/featureSemanticTokens.ts` | Create | `buildTableTokens()` pure fn + `FeatureSemanticTokensProvider` wrapper |
| `vscode-extension/src/__tests__/featureSemanticTokens.test.ts` | Create | Token type, position, and quoted-string variant tests |
| `vscode-extension/src/featureFormatter.ts` | Create | `formatTables()` pure fn + `FeatureFormattingProvider` wrapper |
| `vscode-extension/src/__tests__/featureFormatter.test.ts` | Create | Per-type alignment rule tests |
| `vscode-extension/src/featureLinter.ts` | Create | Five exported rule functions + `FeatureLinter` coordinator |
| `vscode-extension/src/__tests__/featureLinter.test.ts` | Create | One describe block per rule |
| `vscode-extension/__mocks__/vscode.ts` | Modify | Add `SemanticTokensLegend`, `SemanticTokensBuilder`, `DiagnosticCollection`, `Diagnostic`, `DiagnosticSeverity`, `TextEdit` stubs |
| `vscode-extension/src/extension.ts` | Modify | Register three new providers on the shared cache |
| `vscode-extension/package.json` | Modify | `@cucumber/gherkin` dep, `semanticTokenTypes`, `semanticTokenScopes` |
| `playground/features/datatables/datatables.feature` | Create | Datatable highlighting + formatter exercise |
| `playground/features/lint_examples/lint_violations.feature` | Create | Intentional lint violations for manual verification |
| `playground/tests/conftest.py` | Modify | Replace built-in rules with a custom domain rule |

---

## Task 1: Shared Parse Cache

**Files:**
- Create: `vscode-extension/src/gherkinParser.ts`
- Create: `vscode-extension/src/__tests__/gherkinParser.test.ts`
- Modify: `vscode-extension/package.json` (add `@cucumber/gherkin`)

- [ ] **Step 1: Install the dependency**

```bash
cd vscode-extension && npm install @cucumber/gherkin
```

Verify `@cucumber/messages` arrived transitively:

```bash
node -e "require('@cucumber/messages'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 2: Write failing tests**

Create `vscode-extension/src/__tests__/gherkinParser.test.ts`:

```typescript
import { parseSource, GherkinParseCache } from '../gherkinParser';

const VALID = `Feature: F
  Scenario: S
    Given a step`;

const WITH_DATATABLE = `Feature: F
  Scenario: S
    Given data
      | key   | value |
      | hello | world |`;

describe('parseSource', () => {
    it('returns a GherkinDocument for valid input', () => {
        const { doc, errors } = parseSource(VALID);
        expect(doc).not.toBeNull();
        expect(doc?.feature?.name).toBe('F');
        expect(errors).toHaveLength(0);
    });

    it('returns errors without throwing for malformed input', () => {
        expect(() => parseSource('not gherkin {{{')).not.toThrow();
        const { errors } = parseSource('not gherkin {{{');
        expect(errors.length).toBeGreaterThan(0);
    });

    it('includes datatable rows in the AST', () => {
        const { doc } = parseSource(WITH_DATATABLE);
        const step = doc?.feature?.children[0]?.scenario?.steps[0];
        expect(step?.dataTable?.rows).toHaveLength(2);
    });
});

describe('GherkinParseCache', () => {
    it('returns the same result object on the second call with same version', () => {
        const cache = new GherkinParseCache();
        const doc = { uri: { fsPath: '/a.feature' }, version: 1, getText: () => VALID } as any;
        expect(cache.parse(doc)).toBe(cache.parse(doc));
    });

    it('re-parses when version number changes', () => {
        const cache = new GherkinParseCache();
        const v1 = { uri: { fsPath: '/a.feature' }, version: 1, getText: () => VALID } as any;
        const v2 = { uri: { fsPath: '/a.feature' }, version: 2, getText: () => VALID } as any;
        expect(cache.parse(v1)).not.toBe(cache.parse(v2));
    });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd vscode-extension && npx jest gherkinParser --no-coverage
```

Expected: FAIL — `Cannot find module '../gherkinParser'`

- [ ] **Step 4: Implement `gherkinParser.ts`**

Create `vscode-extension/src/gherkinParser.ts`:

```typescript
import { generateMessages } from '@cucumber/gherkin';
import type { GherkinDocument } from '@cucumber/messages';
import type * as vscode from 'vscode';

export interface ParseResult {
    doc: GherkinDocument | null;
    errors: string[];
}

let _counter = 0;
const newId = (): string => String(_counter++);

export function parseSource(source: string): ParseResult {
    const errors: string[] = [];
    let doc: GherkinDocument | null = null;

    const envelopes = generateMessages(
        source,
        'anonymous.feature',
        'text/x.cucumber.gherkin+plain',
        { includeSource: false, includeGherkinDocument: true, includePickles: false },
        newId,
    );

    for (const envelope of envelopes) {
        if (envelope.gherkinDocument) {
            doc = envelope.gherkinDocument;
        }
        if (envelope.parseError) {
            errors.push(envelope.parseError.message ?? 'Parse error');
        }
    }

    return { doc, errors };
}

export class GherkinParseCache {
    private cache = new Map<string, { version: number; result: ParseResult }>();

    parse(document: Pick<vscode.TextDocument, 'uri' | 'version' | 'getText'>): ParseResult {
        const key = document.uri.fsPath;
        const cached = this.cache.get(key);
        if (cached?.version === document.version) {
            return cached.result;
        }
        const result = parseSource(document.getText());
        this.cache.set(key, { version: document.version, result });
        return result;
    }

    invalidate(uri: Pick<vscode.Uri, 'fsPath'>): void {
        this.cache.delete(uri.fsPath);
    }
}
```

- [ ] **Step 5: Run tests — confirm pass**

```bash
cd vscode-extension && npx jest gherkinParser --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add vscode-extension/src/gherkinParser.ts \
        vscode-extension/src/__tests__/gherkinParser.test.ts \
        vscode-extension/package.json \
        vscode-extension/package-lock.json
git commit -m "feat: add @cucumber/gherkin parse cache shared by table providers"
```

---

## Task 2: Semantic Token Provider

**Files:**
- Create: `vscode-extension/src/featureSemanticTokens.ts`
- Create: `vscode-extension/src/__tests__/featureSemanticTokens.test.ts`
- Modify: `vscode-extension/__mocks__/vscode.ts`

- [ ] **Step 1: Add `SemanticTokensLegend` and `SemanticTokensBuilder` to the VSCode mock**

`featureSemanticTokens.ts` calls `new vscode.SemanticTokensLegend(...)` at module level,
so the mock must exist before any test imports the module.

In `vscode-extension/__mocks__/vscode.ts`, add after the existing exports:

```typescript
export class SemanticTokensLegend {
    tokenTypes: string[];
    tokenModifiers: string[];
    constructor(tokenTypes: string[], tokenModifiers: string[]) {
        this.tokenTypes = tokenTypes;
        this.tokenModifiers = tokenModifiers;
    }
}

export class SemanticTokensBuilder {
    private entries: Array<{ line: number; char: number; len: number; type: number; mod: number }> = [];
    constructor(public legend?: SemanticTokensLegend) {}
    push(line: number, char: number, len: number, type: number, mod: number): void {
        this.entries.push({ line, char, len, type, mod });
    }
    build() { return { data: this.entries }; }
}
```

- [ ] **Step 2: Write failing tests**

Create `vscode-extension/src/__tests__/featureSemanticTokens.test.ts`:

```typescript
import { buildTableTokens } from '../featureSemanticTokens';
import { parseSource } from '../gherkinParser';

function tokenize(source: string) {
    const { doc } = parseSource(source);
    return doc ? buildTableTokens(doc, source.split('\n')) : [];
}

const DATATABLE = `Feature: F
  Scenario: S
    Given data
      | key   | value   |
      | hello | "world" |`;

const EXAMPLES = `Feature: F
  Scenario Outline: S
    Given <key>
    Examples:
      | key     | count |
      | "alpha" | 1     |`;

describe('datatables', () => {
    it('emits gherkinDatatablePipe for each | character', () => {
        // 2 rows × 3 pipes = 6
        expect(tokenize(DATATABLE).filter(t => t.tokenType === 'gherkinDatatablePipe')).toHaveLength(6);
    });

    it('emits gherkinDatatableCell for unquoted values', () => {
        // key, value, hello = 3
        expect(tokenize(DATATABLE).filter(t => t.tokenType === 'gherkinDatatableCell')).toHaveLength(3);
    });

    it('emits gherkinDatatableCellString for quoted values', () => {
        // "world" = 1
        expect(tokenize(DATATABLE).filter(t => t.tokenType === 'gherkinDatatableCellString')).toHaveLength(1);
    });
});

describe('examples tables', () => {
    it('emits gherkinExamplesHeaderCell for header row', () => {
        // key, count = 2
        expect(tokenize(EXAMPLES).filter(t => t.tokenType === 'gherkinExamplesHeaderCell')).toHaveLength(2);
    });

    it('emits gherkinExamplesCell for unquoted body cells', () => {
        // 1 = 1
        expect(tokenize(EXAMPLES).filter(t => t.tokenType === 'gherkinExamplesCell')).toHaveLength(1);
    });

    it('emits gherkinExamplesCellString for quoted body cells', () => {
        // "alpha" = 1
        expect(tokenize(EXAMPLES).filter(t => t.tokenType === 'gherkinExamplesCellString')).toHaveLength(1);
    });

    it('emits gherkinExamplesPipe for | characters in examples', () => {
        // 2 rows × 3 pipes = 6
        expect(tokenize(EXAMPLES).filter(t => t.tokenType === 'gherkinExamplesPipe')).toHaveLength(6);
    });
});

describe('pipe positions are derived from source line scan', () => {
    it('locates first pipe at the correct column on an aligned table', () => {
        // Line: "      | key     | value   |"
        //        0123456  → pipe at col 6
        const source = `Feature: F\n  Scenario: S\n    Given d\n      | key     | value   |\n      | hello   | world   |`;
        const pipes = tokenize(source).filter(t => t.tokenType === 'gherkinDatatablePipe');
        const firstRowPipes = pipes.filter(t => t.line === 3);
        expect(firstRowPipes[0].startChar).toBe(6);
    });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd vscode-extension && npx jest featureSemanticTokens --no-coverage
```

Expected: FAIL — `Cannot find module '../featureSemanticTokens'`

- [ ] **Step 4: Implement `featureSemanticTokens.ts`**

Create `vscode-extension/src/featureSemanticTokens.ts`:

```typescript
import type { GherkinDocument, TableRow } from '@cucumber/messages';
import * as vscode from 'vscode';
import { GherkinParseCache } from './gherkinParser';

export const TOKEN_TYPES = [
    'gherkinDatatablePipe',
    'gherkinDatatableCell',
    'gherkinDatatableCellString',
    'gherkinExamplesPipe',
    'gherkinExamplesCell',
    'gherkinExamplesCellString',
    'gherkinExamplesHeaderCell',
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

export interface TokenEntry {
    line: number;       // 0-indexed
    startChar: number;  // 0-indexed
    length: number;
    tokenType: TokenType;
}

export const legend = new vscode.SemanticTokensLegend([...TOKEN_TYPES], []);

function isQuoted(value: string): boolean {
    const v = value.trim();
    return (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
           (v.startsWith("'") && v.endsWith("'") && v.length >= 2);
}

function emitRow(
    row: TableRow,
    lines: string[],
    pipeType: TokenType,
    cellType: TokenType,
    cellStringType: TokenType,
    out: TokenEntry[],
): void {
    const lineIndex = row.location.line - 1;
    const lineText = lines[lineIndex] ?? '';

    const pipePositions: number[] = [];
    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|') pipePositions.push(i);
    }

    for (const pos of pipePositions) {
        out.push({ line: lineIndex, startChar: pos, length: 1, tokenType: pipeType });
    }

    row.cells.forEach((cell, i) => {
        const start = pipePositions[i];
        const end = pipePositions[i + 1];
        if (start === undefined || end === undefined) return;
        out.push({
            line: lineIndex,
            startChar: start + 1,
            length: end - start - 1,
            tokenType: isQuoted(cell.value) ? cellStringType : cellType,
        });
    });
}

export function buildTableTokens(doc: GherkinDocument, lines: string[]): TokenEntry[] {
    const tokens: TokenEntry[] = [];

    for (const child of doc.feature?.children ?? []) {
        const scenario = child.scenario;
        if (!scenario) continue;

        for (const step of scenario.steps) {
            if (step.dataTable) {
                for (const row of step.dataTable.rows) {
                    emitRow(row, lines, 'gherkinDatatablePipe', 'gherkinDatatableCell', 'gherkinDatatableCellString', tokens);
                }
            }
        }

        for (const examples of scenario.examples) {
            if (examples.tableHeader) {
                emitRow(examples.tableHeader, lines, 'gherkinExamplesPipe', 'gherkinExamplesHeaderCell', 'gherkinExamplesHeaderCell', tokens);
            }
            for (const row of examples.tableBody) {
                emitRow(row, lines, 'gherkinExamplesPipe', 'gherkinExamplesCell', 'gherkinExamplesCellString', tokens);
            }
        }
    }

    return tokens;
}

const TYPE_INDEX = Object.fromEntries(TOKEN_TYPES.map((t, i) => [t, i])) as Record<TokenType, number>;

export class FeatureSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    constructor(private readonly cache: GherkinParseCache) {}

    provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
        const { doc } = this.cache.parse(document);
        const builder = new vscode.SemanticTokensBuilder(legend);
        if (!doc) return builder.build();

        const lines = document.getText().split('\n');
        for (const entry of buildTableTokens(doc, lines)) {
            builder.push(entry.line, entry.startChar, entry.length, TYPE_INDEX[entry.tokenType], 0);
        }
        return builder.build();
    }
}
```

- [ ] **Step 5: Run tests — confirm pass**

```bash
cd vscode-extension && npx jest featureSemanticTokens --no-coverage
```

Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add vscode-extension/src/featureSemanticTokens.ts \
        vscode-extension/src/__tests__/featureSemanticTokens.test.ts \
        vscode-extension/__mocks__/vscode.ts
git commit -m "feat: add semantic token provider for datatable and examples table highlighting"
```

---

## Task 3: Formatter

**Files:**
- Create: `vscode-extension/src/featureFormatter.ts`
- Create: `vscode-extension/src/__tests__/featureFormatter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `vscode-extension/src/__tests__/featureFormatter.test.ts`:

```typescript
import { formatTables, TextEditEntry } from '../featureFormatter';
import { parseSource } from '../gherkinParser';

function format(source: string): TextEditEntry[] {
    const { doc } = parseSource(source);
    return doc ? formatTables(doc, source.split('\n')) : [];
}

function apply(source: string, edits: TextEditEntry[]): string {
    const lines = source.split('\n');
    const sorted = [...edits].sort((a, b) => b.startLine - a.startLine);
    for (const edit of sorted) {
        lines.splice(edit.startLine, 1, edit.newText);
    }
    return lines.join('\n');
}

const UNALIGNED_DATATABLE = `Feature: F
  Scenario: S
    Given data
      | key | value |
      | hello | world |`;

const UNALIGNED_EXAMPLES = `Feature: F
  Scenario Outline: S
    Given <n>
    Examples:
      | n | label |
      | 1 | alpha |
      | 10 | beta |`;

const NUMERIC_EXAMPLES = `Feature: F
  Scenario Outline: S
    Given <n>
    Examples:
      | label | count |
      | alpha | 1     |
      | beta  | 200   |`;

describe('formatTables — datatables', () => {
    it('left-aligns all columns to max width', () => {
        const result = apply(UNALIGNED_DATATABLE, format(UNALIGNED_DATATABLE));
        expect(result).toContain('| key   | value |');
        expect(result).toContain('| hello | world |');
    });

    it('does not produce edits for non-table lines', () => {
        const edits = format(UNALIGNED_DATATABLE);
        expect(edits.every(e => {
            const line = UNALIGNED_DATATABLE.split('\n')[e.startLine];
            return line.trim().startsWith('|');
        })).toBe(true);
    });
});

describe('formatTables — examples tables', () => {
    it('aligns columns across header and body', () => {
        const result = apply(UNALIGNED_EXAMPLES, format(UNALIGNED_EXAMPLES));
        expect(result).toContain('| n  | label |');
        expect(result).toContain('| 1  | alpha |');
        expect(result).toContain('| 10 | beta  |');
    });

    it('right-aligns pure-numeric columns', () => {
        const result = apply(NUMERIC_EXAMPLES, format(NUMERIC_EXAMPLES));
        expect(result).toContain('|   count |');
        expect(result).toContain('|       1 |');
        expect(result).toContain('|     200 |');
    });

    it('left-aligns the header of a numeric column', () => {
        const result = apply(NUMERIC_EXAMPLES, format(NUMERIC_EXAMPLES));
        // header "count" left-aligned in its column width
        expect(result).toContain('| count |');
    });
});

describe('formatTables — edge cases', () => {
    it('returns no edits when the file is already correctly formatted', () => {
        const source = `Feature: F\n  Scenario: S\n    Given data\n      | key   | value |\n      | hello | world |`;
        expect(format(source)).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd vscode-extension && npx jest featureFormatter --no-coverage
```

Expected: FAIL — `Cannot find module '../featureFormatter'`

- [ ] **Step 3: Implement `featureFormatter.ts`**

Create `vscode-extension/src/featureFormatter.ts`:

```typescript
import type { GherkinDocument, TableRow } from '@cucumber/messages';
import * as vscode from 'vscode';
import { GherkinParseCache } from './gherkinParser';

export interface TextEditEntry {
    startLine: number;  // 0-indexed
    newText: string;
}

function isNumeric(v: string): boolean {
    return /^-?\d+(\.\d+)?$/.test(v.trim());
}

function indent(lineText: string): string {
    return lineText.match(/^(\s*)/)?.[1] ?? '';
}

function formatRows(rows: TableRow[], lines: string[], rightAlignNumericCols: boolean): TextEditEntry[] {
    if (rows.length === 0) return [];

    const colCount = rows[0].cells.length;
    const widths = Array<number>(colCount).fill(0);
    const allNumeric = Array<boolean>(colCount).fill(true);

    for (const row of rows) {
        row.cells.forEach((cell, i) => {
            widths[i] = Math.max(widths[i], cell.value.length);
            if (cell.value !== '' && !isNumeric(cell.value)) allNumeric[i] = false;
        });
    }

    const edits: TextEditEntry[] = [];
    for (const row of rows) {
        const lineIndex = row.location.line - 1;
        const original = lines[lineIndex] ?? '';
        const pad = indent(original);
        const cells = row.cells.map((cell, i) =>
            rightAlignNumericCols && allNumeric[i]
                ? cell.value.padStart(widths[i])
                : cell.value.padEnd(widths[i]),
        );
        const newText = `${pad}| ${cells.join(' | ')} |`;
        if (newText !== original) {
            edits.push({ startLine: lineIndex, newText });
        }
    }
    return edits;
}

export function formatTables(doc: GherkinDocument, lines: string[]): TextEditEntry[] {
    const edits: TextEditEntry[] = [];

    for (const child of doc.feature?.children ?? []) {
        const scenario = child.scenario;
        if (!scenario) continue;

        for (const step of scenario.steps) {
            if (step.dataTable) {
                edits.push(...formatRows(step.dataTable.rows, lines, false));
            }
        }

        for (const examples of scenario.examples) {
            const allRows = [
                ...(examples.tableHeader ? [examples.tableHeader] : []),
                ...examples.tableBody,
            ];
            edits.push(...formatRows(allRows, lines, true));
        }
    }

    return edits;
}

export class FeatureFormattingProvider implements vscode.DocumentFormattingEditProvider {
    constructor(private readonly cache: GherkinParseCache) {}

    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const { doc, errors } = this.cache.parse(document);
        if (!doc || errors.length > 0) return [];

        const lines = document.getText().split('\n');
        return formatTables(doc, lines).map((e) =>
            vscode.TextEdit.replace(
                new vscode.Range(e.startLine, 0, e.startLine, lines[e.startLine]?.length ?? 0),
                e.newText,
            ),
        );
    }
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd vscode-extension && npx jest featureFormatter --no-coverage
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add vscode-extension/src/featureFormatter.ts \
        vscode-extension/src/__tests__/featureFormatter.test.ts
git commit -m "feat: add document formatter with per-type column alignment for gherkin tables"
```

---

## Task 4: Structural Linter

**Files:**
- Create: `vscode-extension/src/featureLinter.ts`
- Create: `vscode-extension/src/__tests__/featureLinter.test.ts`
- Modify: `vscode-extension/__mocks__/vscode.ts`

- [ ] **Step 1: Add linter-related VSCode stubs to the mock**

In `vscode-extension/__mocks__/vscode.ts`, add after the existing exports:

```typescript
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };

export class Diagnostic {
    constructor(
        public range: any,
        public message: string,
        public severity?: number,
    ) {}
}

export const languages = {
    createDiagnosticCollection: jest.fn(() => ({
        set: jest.fn(),
        delete: jest.fn(),
        dispose: jest.fn(),
    })),
};
```

- [ ] **Step 2: Write failing tests**

Create `vscode-extension/src/__tests__/featureLinter.test.ts`:

```typescript
import {
    checkEmptyComments,
    checkDuplicateExampleRows,
    checkOversizedExampleTable,
    checkOutlineMissingExamples,
    checkEmptyExamplesBody,
} from '../featureLinter';
import { parseSource } from '../gherkinParser';

function run(source: string, rule: (doc: any, lines: string[]) => any[]) {
    const { doc } = parseSource(source);
    return doc ? rule(doc, source.split('\n')) : [];
}

describe('checkEmptyComments', () => {
    it('flags a line that is only #', () => {
        const diags = run(`Feature: F\n  #\n  Scenario: S\n    Given a step`, checkEmptyComments);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/empty comment/i);
        expect(diags[0].severity).toBe('warning');
    });

    it('does not flag a comment with content', () => {
        expect(run(`Feature: F\n  # valid\n  Scenario: S\n    Given a step`, checkEmptyComments)).toHaveLength(0);
    });
});

describe('checkDuplicateExampleRows', () => {
    it('flags duplicate rows in the same Examples block', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n      | 1 |\n      | 1 |`;
        const diags = run(source, checkDuplicateExampleRows);
        expect(diags).toHaveLength(1);
        expect(diags[0].severity).toBe('warning');
    });

    it('does not flag unique rows', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n      | 1 |\n      | 2 |`;
        expect(run(source, checkDuplicateExampleRows)).toHaveLength(0);
    });
});

describe('checkOversizedExampleTable', () => {
    it('flags an Examples block exceeding 20 rows', () => {
        const rows = Array.from({ length: 21 }, (_, i) => `      | ${i} |`).join('\n');
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n${rows}`;
        expect(run(source, checkOversizedExampleTable)).toHaveLength(1);
    });

    it('does not flag a table with exactly 20 rows', () => {
        const rows = Array.from({ length: 20 }, (_, i) => `      | ${i} |`).join('\n');
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n${rows}`;
        expect(run(source, checkOversizedExampleTable)).toHaveLength(0);
    });
});

describe('checkOutlineMissingExamples', () => {
    it('flags a Scenario Outline with no Examples block', () => {
        const diags = run(`Feature: F\n  Scenario Outline: S\n    Given <x>`, checkOutlineMissingExamples);
        expect(diags).toHaveLength(1);
        expect(diags[0].severity).toBe('error');
    });

    it('does not flag an outline with Examples', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkOutlineMissingExamples)).toHaveLength(0);
    });
});

describe('checkEmptyExamplesBody', () => {
    it('flags an Examples block with header but no data rows', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |`;
        const diags = run(source, checkEmptyExamplesBody);
        expect(diags).toHaveLength(1);
        expect(diags[0].severity).toBe('error');
    });

    it('does not flag Examples with data rows', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkEmptyExamplesBody)).toHaveLength(0);
    });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd vscode-extension && npx jest featureLinter --no-coverage
```

Expected: FAIL — `Cannot find module '../featureLinter'`

- [ ] **Step 4: Implement `featureLinter.ts`**

Create `vscode-extension/src/featureLinter.ts`:

```typescript
import type { GherkinDocument } from '@cucumber/messages';
import * as vscode from 'vscode';
import { GherkinParseCache } from './gherkinParser';

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

const RULES = [
    checkEmptyComments,
    checkDuplicateExampleRows,
    checkOversizedExampleTable,
    checkOutlineMissingExamples,
    checkEmptyExamplesBody,
];

export class FeatureLinter {
    private readonly collection: vscode.DiagnosticCollection;
    private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(private readonly cache: GherkinParseCache) {
        this.collection = vscode.languages.createDiagnosticCollection('pytest-bdd-orama-gherkin');
    }

    schedule(document: vscode.TextDocument): void {
        const key = document.uri.fsPath;
        const existing = this.pending.get(key);
        if (existing) clearTimeout(existing);
        this.pending.set(key, setTimeout(() => { this.lint(document); }, 300));
    }

    lint(document: vscode.TextDocument): void {
        const { doc } = this.cache.parse(document);
        if (!doc) { this.collection.delete(document.uri); return; }

        const lines = document.getText().split('\n');
        const entries = RULES.flatMap((rule) => rule(doc, lines));

        this.collection.set(
            document.uri,
            entries.map((e) => new vscode.Diagnostic(
                new vscode.Range(e.line, 0, e.line, Number.MAX_SAFE_INTEGER),
                e.message,
                e.severity === 'error' ? vscode.DiagnosticSeverity.Error
                    : e.severity === 'warning' ? vscode.DiagnosticSeverity.Warning
                    : vscode.DiagnosticSeverity.Information,
            )),
        );
    }

    dispose(): void {
        this.collection.dispose();
        for (const t of this.pending.values()) clearTimeout(t);
        this.pending.clear();
    }
}
```

- [ ] **Step 5: Run tests — confirm pass**

```bash
cd vscode-extension && npx jest featureLinter --no-coverage
```

Expected: PASS (10 tests across 5 describe blocks)

- [ ] **Step 6: Commit**

```bash
git add vscode-extension/src/featureLinter.ts \
        vscode-extension/src/__tests__/featureLinter.test.ts \
        vscode-extension/__mocks__/vscode.ts
git commit -m "feat: add structural gherkin linter with 5 built-in rules"
```

---

## Task 5: Wire Up Providers

**Files:**
- Modify: `vscode-extension/src/extension.ts`
- Modify: `vscode-extension/package.json`

- [ ] **Step 1: Declare token types and scopes in `package.json`**

Inside `"contributes": { ... }` in `vscode-extension/package.json`, add after the existing
`"configuration"` block:

```json
"semanticTokenTypes": [
  { "id": "gherkinDatatablePipe",       "description": "Pipe characters in step datatables" },
  { "id": "gherkinDatatableCell",       "description": "Cell content in step datatables" },
  { "id": "gherkinDatatableCellString", "description": "Quoted string cell content in step datatables" },
  { "id": "gherkinExamplesPipe",        "description": "Pipe characters in Examples tables" },
  { "id": "gherkinExamplesCell",        "description": "Cell content in Examples table body" },
  { "id": "gherkinExamplesCellString",  "description": "Quoted string cell content in Examples body" },
  { "id": "gherkinExamplesHeaderCell",  "description": "Cell content in Examples header row" }
],
"semanticTokenScopes": [
  {
    "scopes": {
      "gherkinDatatablePipe":       ["punctuation.separator"],
      "gherkinDatatableCell":       ["string.unquoted"],
      "gherkinDatatableCellString": ["string.quoted.double"],
      "gherkinExamplesPipe":        ["punctuation.separator"],
      "gherkinExamplesCell":        ["variable.other"],
      "gherkinExamplesCellString":  ["string.quoted.double"],
      "gherkinExamplesHeaderCell":  ["entity.name.tag"]
    }
  }
]
```

- [ ] **Step 2: Register providers in `extension.ts`**

Add imports at the top of `vscode-extension/src/extension.ts` (after existing imports):

```typescript
import { GherkinParseCache } from './gherkinParser';
import { FeatureSemanticTokensProvider, legend } from './featureSemanticTokens';
import { FeatureFormattingProvider } from './featureFormatter';
import { FeatureLinter } from './featureLinter';
```

Inside `activate()`, after the existing `completionProvider` registration (around line 147),
add:

```typescript
const parseCache = new GherkinParseCache();

context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
        { language: 'feature' },
        new FeatureSemanticTokensProvider(parseCache),
        legend,
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
        { language: 'feature' },
        new FeatureFormattingProvider(parseCache),
    ),
);

const featureLinter = new FeatureLinter(parseCache);
context.subscriptions.push(featureLinter);

vscode.workspace.onDidOpenTextDocument((doc) => {
    if (doc.fileName.endsWith('.feature')) featureLinter.schedule(doc);
}, null, context.subscriptions);

vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.fileName.endsWith('.feature')) featureLinter.schedule(e.document);
}, null, context.subscriptions);
```

- [ ] **Step 3: Run the full test suite**

```bash
cd vscode-extension && npx jest --no-coverage
```

Expected: all tests pass, no regressions.

- [ ] **Step 4: Compile TypeScript**

```bash
cd vscode-extension && npm run compile
```

Expected: zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add vscode-extension/src/extension.ts vscode-extension/package.json
git commit -m "feat: register semantic tokens, formatter and linter providers in extension"
```

---

## Task 6: Playground Updates

**Files:**
- Create: `playground/features/datatables/datatables.feature`
- Create: `playground/features/lint_examples/lint_violations.feature`
- Modify: `playground/tests/conftest.py`

- [ ] **Step 1: Create the datatable playground feature**

Create `playground/features/datatables/datatables.feature`:

```gherkin
Feature: Datatable examples
  Demonstrates step-level datatables. Unquoted values, quoted strings, and numerics
  should each appear with distinct colors when the extension is active.

  Scenario: Configure system from table
    Given the system is configured with
      | key     | value   |
      | timeout | "30s"   |
      | retries | 3       |
      | mode    | "batch" |

  Scenario: Validate multiple records
    Given the following records exist
      | id | name    | active |
      | 1  | "Alice" | true   |
      | 2  | "Bob"   | false  |
```

- [ ] **Step 2: Create the lint violations playground feature**

Create `playground/features/lint_examples/lint_violations.feature`:

```gherkin
Feature: Lint violation examples
  Each scenario below intentionally triggers one built-in linter rule.
  Open this file in VS Code and check the Problems panel.

  #
  # ^ empty comment above triggers: empty-comment

  Scenario Outline: Duplicate rows
    Given value is <x>
    Examples:
      | x |
      | 1 |
      | 1 |
      # ^ second row is a duplicate — triggers: duplicate-example-rows

  Scenario Outline: Oversized table
    Given item <n>
    Examples:
      | n  |
      | 1  | | 2  | | 3  | | 4  | | 5  |
      | 6  | | 7  | | 8  | | 9  | | 10 |
      | 11 | | 12 | | 13 | | 14 | | 15 |
      | 16 | | 17 | | 18 | | 19 | | 20 |
      | 21 |
      # ^ 21 rows — triggers: oversized-example-table

  Scenario Outline: Missing examples block
    Given value is <x>
    # ^ no Examples block at all — triggers: outline-missing-examples

  Scenario Outline: Empty examples body
    Given value is <x>
    Examples:
      | x |
      # ^ header only, no data rows — triggers: empty-examples-body
```

> **Note:** The oversized table rows above are written one-per-line in the actual file
> (each `| n |` on its own line). The compact representation above is for readability
> in this plan only.

Replace the step above with the full 21 individual rows:

```gherkin
    Examples:
      | n  |
      | 1  |
      | 2  |
      | 3  |
      | 4  |
      | 5  |
      | 6  |
      | 7  |
      | 8  |
      | 9  |
      | 10 |
      | 11 |
      | 12 |
      | 13 |
      | 14 |
      | 15 |
      | 16 |
      | 17 |
      | 18 |
      | 19 |
      | 20 |
      | 21 |
```

- [ ] **Step 3: Update `playground/tests/conftest.py`**

Replace lines 163–190 (the `pytest_bdd_orama_lint_outline` block) with:

```python
# ---------------------------------------------------------------------------
# pytest-bdd-orama hook — custom lint rule (demonstrates user-extensible hooks)
#
# Built-in TypeScript linter handles: empty comments, duplicate example rows,
# oversized tables, missing Examples blocks, empty Examples bodies.
# Use this hook for domain-specific rules that belong to your project.
# ---------------------------------------------------------------------------
from pytest_bdd_orama.lint_types import LintDiagnostic


def pytest_bdd_orama_lint_outline(scenario, examples):
    """Require that all Scenario Outline names begin with a capital letter."""
    if scenario.name and not scenario.name[0].isupper():
        return [LintDiagnostic(
            message=f"Scenario Outline name must start with a capital letter: '{scenario.name}'",
            severity="warning",
        )]
    return []
```

- [ ] **Step 4: Commit**

```bash
git add playground/features/datatables/datatables.feature \
        playground/features/lint_examples/lint_violations.feature \
        playground/tests/conftest.py
git commit -m "chore(playground): add datatable and lint violation examples, update hookspec demo"
```
