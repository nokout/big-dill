# Gherkin Table Highlighting, Formatting & Linting — Design Spec

**Date:** 2026-04-17

## Overview

Three related features that share a single `@cucumber/gherkin` AST pipeline in the
VS Code extension:

1. **Semantic token highlighting** — datatables and Examples tables get distinct colors;
   pipes and cell content are differentiated; quoted string values get a third color
2. **Document formatter** — column alignment rules differ per table type
3. **Gherkin structural linter** — fast, on-change diagnostics with no subprocess;
   complements the existing Python-side `pytest_bdd_orama_lint_*` hook system

All three consume a shared parse cache so the document is parsed once per edit, not once
per provider.

---

## Architecture

### New dependency

`@cucumber/gherkin` added to `vscode-extension/package.json` dependencies. The parser
has built-in error recovery — parse errors appear in the envelope-level `errors[]` array
rather than being thrown, making it safe to use on files being actively edited.

### New files

| File | Purpose |
|---|---|
| `vscode-extension/src/gherkinParser.ts` | Caching parse service — shared by all three consumers |
| `vscode-extension/src/featureSemanticTokens.ts` | `DocumentSemanticTokensProvider` |
| `vscode-extension/src/featureFormatter.ts` | `DocumentFormattingEditProvider` |
| `vscode-extension/src/featureLinter.ts` | AST-based structural linter |

### Modified files

| File | Change |
|---|---|
| `vscode-extension/src/extension.ts` | Register all three new providers |
| `vscode-extension/package.json` | `@cucumber/gherkin` dep, `contributes.semanticTokenTypes`, `contributes.semanticTokenScopes` |
| `playground/tests/conftest.py` | Simplify `pytest_bdd_orama_lint_outline` example (built-in rules removed) |
| `playground/features/datatables/datatables.feature` | New — exercises datatable highlighting and formatter |
| `playground/features/lint_examples/lint_violations.feature` | New — intentional violations for linter testing |

### Provider registration (`extension.ts`)

```typescript
context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
        { language: 'feature' }, new FeatureSemanticTokensProvider(), legend,
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
        { language: 'feature' }, new FeatureFormattingProvider(),
    ),
);
```

The linter registers its own `DiagnosticCollection` internally on construction; it is
not registered via `registerDocumentFormattingEditProvider`.

---

## Feature 1 — Shared Parse Cache (`gherkinParser.ts`)

Parses once per document version. All three consumers call `cache.parse(document)` and
receive the same `GherkinDocument` reference when the version has not changed.

```typescript
interface ParseResult {
    doc: GherkinDocument;
    errors: ParseError[];
}

class GherkinParseCache {
    private cache = new Map<string, { version: number; result: ParseResult }>();
    parse(document: vscode.TextDocument): ParseResult { ... }
}
```

Key: `document.uri.fsPath`. Evicted when version number advances.

Parse errors are surfaced by the linter as diagnostics; the token provider and formatter
degrade gracefully (skip sections with errors rather than throwing).

---

## Feature 2 — Semantic Token Highlighting (`featureSemanticTokens.ts`)

Layers on top of `alexkrechik.cucumberautocomplete`'s TextMate grammar — no conflict.
Registered against `{ language: 'feature' }`.

### Token types

Declared in `package.json` under `contributes.semanticTokenTypes` and mapped to TextMate
scopes under `contributes.semanticTokenScopes` for out-of-the-box theme compatibility:

| Token type ID | TextMate fallback scope | Typical appearance |
|---|---|---|
| `gherkinDatatablePipe` | `punctuation.separator` | Muted/grey |
| `gherkinDatatableCell` | `string.unquoted` | String color (orange/green) |
| `gherkinDatatableCellString` | `string.quoted.double` | Quoted string color |
| `gherkinExamplesPipe` | `punctuation.separator` | Muted/grey |
| `gherkinExamplesCell` | `variable.other` | Variable color (blue/teal) |
| `gherkinExamplesCellString` | `string.quoted.double` | Quoted string color |
| `gherkinExamplesHeaderCell` | `entity.name.tag` | Keyword/tag color (yellow) |

Users can override any of these via `editor.semanticTokenColorCustomizations` in
`settings.json` — standard VSCode mechanism.

### AST paths

**Datatable** — step argument tables:
```
GherkinDocument → feature → children → Scenario → steps[] → step.dataTable → rows[]
```

**Examples header row:**
```
GherkinDocument → feature → children → Scenario → examples[] → tableHeader
```

**Examples body rows:**
```
GherkinDocument → feature → children → Scenario → examples[] → tableBody[]
```

### Token emission

For each `TableRow`, scan the raw source line rather than using `cell.location.column`
offsets. Column-aligned tables have variable padding around pipes so offset arithmetic
is not reliable.

Per row:
1. Get the source line text from `document.lineAt(row.location.line - 1)`
2. Find all `|` positions in the line by scanning for `'|'` characters
3. The nth cell maps to the nth `|` (opening pipe) and (n+1)th `|` (closing pipe)
4. Emit a pipe token at each `|` position
5. For the cell content span between the two pipes, inspect `cell.value.trim()`:
   - Wrapped in matching `"..."` or `'...'` → emit `*CellString` variant
   - Otherwise → emit `*Cell` variant

This handles any amount of padding around pipes and remains correct regardless of
whether the file has been formatted or not.

