# pytest-bdd-orama: Expanded Scope — Design Document

**Date:** 2026-05-30
**Status:** Draft

---

## Vision

An all-encompassing VS Code extension for testing with pytest-bdd, with a particular focus
on Gherkin authoring for less technical testers. The extension makes the full BDD authoring
loop — discover existing steps, write correct scenarios, propose new steps, validate
conventions — possible without developer assistance.

The extension serves as a showcase of best practices for pytest-bdd tooling.

---

## Target Users

| User | Primary need |
|---|---|
| **Tester / feature writer** | Discover what steps exist, write valid Gherkin, propose new steps with guidance |
| **Developer** | Implement step definitions; rich metadata helps document and organise them |
| **Team lead** | Governance via tag allowlists, phrasing conventions, and linting |

---

## Scope: Authoring-first

Living documentation, CI reporting, and coverage gap analysis are explicitly **out of scope**
for this phase. The goal is to own the authoring experience end-to-end.

---

## Feature Inventory

### Step Discovery & Documentation

| Feature | Status |
|---|---|
| Step completions (levels 1–3: step pattern, typed params, domain values) | Exists |
| Usage-frequency ranking in step completions | **New** |
| Step hover documentation: signature + docstring summary + typed param values | **New** |
| Step browser panel: tree groupable by file path, step type, or tag; filterable | **New** |
| Go-to-definition: F12 from `.feature` step → Python implementation | **New** |
| Find references: which scenarios use a given step | **New** |

### Authoring Quality

| Feature | Status |
|---|---|
| Semantic token highlighting for datatables and Examples tables | Specified, not yet built |
| Document formatter with per-type column alignment | Specified, not yet built |
| Structural linter (TypeScript, on-change, 5 rules) | Specified, not yet built |
| Document outline: scenarios in VS Code Outline panel and breadcrumb | **New** |
| Unimplemented step linting: warning when step has no matching implementation | **New** |
| Step stub generation: code action on unimplemented step → Python def skeleton | **New** (optional) |
| Gherkin snippet templates: Scenario, Scenario Outline, Background, Feature | **New** |
| Tag allowlist validation: warn on tags not in configured allowed list | **New** |
| Step phrasing validation: configurable naming/convention rules for step text (e.g. "Given steps must describe state not action", "step text must not exceed N words") | **New** |

Phrasing validation severity:
- Unimplemented step violates rule → **Warning** (tester is proposing wording — flag it now)
- Implemented step violates rule → **Information** (existing step, lower urgency)

The same step-matching logic used by unimplemented step linting serves both features.

### Gherkin Language Support *(makes extension self-contained)*

