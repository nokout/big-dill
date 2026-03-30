# Step Types, Completions & Linting — Design Spec

**Date:** 2026-03-30

## Overview

Six related features that bring type-aware step editing and scenario linting to pytest-bdd
projects in VS Code. They share a common data pipeline: step type metadata flows from
Python into VS Code and powers completions, validation, and linting from a single source
of truth.

1. Step parameter types (Python base class)
2. Step completions in `.feature` files
3. Cursor focus on parameter after completion
4. Domain value completions for typed parameters
5. Parameter validation in the Problems panel
6. Scenario linting with hook points

---

## Feature 1 — Step Type System (Python)

A base class `StepType` in `pytest_bdd_orama`:

```python
class StepType:
    @staticmethod
    def suggested_values() -> list[str]:
        return []

    @staticmethod
    def validate(value: str) -> str | None:
        """Return an error message string, or None if valid."""
        return None
```

A `StepEnum` mixin auto-implements both methods for Enum-based types:

```python
class StepEnum(StepType, str, Enum):
    # suggested_values() returns all enum values
    # validate() checks membership, returns error message if not found
```

**Example — fixed domain type:**
```python
class AustralianState(StepEnum):
    NSW = "NSW"
    VIC = "Victoria"
    QLD = "Queensland"
    WA = "Western Australia"
    SA = "South Australia"
    TAS = "Tasmania"
    ACT = "Australian Capital Territory"
    NT = "Northern Territory"
```

**Example — validation-only type (no fixed domain):**
```python
class JmesPathType(StepType):
    @staticmethod
    def validate(value: str) -> str | None:
        try:
            jmespath.compile(value)
            return None
        except jmespath.exceptions.ParseError as e:
            return str(e)
    # suggested_values() returns [] — no completions offered, but validation applies
```

Types are registered with pytest-bdd's parse type system exactly as today — no new
registration API is needed.

---

## Features 2–4 — Completions in `.feature` Files (VS Code)

A `CompletionItemProvider` registered for `.feature` files, drawing from cached step data.

### Level 1 — Step completions

- Triggered on `Given/When/Then/And` lines
- Filters cached step definitions by keyword and partial text typed
- Each match becomes a snippet completion with parameters as tab stops:
  `"I have {state:AustralianState} apples"` → snippet `"I have ${1:state} apples"`
- Selecting a completion places the cursor at the first parameter (Feature 3)

### Level 2 — Domain value completions

- Triggered when the cursor is inside a parameter position on a line that matches a
  known step pattern
- If that parameter's type has non-empty `suggested_values()`, those values are offered
  as completion items
- Types with empty `suggested_values()` (e.g. `JmesPathType`) produce no completions —
  the user types freely
- Position resolution operates on cached step data; no subprocess involved

---

## Feature 5 — Parameter Validation (Diagnostics)

On `.feature` file save, the extension runs `pytest --bdd-lint <file>` in the project's
venv. The subprocess:

- Loads conftest, step definitions, and type registrations
- Matches each step in the file against known step patterns
- For each resolved parameter value, calls `validate(value)` on the type
- Emits `LintDiagnostic` payloads over IPC

The extension updates its `DiagnosticCollection` for the saved file, publishing errors
to the VS Code Problems panel.

---

## Feature 6 — Scenario Linting (Hook Points)

Two hookspecs for custom business-rule validation:

```python
def pytest_bdd_orama_lint_scenario(scenario) -> list[LintDiagnostic]: ...
def pytest_bdd_orama_lint_outline(scenario, examples) -> list[LintDiagnostic]: ...
```

### Linting flow

- **Plain scenario:** `lint_scenario(scenario)` called once
- **Scenario outline:**
  1. `lint_outline(scenario, examples)` — outline-level checks (duplicate rows, large
     example sets, cross-row constraints)
  2. `lint_scenario(interpolated_scenario)` × N rows — each example row is interpolated
     into a concrete scenario object, then passed through the same scenario-level checks

The `interpolated_scenario` is a lightweight value object with `<placeholder>` text
substituted from the example row values. This means simple scenario-level checks (step
count, keyword ordering, etc.) automatically apply to every concrete row of an outline
without the check author needing to handle outlines at all.

### Diagnostic type

```python
@dataclass
class LintDiagnostic:
    message: str
    severity: Literal["error", "warning", "info"] = "error"
    line: int | None = None  # optional; falls back to scenario line if omitted
```

---

## Discovery Architecture (Two-Phase Pipeline)

### Phase A — Step discovery (infrequent)

- Triggered by: `.feature` file changes (existing behaviour); saves to step definition
  files (configurable glob, default: `**/step_defs/**/*.py`, `**/steps/**/*.py`)
- Runs `pytest --collect-only`
- Plugin emits a new `StepDefinition` payload type alongside existing test item payloads:
  - `keyword` (given/when/then/step)
  - `pattern` (raw pattern string)
  - `parameters`: list of `{name, type_name, suggested_values, has_validator}` where
    `has_validator` is `true` when the type overrides the default no-op `validate()`
    (i.e. meaningful validation exists beyond always returning `None`)
- Covers local AND installed package steps — pytest loads all registered steps in the
  venv naturally, no special handling required
- Result cached in the extension; used for completions and lint

### Phase B — Lint (on `.feature` file save)

- Runs `pytest --bdd-lint <file>` for the saved file only
- Emits `LintDiagnostic` payloads over IPC
- Extension updates `DiagnosticCollection` for that file

### Distributed step library metadata

Package authors run `pytest-bdd-orama generate-metadata` at packaging time. This
produces `pytest_bdd_orama_steps.json` which is included in the wheel.

The package declares the file via a Python entry point:

```toml
[project.entry-points."pytest_bdd_orama.steps"]
my-package = "my_package:pytest_bdd_orama_steps.json"
```

At startup, the extension runs a small Python snippet to enumerate all registered
`pytest_bdd_orama.steps` entry points, loads each metadata file as a base layer, then
merges live-collected Phase A data on top. Local step data always wins over distributed
metadata for the same pattern. Consumers of a distributed step library get completions
immediately without needing a collection run.

### CLI linting (CI/CD, commit hooks)

```sh
pytest --bdd-lint            # lint all .feature files in scope
pytest --bdd-lint path/to/file.feature  # lint a specific file
```

- Human-readable stdout output
- Non-zero exit on any `error`-severity diagnostic
- No IPC in CLI mode — the plugin detects the absence of a VS Code context and writes
  to stdout directly

---

## Open Questions

1. **Step definition glob default** — are `**/step_defs/**/*.py` and
   `**/steps/**/*.py` the right defaults, or does the target project use a different
   convention?

2. **Distributed metadata format versioning** — should `pytest_bdd_orama_steps.json`
   carry a schema version field for forward compatibility as the format evolves?

3. **Stale step cache** — if a step definition in an installed package changes between
   discovery runs (e.g. after `pip install --upgrade`), should the extension detect
   this automatically (e.g. watch `site-packages` mtime) or rely on manual refresh?
