# Gherkin Language Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the extension self-contained for Gherkin authoring — own syntax highlighting, language configuration, snippets, table highlighting, document formatting, structural linting, document outline, tag allowlist validation, and step phrasing validation, without requiring any external Gherkin extension.

**Architecture:** Three layers. Layer 0 is declarative (TextMate grammar + language config + snippets declared in `package.json`). Pipeline 1 is programmatic TypeScript: a shared `GherkinParseCache` feeds a semantic token provider (table cell precision), a formatter (column alignment), a document symbol provider (Outline panel), and a `FeatureLinter` that runs all structural, tag allowlist, and phrasing rules. All Pipeline 1 providers share a single parse per edit. No Python subprocess involved.

**Tech Stack:** TypeScript, `@cucumber/gherkin` v37, `@cucumber/messages`, VS Code Extension API (`DocumentSemanticTokensProvider`, `DocumentFormattingEditProvider`, `DocumentSymbolProvider`, `DiagnosticCollection`), Jest + ts-jest.

**Note on Tasks 2–5:** These implement the FORMAT_LINT spec and are fully detailed in [`docs/superpowers/plans/2026-04-17-gherkin-format-lint.md`](./2026-04-17-gherkin-format-lint.md) (Tasks 1–6). Complete those tasks first, then continue from Task 6 in this plan. The file map below is the complete picture across both plans.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `vscode-extension/syntaxes/gherkin.tmLanguage.json` | Create | TextMate grammar — baseline keyword/tag/string/docstring highlighting + embedded language injection |
| `vscode-extension/language-configuration.json` | Create | Bracket matching, `#` comment toggle, auto-indent rules |
| `vscode-extension/snippets/gherkin.json` | Create | Static snippet templates: Feature, Scenario, Scenario Outline, Background |
| `vscode-extension/src/gherkinParser.ts` | Create | `parseSource()` + `GherkinParseCache` — version-keyed AST shared by all consumers |
| `vscode-extension/src/__tests__/gherkinParser.test.ts` | Create | Cache hit/miss and error recovery tests |
| `vscode-extension/src/featureSemanticTokens.ts` | Create | `buildTableTokens()` pure fn + `FeatureSemanticTokensProvider` wrapper |
| `vscode-extension/src/__tests__/featureSemanticTokens.test.ts` | Create | Token type, position, and quoted-string variant tests |
| `vscode-extension/src/featureFormatter.ts` | Create | `formatTables()` pure fn + `FeatureFormattingProvider` wrapper |
| `vscode-extension/src/__tests__/featureFormatter.test.ts` | Create | Per-type alignment rule tests |
| `vscode-extension/src/featureLinter.ts` | Create | Five structural rule functions + tag allowlist rule + phrasing rule runner + `FeatureLinter` coordinator |
| `vscode-extension/src/__tests__/featureLinter.test.ts` | Create | One describe block per rule |
| `vscode-extension/src/featureSymbols.ts` | Create | `FeatureSymbolsProvider` — `DocumentSymbolProvider` for Outline panel + breadcrumb |
| `vscode-extension/src/__tests__/featureSymbols.test.ts` | Create | Feature → Scenario hierarchy tests |
| `vscode-extension/__mocks__/vscode.ts` | Modify | Add `SemanticTokensLegend`, `SemanticTokensBuilder`, `DiagnosticCollection`, `Diagnostic`, `DiagnosticSeverity`, `TextEdit`, `DocumentSymbol`, `SymbolKind` stubs |
| `vscode-extension/src/extension.ts` | Modify | Register all new providers on the shared parse cache |
| `vscode-extension/package.json` | Modify | Language registration, grammar, language config, snippets, `@cucumber/gherkin` dep, `semanticTokenTypes`, `semanticTokenScopes`, `configuration` schema |
| `playground/features/datatables/datatables.feature` | Create | Datatable highlighting + formatter exercise |
| `playground/features/lint_examples/lint_violations.feature` | Create | Intentional lint violations for manual verification |
| `playground/tests/conftest.py` | Modify | Replace built-in rules with a custom domain rule |