| Feature | Status |
|---|---|
| TextMate grammar for Gherkin syntax highlighting | **New** |
| Embedded language injection for typed docstrings (`"""yaml`, ` ```json `, etc.) | **New** |
| Language configuration: bracket matching, comment toggling, auto-indent | **New** |

Docstring content types follow the standard Gherkin spec — both `"""` and triple-backtick
delimiters are valid, with an optional content type identifier (e.g. `"""yaml`).
`@cucumber/gherkin` (already a dependency) exposes `docString.mediaType` from the AST.
No new Gherkin syntax is required.

### Python Plugin

| Feature | Status |
|---|---|
| `StepType` / `StepEnum` base classes | Exists |
| Step registry + metadata export | Exists |
| Hookspecs: custom status, names, lint | Exists |
| Extended metadata export: file location, docstring summary, tags per step | **New** |
| Google-style docstring parsing for `Tags:` section | **New** |
| Step type captured as grouping dimension in metadata | **New** |
| `docstring_transformer` hookspec: auto-parse docstring by `mediaType` | **New** (optional) |

### Step Metadata Model (extended)

```python
# Each registered step exports:
{
  "pattern": "the user selects {state} from the dropdown",
  "file": "tests/steps/ui_steps.py",
  "line": 42,
  "summary": "Select a state value from the dropdown widget.",  # first docstring line
  "tags": ["ui", "geography"],                                   # from Tags: section
  "param_types": ["AustralianState"],                            # StepType/StepEnum classes
  "usage_count": 0                                               # tracked by extension, not plugin
}
```

### Step Grouping Dimensions

Steps in the browser panel can be organised and filtered across three axes:

| Dimension | Source |
|---|---|
| **File path** | `file` field in metadata |
| **Step type** | `param_types` — the `StepType`/`StepEnum` classes used by the step |
| **Tag** | `tags` — from `Tags:` section in Google-style docstring |

---

## Features Explicitly Excluded

- Phrase/convention validation for step *implementations* authored by developers (only applies to step text proposed by testers in `.feature` files)
- Living documentation / HTML report generation
- CI/CD integration or JUnit XML enrichment
- Coverage gap reporting
- Gherkin localisation (multilingual keywords)
- Extension pack splitting — single extension for now

---

## Existing Work to Complete First

The following was specified in `FORMAT_LINT.md` and planned in
`docs/superpowers/plans/2026-04-17-gherkin-format-lint.md` but not yet implemented:

- `gherkinParser.ts` — shared parse cache
- `featureSemanticTokens.ts` — semantic token provider
- `featureFormatter.ts` — document formatter
- `featureLinter.ts` — structural linter (5 rules)

These underpin several new features and should be completed as part of this phase.

---

## Architecture

### Layer 0 — Declarative language registration (no runtime code)

Declared in `package.json` and static files. Loaded by VS Code at startup, independent
of both pipelines.

| Contribution | Purpose |
|---|---|
| `contributes.languages` | Claims `.feature` files, sets language ID, icon |
| `contributes.grammars` | Points to TextMate grammar JSON — source of all baseline keyword/tag/string colouring |
| `contributes.languageConfiguration` | Bracket matching, `#` comment toggle, auto-indent |
| `contributes.snippets` | Static JSON snippet templates (Scenario, Background, Outline, Feature) |
| `contributes.configuration` | Settings declarations: tag allowlist, phrasing rules, custom status mappings |

The grammar also handles embedded language injection: when the grammar encounters a typed
docstring (e.g. ` ```yaml `), it delegates tokenisation of the content span to `source.yaml`.
Purely declarative — no code runs.

### Pipeline 1 — Gherkin AST pipeline (TypeScript only, no subprocess)

Triggered by document change/open events. All consumers share a single `GherkinParseCache`
— the document is parsed once per edit, not once per provider.

Adds precision on top of the TextMate grammar and provides structural feedback:

| Provider | VS Code API | File | What it adds |
|---|---|---|---|
| Semantic tokens | `DocumentSemanticTokensProvider` | `featureSemanticTokens.ts` | Finer table cell types — quoted vs plain vs header |
| Formatter | `DocumentFormattingEditProvider` | `featureFormatter.ts` | Column-aligns table rows |
| Document outline | `DocumentSymbolProvider` | `featureSymbols.ts` | Feature/Scenario hierarchy in Outline panel + breadcrumb |
| Structural linter | `DiagnosticCollection` | `featureLinter.ts` | Empty Examples, duplicate rows, oversized tables, etc. |
| Tag allowlist linting | `DiagnosticCollection` | `featureLinter.ts` | Warn on tags not in configured allowed list; reads tags from AST only |
| Phrasing linter | `DiagnosticCollection` | `featureLinter.ts` | Step text convention violations (graduated severity — see below) |

### Pipeline 2 — Step metadata pipeline (TypeScript + Python subprocess)

Triggered by project open, file save, and step definition file changes. The Python plugin
exports step metadata JSON; `StepCache` ingests and maintains it. All providers consume
`StepCache`. No relationship to syntax highlighting.

| Provider | VS Code API | File | Purpose |
|---|---|---|---|
| Completions | `CompletionItemProvider` | `featureCompletion.ts` | Step pattern + domain value completions, frequency-ranked |
| Hover docs | `HoverProvider` | `featureHover.ts` | Signature, docstring summary, typed param values |
| Go-to-definition | `DefinitionProvider` | `featureDefinition.ts` | Jump to Python implementation |
| Find references | `ReferenceProvider` | `featureReferences.ts` | All scenarios using a step |
| Unimplemented step linting | `DiagnosticCollection` | `featureDiagnostics.ts` | Flag steps with no matching implementation |
| Step stub code action | `CodeActionProvider` | `featureCodeActions.ts` | Generate Python step def skeleton |
| Step browser | `TreeDataProvider` | `stepBrowserView.ts` | Sidebar panel, grouped by path / step type / tag |

### Cross-pipeline: Phrasing linter

The phrasing linter reads step text from the Gherkin AST (Pipeline 1) and checks
implementation status from `StepCache` (Pipeline 2) to determine diagnostic severity:

- Unimplemented step violates a phrasing rule → **Warning**
- Implemented step violates a phrasing rule → **Information**

---

## Python Plugin & Data Flow

### Discovery sequence

1. Extension spawns `pytest --collect-only` via the existing named-pipe IPC bridge
2. Plugin hooks intercept collection and invoke `metadata_gen.py` to enumerate registered steps
3. `metadata_gen.py` enriched to export: step pattern, file path, line number, docstring summary, tags, param type names
4. Extension receives JSON payload → `StepCache` stores it → all Pipeline 2 providers react

### Metadata extraction additions (`metadata_gen.py`)

| Field | Source |
|---|---|
| `file`, `line` | `step_func.__code__.co_filename`, `co_firstlineno` |
| `summary` | `inspect.getdoc(step_func)` — first non-empty line |
| `tags` | Parse `Tags:` section from Google-style docstring → string list |
| `param_types` | Extend existing registry to capture all `StepType`/`StepEnum` param types from function signature |

### Usage count

`usage_count` is tracked by the extension, not the plugin — `StepCache` counts how many
times each pattern appears across all `.feature` files in the workspace.

### `docstring_transformer` hookspec (optional)

Runtime convenience for developers. Allows auto-parsing of typed docstrings into Python
objects (e.g. YAML → dict) before the raw string reaches the step function. No effect on
the extension.

```python
@pytest.hookspec
def pytest_bdd_orama_transform_docstring(docstring: str, media_type: str | None) -> Any:
    """Transform a step docstring argument before it reaches the step function.
    Return a non-None value to replace the raw string.
    """
```

---

## Error Handling & Degradation

**Parse errors don't block anything.** `GherkinParseCache` surfaces parse errors as
diagnostics but all Pipeline 1 providers degrade gracefully — the formatter returns no
edits, semantic tokens skip malformed regions, the structural linter checks whatever it
could parse.

**Stale/missing step metadata is non-blocking.** If the Python subprocess hasn't run yet
(no Python environment configured, discovery pending), all Pipeline 2 providers show
nothing rather than erroring. Completions are empty, hover shows nothing, unimplemented
step linting is suppressed. The step browser shows an "awaiting discovery" placeholder.

**Step stub generation is advisory.** The generated skeleton is presented as a file edit
the developer must accept — a starting point, not a committed change.

**Tag allowlist is opt-in.** If no allowlist is configured the tag validator is silent —
it does not warn on every tag by default.

---

## Testing Approach

### TypeScript (Jest)

- Each Pipeline 1 lint rule is a standalone class with a `check(doc, source)` interface —
  unit tested in isolation with fixture `.feature` strings
- Each Pipeline 2 provider tested with a mock `StepCache`
- Phrasing linter tested with both implemented and unimplemented step fixtures to verify
  severity graduation

### Python (pytest)

- `metadata_gen.py` enrichments tested with fixture step functions covering: docstring
  with/without `Tags:` section, missing docstring, `StepEnum` and plain type params
- `docstring_transformer` hookspec tested with YAML and JSON fixture docstrings

### Playground (manual)

- Playground `.feature` files and `conftest.py` updated to exercise all new features
  end-to-end in a real VS Code instance