Header cells in Examples always emit `gherkinExamplesHeaderCell` regardless of content —
parameter names are not expected to be quoted strings.

### Example

```gherkin
Scenario Outline: Process data
  Given a record with id <id>

  Examples:
    | id  | label       | flag  |
    | E01 | "primary"   | true  |
    | E02 | "secondary" | false |

Scenario: Load config
  Given the system is configured with
    | key      | value     |
    | timeout  | "30s"     |
    | retries  | 3         |
```

```
Examples table:
  | id  | label       | flag  |   ← header cells → gherkinExamplesHeaderCell
  | E01 | "primary"   | true  |   ← "primary" → gherkinExamplesCellString
                                    E01, true → gherkinExamplesCell

Datatable:
  | key      | value     |         ← gherkinDatatableCell
  | timeout  | "30s"     |         ← "30s" → gherkinDatatableCellString
  | retries  | 3         |         ← gherkinDatatableCell
```

---

## Feature 3 — Formatter (`featureFormatter.ts`)

`DocumentFormattingEditProvider`. Parses document via shared cache, walks AST, returns
`TextEdit[]`. Only table rows are rewritten — keywords, step text, tags, and blank lines
are left untouched.

### Formatting rules

| Rule | DataTable | Examples body | Examples header |
|---|---|---|---|
| Column alignment | Left-align all | Left-align strings, right-align numerics | Left-align |
| Cell padding | 1 space each side | 1 space each side | 1 space each side |
| Column width | Max across all rows in table | Max across header + body | Same pass as body |

Numeric detection: `cell.value.trim()` matches `/^-?\d+(\.\d+)?$/`.

### Error handling

If `ParseResult.errors` is non-empty the formatter returns an empty `TextEdit[]` —
no edits are applied to a malformed file.

---

## Feature 4 — Structural Linter (`featureLinter.ts`)

Separate `DiagnosticCollection` instance named `'pytest-bdd-orama-gherkin'` — does not
overwrite results from the existing `FeatureDiagnostics` Python linter
(`'pytest-bdd-orama'`).

Triggers on `onDidChangeTextDocument` (debounced 300 ms) and `onDidOpenTextDocument`.

### Rule interface

```typescript
interface LintRule {
    id: string;
    check(doc: GherkinDocument, source: string): vscode.Diagnostic[];
}
```

Each rule is a standalone class, independently testable.

### Built-in rules

| Rule ID | Description | Severity | Migrated from |
|---|---|---|---|
| `empty-comment` | Line is `#` with no content | Warning | New |
| `duplicate-example-rows` | Two rows in the same Examples block have identical values | Warning | `pytest_bdd_orama_lint_outline` in conftest.py |
| `oversized-example-table` | Examples block exceeds 20 rows | Warning | `pytest_bdd_orama_lint_outline` in conftest.py |
| `outline-missing-examples` | Scenario Outline has no Examples block | Error | New |
| `empty-examples-body` | Examples block has a header row but no data rows | Error | New |
| `scenario-should-be-outline` | Plain Scenario uses `<param>` syntax | Warning | New |
| `scenario-has-examples-not-outline` | Examples table under a plain Scenario | Error | New |
| `undefined-example-column` | Step references `<param>` with no matching Examples column (checks step text, datatables, and docstrings) | Error | New |
| `unused-example-column` | Examples column never referenced by any step (suppressed while the outline has an undefined `<param>` reference) | Warning | New |
| `duplicate-scenario-name` | Two scenarios in the same feature share a name | Warning | New |
| `duplicate-examples-column` | Same column name appears twice in one Examples header | Error | New |
| `empty-scenario` | Scenario or outline has no steps | Error | New |
| `outline-single-row` | Outline whose only Examples block has a single data row | Info | New |

### Relationship to Python linting

The Python `pytest_bdd_orama_lint_outline` and `pytest_bdd_orama_lint_scenario`
hookspecs remain in place for **user-defined custom rules**. The two built-in rules
migrated above are removed from the playground conftest.py example and replaced with a
genuinely custom rule (e.g. domain-specific naming convention) to demonstrate the
hookspec's extensibility purpose.

The two `DiagnosticCollection` instances appear as independent sources in the VS Code
Problems panel:

| Collection | Source | Trigger |
|---|---|---|
| `pytest-bdd-orama-gherkin` | TypeScript AST linter | On change (300 ms debounce) |
| `pytest-bdd-orama` | Python `--bdd-lint` subprocess | On save |

---

## Playground Updates

### New feature files

**`playground/features/datatables/datatables.feature`**

Demonstrates step-level datatables: unquoted values, quoted string values, numeric
values. Used to visually verify semantic highlighting and formatter output.

**`playground/features/lint_examples/lint_violations.feature`**

Contains intentional violations to exercise each linter rule:
- An empty comment line
- A Scenario Outline with duplicate example rows
- A Scenario Outline with an oversized table (>20 rows)
- A Scenario Outline with no Examples block
- An Examples block with header only, no data rows

### Updated `playground/tests/conftest.py`

The `pytest_bdd_orama_lint_outline` hook implementation is simplified: the
duplicate-row and oversized-table checks are removed (now built-in to the TypeScript
linter). The hook is replaced with a custom domain rule — e.g. requiring that all
scenario names begin with a capital letter — to demonstrate that the hookspec exists for
user extensibility, not as the primary delivery mechanism for common rules.