---

## Task 1: TextMate Grammar, Language Config, and Snippets

**Files:**
- Create: `vscode-extension/syntaxes/gherkin.tmLanguage.json`
- Create: `vscode-extension/language-configuration.json`
- Create: `vscode-extension/snippets/gherkin.json`
- Modify: `vscode-extension/package.json`

This task is purely declarative — no TypeScript code. Verify by opening a `.feature` file
in VS Code and confirming colours appear without any external Gherkin extension installed.

- [ ] **Step 1: Register the language, grammar, language config, and snippets in `package.json`**

In `vscode-extension/package.json`, inside `"contributes": {}`, add:

```json
"languages": [
  {
    "id": "feature",
    "aliases": ["Gherkin", "feature"],
    "extensions": [".feature"],
    "configuration": "./language-configuration.json",
    "icon": {
      "light": "./icons/feature-light.svg",
      "dark": "./icons/feature-dark.svg"
    }
  }
],
"grammars": [
  {
    "language": "feature",
    "scopeName": "text.gherkin",
    "path": "./syntaxes/gherkin.tmLanguage.json",
    "embeddedLanguages": {
      "meta.embedded.yaml": "yaml",
      "meta.embedded.json": "json",
      "meta.embedded.python": "python",
      "meta.embedded.xml": "xml",
      "meta.embedded.sql": "sql",
      "meta.embedded.javascript": "javascript",
      "meta.embedded.typescript": "typescript",
      "meta.embedded.plaintext": "plaintext"
    }
  }
],
"snippets": [
  {
    "language": "feature",
    "path": "./snippets/gherkin.json"
  }
]
```

Also add in `"contributes"` if not present:

```json
"configuration": {
  "title": "pytest-bdd-orama",
  "properties": {
    "pytest-bdd-orama.allowedTags": {
      "type": "array",
      "items": { "type": "string" },
      "default": [],
      "description": "If non-empty, any @tag not in this list will be flagged as a warning. Leave empty to disable tag validation."
    },
    "pytest-bdd-orama.phrasingRules": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "pattern": { "type": "string", "description": "Regex tested against the step text (excluding the Given/When/Then keyword)" },
          "message": { "type": "string", "description": "Diagnostic message shown when the pattern matches" }
        },
        "required": ["pattern", "message"]
      },
      "default": [],
      "description": "Step text phrasing rules. Each rule flags steps whose text matches the regex pattern."
    }
  }
}
```

- [ ] **Step 2: Create `language-configuration.json`**

Create `vscode-extension/language-configuration.json`:

```json
{
  "comments": {
    "lineComment": "#"
  },
  "brackets": [
    ["{", "}"],
    ["[", "]"],
    ["\"", "\""]
  ],
  "autoClosingPairs": [
    { "open": "\"", "close": "\"" },
    { "open": "'", "close": "'" },
    { "open": "{", "close": "}" }
  ],
  "indentationRules": {
    "increaseIndentPattern": "^\\s*(Feature|Rule|Background|Scenario(\\s+Outline)?|Examples)\\s*:",
    "decreaseIndentPattern": "^\\s*$"
  },
  "wordPattern": "[\\w@]+"
}
```

- [ ] **Step 3: Create `snippets/gherkin.json`**

Create `vscode-extension/snippets/gherkin.json`:

