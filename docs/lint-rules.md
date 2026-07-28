# Lint rules reference

Every diagnostic pytest-bdd-orama can raise on a `.feature` file, and where it comes from. Three layers run at different times:

1. **Structural rules** — instant, in-editor as you type (no subprocess)
2. **Configurable checks** — tag allowlist and phrasing rules from workspace settings
3. **Save-time and CLI checks** — step implementation matching, typed parameter validation, and your own custom rules

Severity legend: 🔴 Error · 🟡 Warning · 🔵 Info

---

## 1. Structural rules (as you type)

| Rule | Severity | Flags when |
|---|---|---|
| Empty comment | 🟡 | A line is `#` with no content |
| Duplicate example rows | 🟡 | Two rows in the same `Examples:` block have identical values |
| Oversized example table | 🟡 | An `Examples:` block exceeds 20 data rows |
| Outline missing Examples | 🔴 | A `Scenario Outline:` has no `Examples:` block |
| Empty Examples body | 🔴 | An `Examples:` block has a header row but no data rows |
| Scenario should be Outline | 🟡 | A plain `Scenario:` uses `<param>` placeholder syntax |
| Examples under plain Scenario | 🔴 | An `Examples:` table appears under a `Scenario:` — the keyword should be `Scenario Outline:` |
| Undefined example column | 🔴 | A step references `<param>` but no Examples column of that name exists. Checks step text, datatable cells, and docstring content, and points at the exact offending line |
| Unused example column | 🟡 | An Examples column is never referenced by any step. Suppressed while the outline has an undefined `<param>` reference — fixing the reference re-evaluates the columns |
| Duplicate scenario name | 🟡 | Two scenarios in the same feature share a name (breaks pytest-bdd test-name generation and history tracking). Scenarios inside `Rule:` blocks share the feature's namespace |
| Duplicate Examples column | 🔴 | The same column name appears twice in one `Examples:` header — substitution is ambiguous |
| Empty scenario | 🔴 | A scenario or outline has no steps |
| Single-row outline | 🔵 | An outline whose only `Examples:` block has one data row — a plain `Scenario` would be simpler |

A quick taste of the two Examples-column rules, which bracket the most common outline typo:

```gherkin
Scenario Outline: Process order
  Given an order of <quantitty> items    # 🔴 no Examples column 'quantitty' exists
  Examples:
    | quantity |                          # 🟡 never referenced by any step (once the typo above is fixed)
    | 3        |
```

See these rules firing on real files: open `playground/features/lint_examples/lint_violations.feature` with the extension installed.

## 2. Configurable checks (workspace settings)

| Check | Severity | Setting |
|---|---|---|
| Tag allowlist | 🟡 | `pytest-bdd-orama.allowedTags` — when non-empty, any `@tag` not in the list is flagged (feature and scenario tags) |
| Phrasing rules | 🟡 / 🔵 | `pytest-bdd-orama.phrasingRules` — regex rules against step text (e.g. forbid UI-action verbs in `Given` steps). Severity is graduated: 🟡 warning for steps with no matching implementation (new wording being proposed), 🔵 info when the step already matches a known implementation (existing convention violation) |

Example phrasing rule:

```jsonc
"pytest-bdd-orama.phrasingRules": [
  {
    "pattern": "^the user (clicks|presses|navigates)",
    "message": "Given steps should describe state, not actions"
  }
]
```

## 3. Save-time and CLI checks

| Check | Severity | When it runs |
|---|---|---|
| Unimplemented step | 🟡 | On save — steps with no matching Python step definition are flagged (`Step not implemented: "…"`) |
| Typed parameter validation | 🔴/🟡 | `pytest --bdd-lint` — values in steps and interpolated Examples rows are validated against typed step definitions (`{n:d}`-style and `StepType` classes); e.g. `abc` feeding an integer parameter |
| Custom outline rules | as returned | `pytest --bdd-lint` — your `pytest_bdd_orama_lint_outline(scenario, examples)` hooks in `conftest.py`, called once per outline |
| Custom scenario rules | as returned | `pytest --bdd-lint` — your `pytest_bdd_orama_lint_scenario(scenario)` hooks, called for each scenario and each interpolated Examples row |

Run the CLI pass across every feature file (exits non-zero on errors, suitable for CI):

```bash
pytest --bdd-lint
```

Writing custom rules is covered in the [developer guide](developer-guide.md#pytest_bdd_orama_lint_outline).
