# pytest-bdd-orama: Implementation Plan

## Overview

A monorepo providing a custom VSCode test runner extension for pytest-bdd projects, addressing three gaps in the standard ms-python pytest runner:

1. **Feature-file tree structure** — test tree mirrors `.feature` file paths, not Python module hierarchy
2. **Custom display names** — scenario outline labels show only the `id` column value (via user-defined hook)
3. **Configurable custom status mapping** — custom pytest statuses map to VSCode run states via workspace settings; unmapped statuses default to `errored` (orange triangle)

---

## Architecture

### Approach: Extract, not fork
Copy only the pytest runner files from ms-python (~6 files), declare a peer dependency on ms-python for interpreter resolution, and track upstream changes in `UPSTREAM.md`.

### State mapping
```
pytest "passed"           → run.passed()
pytest "failed"           → run.failed()
pytest "skipped"          → run.skipped()
custom_status (mapped)    → run.[mapped]()
custom_status (unmapped)  → run.errored()   ← orange triangle default
```

Configured via `pytest-bdd-runner.outcomeMapping` in `.vscode/settings.json`. Read fresh on each run — no restart required.

### Feature-file tree
Python side emits `feature_path`, `scenario_name`, `line_number` alongside the existing payload. TypeScript side builds intermediate folder `TestItem` nodes from the feature path, sets leaf label to `scenario_name`, sets `TestItem.uri` to the `.feature` file. A `nodeIdMap` maps `TestItem.id` → pytest nodeid for execution.

---

## Monorepo Structure

```
/
├── PLAN.md
├── UPSTREAM.md
├── LICENSE
├── .gitignore
├── package.json                        # npm workspaces root
│
├── vscode-extension/
│   ├── package.json
│   ├── src/testController/
│   │   ├── pytest/
│   │   │   ├── pytestDiscoveryAdapter.ts   # adapted from ms-python
│   │   │   └── pytestExecutionAdapter.ts   # adapted from ms-python
│   │   └── common/
│   │       ├── resultResolver.ts           # MODIFIED: custom_status → errored
│   │       ├── testItemUtilities.ts        # MODIFIED: feature-path tree, scenario labels
│   │       └── types.ts                    # MODIFIED: feature_path, scenario_name, custom_status
│   └── python_files/vscode_pytest/
│       ├── __init__.py                     # MODIFIED: emit feature_path, scenario_name, custom_status
│       └── _common.py                      # adapted from ms-python
│
├── pytest-plugin/
│   ├── pyproject.toml
│   └── pytest_bdd_vscode/
│       ├── __init__.py
│       ├── hookspec.py             # pytest_bdd_vscode_test_name hookspec
│       └── hooks.py                # collection hook + custom status capture
│
└── playground/
    ├── pyproject.toml
    ├── .vscode/settings.json
    ├── features/
    │   ├── states/
    │   │   └── basic_states.feature
    │   └── outlines/
    │       └── complex_outline.feature
    └── tests/
        ├── conftest.py
        ├── test_basic_states.py
        └── test_complex_outline.py
```

---

## Phases

### Phase 1: Monorepo Scaffold
- [ ] `.gitignore`
- [ ] Root `package.json` (npm workspaces)
- [ ] `LICENSE` (MIT, with Microsoft attribution for adapted files)
- [ ] `UPSTREAM.md` (tracked ms-python files with last-synced commit SHA)

### Phase 2: Playground pytest-bdd Project

**`features/states/basic_states.feature`** — six scenarios covering all outcome paths:

| Scenario | pytest outcome | custom_status | settings map | Expected icon |
|---|---|---|---|---|
| A passing scenario | passed | — | — | green ✓ |
| A failing scenario | failed | — | — | red ✗ |
| A skipped scenario | skipped | — | — | blue skip |
| A waiting scenario | failed | `waiting` | `waiting → enqueued` | clock |
| Something bad happens | failed | `otherbadthing` | *(unmapped)* | orange △ |
| A known error scenario | failed | `knownError` | `knownError → errored` | orange △ |

**`features/outlines/complex_outline.feature`** — scenario outline with multi-column examples; without the hook the name is `E01-alpha-100-true-success`, with it: `E01`.

**`conftest.py`** implements:
1. `pytest_bdd_vscode_test_name` — returns `example_params['id']` when present
2. `pytest_report_customstatus` — returns `waiting`/`otherbadthing` for relevant scenarios; detects `KnownError` in `longrepr` and returns `knownError`

### Phase 3: pytest Plugin (`pytest-bdd-vscode`)

**`hookspec.py`** — defines `pytest_bdd_vscode_test_name(scenario_name, example_params, feature_name, feature_path)` with `firstresult=True`.

**`hooks.py`** — two hooks:
1. `pytest_collection_modifyitems` — attaches `_bdd_feature_path`, `_bdd_scenario_name`; calls `pytest_bdd_vscode_test_name`; sets `item.name` to custom name if returned
2. `pytest_runtest_makereport` (hookwrapper) — reads custom status from report, attaches as `report.vscode_custom_status`

**`pyproject.toml`** — entry point `pytest11 = {"pytest-bdd-vscode": "pytest_bdd_vscode.hooks"}`.

### Phase 4: VSCode Extension

**Python side (`vscode_pytest/__init__.py`):**
- Discovery: read `_bdd_feature_path`, `_bdd_scenario_name` from item; include in test node payload
- Execution: read `vscode_custom_status` from report; include as `custom_status` in payload

**TypeScript side:**
- `types.ts` — add `feature_path?`, `scenario_name?`, `custom_status?` to payload types
- `testItemUtilities.ts` — when `feature_path` present, build folder `TestItem` nodes from path components; leaf label = `scenario_name`; maintain `nodeIdMap: Map<string, string>`
- `resultResolver.ts` — read `outcomeMapping` setting; map `custom_status` to state; default to `errored`

**`package.json`** — contributes `pytest-bdd-runner.enabled` and `pytest-bdd-runner.outcomeMapping` settings; declares `extensionDependencies: ["ms-python.python"]`.

### Phase 5: Integration & Verification

Manual checklist:
1. Discovery tree matches expected feature-path hierarchy (no Python file names)
2. Run states match expected icons per scenario
3. Clicking a scenario navigates to the correct line in the `.feature` file
4. Changing `outcomeMapping` in settings takes effect on next run without restart
5. Unmapped custom status falls back to orange triangle

Automated tests:
- Plugin hooks (name rewriting, custom status attachment)
- Extension result mapping logic (`@vscode/test-electron`)

---

## Open Questions (to verify during implementation)

1. **`_pytest_bdd_scenario` attribute path** — must be confirmed against target pytest-bdd version. Fallback: parse the `scenario` marker args.
2. **Custom status attribute on report** — exact attribute name where pytest stores `pytest_report_customstatus` result must be confirmed against running pytest version.
3. **Non-pytest-bdd items** — extension must gracefully fall back to Python-file-based tree when `feature_path` is absent in payload.

---

## License Compliance

ms-python/vscode-python is MIT licensed. Extracting files is permitted provided:
- `LICENSE` includes the MIT license text with Microsoft attribution
- Microsoft copyright notice is preserved in each adapted file header