```json
{
  "Feature": {
    "prefix": "feature",
    "body": [
      "Feature: ${1:Feature name}",
      "  ${2:As a user}",
      "  ${3:I want to}",
      "  ${4:So that}",
      "",
      "  Scenario: ${5:Scenario name}",
      "    Given ${6:a precondition}",
      "    When ${7:an action}",
      "    Then ${8:an outcome}"
    ],
    "description": "Gherkin Feature template"
  },
  "Scenario": {
    "prefix": "scenario",
    "body": [
      "Scenario: ${1:Scenario name}",
      "  Given ${2:a precondition}",
      "  When ${3:an action}",
      "  Then ${4:an outcome}"
    ],
    "description": "Gherkin Scenario template"
  },
  "Scenario Outline": {
    "prefix": "outline",
    "body": [
      "Scenario Outline: ${1:Scenario name}",
      "  Given ${2:a precondition with} <${3:param}>",
      "  When ${4:an action}",
      "  Then ${5:an outcome}",
      "",
      "  Examples:",
      "    | ${3:param} |",
      "    | ${6:value} |"
    ],
    "description": "Gherkin Scenario Outline template"
  },
  "Background": {
    "prefix": "background",
    "body": [
      "Background:",
      "  Given ${1:a precondition}"
    ],
    "description": "Gherkin Background template"
  },
  "Examples": {
    "prefix": "examples",
    "body": [
      "Examples:",
      "  | ${1:column} |",
      "  | ${2:value}  |"
    ],
    "description": "Gherkin Examples table template"
  }
}
```

- [ ] **Step 4: Create `syntaxes/gherkin.tmLanguage.json`**

Create `vscode-extension/syntaxes/gherkin.tmLanguage.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "Gherkin",
  "scopeName": "text.gherkin",
  "patterns": [
    { "include": "#comment" },
    { "include": "#tag" },
    { "include": "#feature-keyword" },
    { "include": "#scenario-keyword" },
    { "include": "#step-keyword" },
    { "include": "#examples-keyword" },
    { "include": "#docstring-backtick" },
    { "include": "#docstring-triple-quote" },
    { "include": "#table-row" },
    { "include": "#placeholder" },
    { "include": "#string-double" },
    { "include": "#string-single" }
  ],
  "repository": {
    "comment": {
      "name": "comment.line.number-sign.gherkin",
      "match": "^\\s*#.*$"
    },
    "tag": {
      "name": "entity.name.tag.gherkin",
      "match": "@[\\w-]+"
    },
    "feature-keyword": {
      "match": "^(Feature|Rule|Background)\\s*(:)",
      "captures": {
        "1": { "name": "keyword.control.gherkin" },
        "2": { "name": "punctuation.separator.gherkin" }
      }
    },
    "scenario-keyword": {
      "match": "^\\s*(Scenario(?:\\s+Outline)?|Example)\\s*(:)",
      "captures": {
        "1": { "name": "keyword.control.gherkin" },
        "2": { "name": "punctuation.separator.gherkin" }
      }
    },
    "step-keyword": {
      "match": "^\\s*(Given|When|Then|And|But)\\b",
      "captures": {
        "1": { "name": "keyword.other.step.gherkin" }
      }
    },
    "examples-keyword": {
      "match": "^\\s*(Examples|Scenarios)\\s*(:)",
      "captures": {
        "1": { "name": "keyword.control.gherkin" },
        "2": { "name": "punctuation.separator.gherkin" }
      }
    },
    "docstring-backtick": {
      "name": "meta.embedded.block.gherkin",
      "begin": "^(\\s*)```(yaml|json|python|xml|sql|javascript|typescript|plaintext|[\\w-]+)?$",
      "end": "^\\1```$",
      "beginCaptures": {
        "2": { "name": "entity.name.type.gherkin" }
      },
      "patterns": [
        {
          "begin": "(?<=```yaml\\n)",
          "end": "(?=\\s*```)",
          "name": "meta.embedded.yaml",
          "contentName": "source.yaml",
          "patterns": [{ "include": "source.yaml" }]
        },
        {
          "begin": "(?<=```json\\n)",
          "end": "(?=\\s*```)",
          "name": "meta.embedded.json",
          "contentName": "source.json",
          "patterns": [{ "include": "source.json" }]
        },
        {
          "begin": "(?<=```python\\n)",
          "end": "(?=\\s*```)",
          "name": "meta.embedded.python",
          "contentName": "source.python",
          "patterns": [{ "include": "source.python" }]
        }
      ]
    },
    "docstring-triple-quote": {
      "name": "string.unquoted.docstring.gherkin",
      "begin": "^\\s*\"\"\"(\\w+)?",
      "end": "^\\s*\"\"\"",
      "beginCaptures": {
        "1": { "name": "entity.name.type.gherkin" }
      },
      "patterns": [
        { "include": "#placeholder" }
      ]
    },
    "table-row": {
      "name": "meta.table.row.gherkin",
      "match": "^\\s*\\|.*\\|\\s*$",
      "captures": {
        "0": { "name": "string.unquoted.table.gherkin" }
      }
    },
    "placeholder": {
      "name": "variable.parameter.gherkin",
      "match": "<[^>]+>"
    },
    "string-double": {
      "name": "string.quoted.double.gherkin",
      "match": "\"[^\"]*\""
    },
    "string-single": {
      "name": "string.quoted.single.gherkin",
      "match": "'[^']*'"
    }
  }
}
```

> **Note on embedded language injection:** The backtick pattern above uses lookahead
> matching for yaml/json/python. The `embeddedLanguages` map in `package.json` binds the
> `meta.embedded.*` scope names to VS Code language IDs, which triggers VS Code to apply
> that language's grammar to the span. For languages beyond yaml/json/python, the content
> receives no sub-highlighting (falls through to the generic docstring style) — this is
> acceptable for the initial implementation.

- [ ] **Step 5: Create placeholder SVG icons (prevent load warning)**

```bash
mkdir -p vscode-extension/icons
# Minimal valid SVGs to prevent file-not-found warnings
cat > vscode-extension/icons/feature-light.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text y="13" font-size="13">🥒</text></svg>
EOF
cat > vscode-extension/icons/feature-dark.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text y="13" font-size="13">🥒</text></svg>
EOF
```

- [ ] **Step 6: Commit**

```bash
git add vscode-extension/syntaxes/gherkin.tmLanguage.json \
        vscode-extension/language-configuration.json \
        vscode-extension/snippets/gherkin.json \
        vscode-extension/icons/ \
        vscode-extension/package.json
git commit -m "feat: add textmate grammar, language config, and snippet templates for gherkin"
```

---

## Tasks 2–5: FORMAT_LINT Foundation

> See [`docs/superpowers/plans/2026-04-17-gherkin-format-lint.md`](./2026-04-17-gherkin-format-lint.md), Tasks 1–5.
>
> These implement: shared parse cache (`gherkinParser.ts`), semantic token provider
> (`featureSemanticTokens.ts`), document formatter (`featureFormatter.ts`), structural
> linter with 5 rules (`featureLinter.ts`), and wiring in `extension.ts`.
>
> Complete all five tasks and their commits before continuing to Task 6 below.

---

## Task 6: Document Outline

**Files:**
- Create: `vscode-extension/src/featureSymbols.ts`
- Create: `vscode-extension/src/__tests__/featureSymbols.test.ts`
- Modify: `vscode-extension/__mocks__/vscode.ts`
- Modify: `vscode-extension/src/extension.ts`

- [ ] **Step 1: Add `DocumentSymbol` and `SymbolKind` to the VS Code mock**

In `vscode-extension/__mocks__/vscode.ts`, add after the existing exports:

```typescript
export const SymbolKind = {
    File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4,
    Method: 5, Property: 6, Field: 7, Constructor: 8, Enum: 9,
    Interface: 10, Function: 11, Variable: 12, Constant: 13,
    String: 14, Number: 15, Boolean: 16, Array: 17, Object: 18,
    Key: 19, Null: 20, EnumMember: 21, Struct: 22, Event: 23,
    Operator: 24, TypeParameter: 25,
};

export class DocumentSymbol {
    children: DocumentSymbol[] = [];
    constructor(
        public name: string,
        public detail: string,
        public kind: number,
        public range: any,
        public selectionRange: any,
    ) {}
}
```

- [ ] **Step 2: Write failing tests**

Create `vscode-extension/src/__tests__/featureSymbols.test.ts`:

```typescript
import { buildSymbols } from '../featureSymbols';
import { parseSource } from '../gherkinParser';

function symbols(source: string) {
    const { doc } = parseSource(source);
    return doc ? buildSymbols(doc) : [];
}

const SIMPLE = `Feature: Login
  Scenario: Valid login
    Given a user
  Scenario: Invalid login
    Given a bad user`;

const WITH_OUTLINE = `Feature: Search
  Scenario Outline: Search by <term>
    Given term <term>
    Examples:
      | term |
      | foo  |`;

const WITH_TAGS = `Feature: Tagged
  @smoke
  Scenario: Tagged scenario
    Given a step`;

describe('buildSymbols', () => {
    it('returns one top-level symbol for the Feature', () => {
        expect(symbols(SIMPLE)).toHaveLength(1);
        expect(symbols(SIMPLE)[0].name).toBe('Login');
    });

    it('returns Scenario children under the Feature', () => {
        const children = symbols(SIMPLE)[0].children;
        expect(children).toHaveLength(2);
        expect(children[0].name).toBe('Valid login');
        expect(children[1].name).toBe('Invalid login');
    });

    it('includes Scenario Outline as a child', () => {
        const children = symbols(WITH_OUTLINE)[0].children;
        expect(children[0].name).toBe('Search by <term>');
    });

    it('includes tag in detail when present', () => {
        const children = symbols(WITH_TAGS)[0].children;
        expect(children[0].detail).toContain('@smoke');
    });

    it('returns empty array when doc has no feature', () => {
        expect(symbols('')).toHaveLength(0);
    });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd vscode-extension && npx jest featureSymbols --no-coverage
```

Expected: FAIL — `Cannot find module '../featureSymbols'`

- [ ] **Step 4: Implement `featureSymbols.ts`**

Create `vscode-extension/src/featureSymbols.ts`:

```typescript
import type { GherkinDocument } from '@cucumber/messages';
import * as vscode from 'vscode';
import { GherkinParseCache } from './gherkinParser';

export function buildSymbols(doc: GherkinDocument): vscode.DocumentSymbol[] {
    if (!doc.feature) return [];

    const feature = doc.feature;
    const featureStart = (feature.location?.line ?? 1) - 1;
    const featureRange = new vscode.Range(featureStart, 0, featureStart, Number.MAX_SAFE_INTEGER);

    const featureSymbol = new vscode.DocumentSymbol(
        feature.name || '(unnamed feature)',
        '',
        vscode.SymbolKind.Module,
        featureRange,
        featureRange,
    );

    for (const child of feature.children) {
        const scenario = child.scenario ?? child.background;
        if (!scenario) continue;

        const lineIndex = (scenario.location?.line ?? 1) - 1;
        const range = new vscode.Range(lineIndex, 0, lineIndex, Number.MAX_SAFE_INTEGER);

        const tags = ('tags' in scenario ? scenario.tags ?? [] : [])
            .map((t) => t.name)
            .join(' ');

        const symbol = new vscode.DocumentSymbol(
            scenario.name || (child.background ? '(background)' : '(unnamed scenario)'),
            tags,
            vscode.SymbolKind.Function,
            range,
            range,
        );
        featureSymbol.children.push(symbol);
    }

    return [featureSymbol];
}

export class FeatureSymbolsProvider implements vscode.DocumentSymbolProvider {
    constructor(private readonly cache: GherkinParseCache) {}

    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const { doc } = this.cache.parse(document);
        return doc ? buildSymbols(doc) : [];
    }
}
```

- [ ] **Step 5: Run tests — confirm pass**

```bash
cd vscode-extension && npx jest featureSymbols --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 6: Register the provider in `extension.ts`**

Add import at top of `vscode-extension/src/extension.ts`:

```typescript
import { FeatureSymbolsProvider } from './featureSymbols';
```

Inside `activate()`, in the block where the other Pipeline 1 providers are registered (the `context.subscriptions.push(...)` for semantic tokens and formatter), add:

```typescript
vscode.languages.registerDocumentSymbolProvider(
    { language: 'feature' },
    new FeatureSymbolsProvider(parseCache),
),
```

- [ ] **Step 7: Run full suite + compile**

```bash
cd vscode-extension && npx jest --no-coverage && npm run compile
```

Expected: all tests pass, zero TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add vscode-extension/src/featureSymbols.ts \
        vscode-extension/src/__tests__/featureSymbols.test.ts \
        vscode-extension/__mocks__/vscode.ts \
        vscode-extension/src/extension.ts
git commit -m "feat: add document symbol provider for gherkin feature/scenario outline"
```

---

## Task 7: Tag Allowlist Validation

**Files:**
- Modify: `vscode-extension/src/featureLinter.ts`
- Modify: `vscode-extension/src/__tests__/featureLinter.test.ts`

The tag allowlist is a new lint rule added to `featureLinter.ts`. It reads
`pytest-bdd-orama.allowedTags` from VS Code workspace configuration. If the list is empty,
the rule is a no-op.

- [ ] **Step 1: Write failing tests**

First update the import at the top of `vscode-extension/src/__tests__/featureLinter.test.ts`
to include `checkTagAllowlist`:

```typescript
import {
    checkEmptyComments,
    checkDuplicateExampleRows,
    checkOversizedExampleTable,
    checkOutlineMissingExamples,
    checkEmptyExamplesBody,
    checkTagAllowlist,
} from '../featureLinter';
```

Then add to the bottom of the file:

```typescript
describe('checkTagAllowlist', () => {
    const featureWithTags = `Feature: F
  @smoke @regression
  Scenario: S
    Given a step`;

    it('returns no diagnostics when allowedTags is empty', () => {
        const { doc } = parseSource(featureWithTags);
        expect(checkTagAllowlist(doc!, featureWithTags.split('\n'), [])).toHaveLength(0);
    });

    it('returns no diagnostics when all tags are allowed', () => {
        const { doc } = parseSource(featureWithTags);
        const diags = checkTagAllowlist(doc!, featureWithTags.split('\n'), ['@smoke', '@regression']);
        expect(diags).toHaveLength(0);
    });

    it('flags tags not in the allowlist', () => {
        const { doc } = parseSource(featureWithTags);
        const diags = checkTagAllowlist(doc!, featureWithTags.split('\n'), ['@smoke']);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/@regression/);
        expect(diags[0].severity).toBe('warning');
    });

    it('checks tags on both feature and scenario', () => {
        const source = `@featuretag\nFeature: F\n  @scenariotag\n  Scenario: S\n    Given a step`;
        const { doc } = parseSource(source);
        const diags = checkTagAllowlist(doc!, source.split('\n'), ['@featuretag']);
        expect(diags.map(d => d.message)).toEqual(expect.arrayContaining([expect.stringContaining('@scenariotag')]));
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd vscode-extension && npx jest featureLinter --no-coverage
```

Expected: FAIL — `checkTagAllowlist is not exported`

- [ ] **Step 3: Add `checkTagAllowlist` to `featureLinter.ts`**

Add after the existing `checkEmptyExamplesBody` function in `vscode-extension/src/featureLinter.ts`:

```typescript
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
```

- [ ] **Step 4: Read the allowlist from configuration in `FeatureLinter.lint()`**

In `vscode-extension/src/featureLinter.ts`, update the `lint()` method to read configuration
and pass the allowlist to `checkTagAllowlist`:

```typescript
lint(document: vscode.TextDocument): void {
    const { doc } = this.cache.parse(document);
    if (!doc) { this.collection.delete(document.uri); return; }

    const lines = document.getText().split('\n');
    const config = vscode.workspace.getConfiguration('pytest-bdd-orama');
    const allowedTags: string[] = config.get('allowedTags') ?? [];

    const entries = [
        ...RULES.flatMap((rule) => rule(doc, lines)),
        ...checkTagAllowlist(doc, lines, allowedTags),
    ];

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
```

Also add `workspace` to the VS Code mock in `vscode-extension/__mocks__/vscode.ts`:

```typescript
export const workspace = {
    getConfiguration: jest.fn(() => ({
        get: jest.fn(() => []),
    })),
};
```

- [ ] **Step 5: Run tests — confirm pass**

```bash
cd vscode-extension && npx jest featureLinter --no-coverage
```

Expected: PASS (14 tests across 6 describe blocks)

- [ ] **Step 6: Commit**

```bash
git add vscode-extension/src/featureLinter.ts \
        vscode-extension/src/__tests__/featureLinter.test.ts \
        vscode-extension/__mocks__/vscode.ts
git commit -m "feat: add tag allowlist validation rule to gherkin linter"
```

---

## Task 8: Step Phrasing Validation

**Files:**
- Modify: `vscode-extension/src/featureLinter.ts`
- Modify: `vscode-extension/src/__tests__/featureLinter.test.ts`

Phrasing rules are regex patterns configured in `pytest-bdd-orama.phrasingRules`. Each rule
matches against the step text (excluding the Given/When/Then keyword). In this plan all
violations are `warning` severity. Plan C (Step IDE Features) will update severity to
`information` for steps that have matching implementations.

- [ ] **Step 1: Write failing tests**

First update the import at the top of `vscode-extension/src/__tests__/featureLinter.test.ts`
to include `checkPhrasingRules` and `PhrasingRule`:

```typescript
import {
    checkEmptyComments,
    checkDuplicateExampleRows,
    checkOversizedExampleTable,
    checkOutlineMissingExamples,
    checkEmptyExamplesBody,
    checkTagAllowlist,
    checkPhrasingRules,
    PhrasingRule,
} from '../featureLinter';
```

Then add to the bottom of the file:

```typescript
describe('checkPhrasingRules', () => {
    const source = `Feature: F
  Scenario: S
    Given the user clicks the button
    When the form is submitted
    Then the result should appear`;

    const noActionInGiven: PhrasingRule = {
        pattern: '^the user (click|press|navigate)',
        message: 'Given steps should describe state, not action',
    };

    it('flags a step whose text matches the pattern', () => {
        const { doc } = parseSource(source);
        const diags = checkPhrasingRules(doc!, source.split('\n'), [noActionInGiven]);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toBe('Given steps should describe state, not action');
        expect(diags[0].severity).toBe('warning');
    });

    it('does not flag steps that do not match the pattern', () => {
        const { doc } = parseSource(source);
        const diags = checkPhrasingRules(doc!, source.split('\n'), [
            { pattern: '^nonexistent', message: 'nope' },
        ]);
        expect(diags).toHaveLength(0);
    });

    it('returns no diagnostics when phrasingRules is empty', () => {
        const { doc } = parseSource(source);
        expect(checkPhrasingRules(doc!, source.split('\n'), [])).toHaveLength(0);
    });

    it('flags multiple steps when multiple match', () => {
        const multiSource = `Feature: F\n  Scenario: S\n    Given click one\n    Given click two\n    Then done`;
        const { doc } = parseSource(multiSource);
        const diags = checkPhrasingRules(doc!, multiSource.split('\n'), [
            { pattern: '^click', message: 'click not allowed' },
        ]);
        expect(diags).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd vscode-extension && npx jest featureLinter --no-coverage
```

Expected: FAIL — `checkPhrasingRules is not exported`

- [ ] **Step 3: Add `PhrasingRule` type and `checkPhrasingRules` function to `featureLinter.ts`**

Add after `checkTagAllowlist` in `vscode-extension/src/featureLinter.ts`:

```typescript
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
```

- [ ] **Step 4: Read phrasing rules from configuration in `FeatureLinter.lint()`**

Update the `lint()` method in `featureLinter.ts` to also apply phrasing rules:

```typescript
lint(document: vscode.TextDocument): void {
    const { doc } = this.cache.parse(document);
    if (!doc) { this.collection.delete(document.uri); return; }

    const lines = document.getText().split('\n');
    const config = vscode.workspace.getConfiguration('pytest-bdd-orama');
    const allowedTags: string[] = config.get('allowedTags') ?? [];
    const phrasingRules: PhrasingRule[] = config.get('phrasingRules') ?? [];

    const entries = [
        ...RULES.flatMap((rule) => rule(doc, lines)),
        ...checkTagAllowlist(doc, lines, allowedTags),
        ...checkPhrasingRules(doc, lines, phrasingRules),
    ];

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
```

- [ ] **Step 5: Run tests — confirm pass**

```bash
cd vscode-extension && npx jest featureLinter --no-coverage
```

Expected: PASS (18 tests across 7 describe blocks)

- [ ] **Step 6: Run full suite + compile**

```bash
cd vscode-extension && npx jest --no-coverage && npm run compile
```

Expected: all tests pass, zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add vscode-extension/src/featureLinter.ts \
        vscode-extension/src/__tests__/featureLinter.test.ts
git commit -m "feat: add configurable step phrasing validation rules to gherkin linter"
```

---

## Task 9: Playground Updates

**Files:**
- Create: `playground/features/datatables/datatables.feature`
- Create: `playground/features/lint_examples/lint_violations.feature`
- Modify: `playground/tests/conftest.py`

> **Note:** If the FORMAT_LINT plan's Task 6 (Playground Updates) was already completed,
> skip to Step 3 below — the feature files will already exist.

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

  Scenario Outline: Oversized table
    Given item <n>
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

  Scenario Outline: Missing examples block
    Given value is <x>

  Scenario Outline: Empty examples body
    Given value is <x>
    Examples:
      | x |
```

- [ ] **Step 3: Update `playground/tests/conftest.py`**

Locate the existing `pytest_bdd_orama_lint_outline` hook implementation (it currently checks
for duplicate rows and oversized tables — both now built into the TypeScript linter).
Replace it with:

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

- [ ] **Step 4: Verify playground tests still pass**

```bash
cd playground && python -m pytest tests/ -v
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add playground/features/datatables/datatables.feature \
        playground/features/lint_examples/lint_violations.feature \
        playground/tests/conftest.py
git commit -m "chore(playground): add datatable and lint examples, update hookspec demo rule"
```

---

## Verification

After all tasks are complete:

1. **All tests pass:**
   ```bash
   cd vscode-extension && npx jest --no-coverage
   ```
   Expected: all test suites green.

2. **TypeScript compiles clean:**
   ```bash
   cd vscode-extension && npm run compile
   ```
   Expected: zero errors.

3. **Manual VS Code check** (open the playground in VS Code with the extension loaded):
   - Open a `.feature` file — keywords, tags, comments, step text, table cells should all be coloured without any external Gherkin extension installed
   - Open `playground/features/datatables/datatables.feature` — table pipe characters, plain cells, and quoted string cells (`"30s"`, `"Alice"`) should each have distinct colours
   - Format the file with Shift+Alt+F — unaligned table columns should snap to alignment
   - Open the Outline panel — Feature and Scenario names should appear in the tree
   - Open `playground/features/lint_examples/lint_violations.feature` — Problems panel should show diagnostics for each intentional violation
   - Add an unknown `@mytag` to a feature file, configure `pytest-bdd-orama.allowedTags: ["@smoke"]` in settings — `@mytag` should be flagged
   - Configure a phrasing rule `{ "pattern": "clicks", "message": "use 'selects' instead of 'clicks'" }` — any step containing "clicks" should be flagged
   - Type `feature` + Tab in a new `.feature` file — the Feature snippet should expand
