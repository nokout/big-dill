# Architecture

How Big Dill connects VS Code's Testing API to pytest-bdd. This is the design/development deep-dive; for user-facing docs see the [overview](overview.md), [tester guide](tester-guide.md), and [developer guide](developer-guide.md).

> **⚠ Substantially out of date — rewrite pending.**
>
> This describes the structure before the engine was extracted into
> `@nokout/big-dill-core`. In particular, the sections on `python_files/` and
> `vscode_pytest` describe a vendored copy of ms-python's bridge that **no longer
> exists**: discovery, execution and linting now run through `pytest-big-dill`'s
> own bridge, and the extension ships no Python at all. The project is three
> packages, not two, and the extension is bundled rather than shipping its
> `node_modules`.
>
> For the current design of the engine and what a host must provide, see
> [adapter-contract.md](adapter-contract.md).

---

## VS Code Testing API — the integration pattern

VS Code exposes a **Testing API** that allows extensions to register arbitrary test trees and report results independently of any built-in runner. The key concepts are:

| Concept | Role |
|---|---|
| `TestController` | Owns a tree of test items and one or more run profiles. One controller appears as one collapsible section in the Testing panel. |
| `TestItem` | A node in the tree — can be a folder, a file, or a leaf test. Carries a label, URI, line range, description, and tags. |
| `TestRunProfile` | Defines a way to run items in the tree (Run, Debug, Coverage). Users select which profile to use. |
| `TestRun` | Represents a single execution. The extension calls `run.passed()`, `run.failed()`, `run.skipped()` etc. on individual items as results arrive. |

Big Dill creates **one `TestController`** (labelled `pytest-bdd`) with a single Run profile. It is entirely independent of the ms-python controller — both can coexist in the same workspace, but for pytest-bdd projects you should disable ms-python's pytest runner (`python.testing.pytestEnabled: false`) to avoid a duplicate tree.

This is a **subprocess-based controller**: when discovery or a run is requested, the extension spawns a Python subprocess running pytest, communicates with it over a named pipe (IPC), and translates the JSON payloads it receives into `TestItem` tree mutations and `TestRun` state calls.

---

## How the pieces fit together

```
VS Code Testing panel
        │
        │  TestItem tree / run results
        ▼
┌─────────────────────────────────────┐
│        extension (TS)        │
│                                     │
│  pytestRunner  ──spawn──►  pytest   │
│       │          ◄─IPC─    subprocess
│       ▼                    (Python) │
│  resultResolver                     │  ◄── vscode_pytest/__init__.py
│       │                             │       serialises collection +
│       ▼                             │       execution results to JSON
│   treeBuilder                       │
│       │                             │  ◄── pytest-plugin/
│       ▼                             │       attaches BDD metadata
│  TestItem tree                      │       to each pytest item
└─────────────────────────────────────┘
```

**Discovery flow:**
1. The extension spawns `pytest --collect-only` in a subprocess, with the `vscode_pytest` plugin loaded.
2. pytest collects tests. The `pytest-big-dill` pytest plugin hooks into `pytest_collection_modifyitems` and attaches `_bdd_feature_path`, `_bdd_scenario_name`, tags, and feature metadata to every pytest-bdd item.
3. `vscode_pytest/__init__.py` serialises the collected items into a JSON payload and sends it over a named pipe to the extension.
4. `resultResolver.ts` receives the payload and calls `buildTree`, which constructs the `TestItem` hierarchy from feature paths.

**Execution flow:**
1. The user runs tests from the Testing panel. The extension collects the pytest node IDs of the selected items, writes them to a temp file, and spawns `run_pytest.py`.
2. pytest runs the tests. For each result, `vscode_pytest` sends a JSON payload over the named pipe.
3. `resultResolver.ts` maps each result's `runID` back to a `TestItem` and calls the appropriate `TestRun` method (`passed`, `failed`, `skipped`, etc.), applying any custom outcome mapping from workspace settings.

---

## Component breakdown

### `pytest-plugin/` — pytest-big-dill

An installable pytest plugin (`pytest-big-dill`) that bridges pytest-bdd's data model to the VS Code extension.

**What it registers:**

- `pytest_collection_modifyitems` — after pytest collects all items, iterates over them and attaches to each pytest-bdd item:
  - `_bdd_feature_path` — path to the `.feature` file, relative to the pytest rootdir
  - `_bdd_scenario_name` — display name for the scenario (default: `scenario.name`)
  - Resolved from `scenario.feature.name`, `scenario.tags`, `scenario.feature.tags`, and the example row's Examples block tags

- `pytest_runtest_makereport` — after each test, calls the `pytest_big_dill_custom_status` hookspec and attaches any non-None result to the report as `vscode_custom_status`

**Hookspecs it exposes to user `conftest.py`:**

- `pytest_big_dill_test_name(scenario_name, example_params, feature_name, feature_path)` → `str | None`
  Override the display name for a scenario. Return `None` to keep the default. Commonly used to give outline rows a meaningful identifier from one of the example columns.

- `pytest_big_dill_custom_status(report, config)` → `str | None`
  Return a custom status string for a test result (e.g. `"waiting"`, `"knownError"`). The extension maps these strings to VS Code run states via `big-dill.outcomeMapping` in workspace settings.

See the [developer guide](developer-guide.md) for the full hookspec reference including the lint hooks.

### `extension/python_files/vscode_pytest/` — the adapted ms-python bridge

This is a modified version of the `vscode_pytest/__init__.py` file from the [microsoft/vscode-python](https://github.com/microsoft/vscode-python) extension. The original handles IPC, test tree serialisation, and result reporting for the ms-python test runner.

**Why adapt rather than replace:** the IPC protocol, subprocess lifecycle management, and JSON payload format are non-trivial. Adapting the upstream file gives us a working foundation and makes it tractable to track upstream security and bug fixes.

**What we changed:**
- `TestItem` TypedDict extended with `feature_path`, `scenario_name`, `scenario_tags`, `feature_tags`, and `feature_name` optional fields
- `create_test_node()` populates these fields from the `_bdd_*` attributes set by the pytest plugin, including Examples-block tag resolution for scenario outlines
- `build_test_tree()` routes pytest-bdd items into feature-path-keyed stub file nodes rather than Python-file-keyed nodes, so the TypeScript tree builder receives items grouped by feature file

Nothing in the repository is adapted from ms-python any more; the tracking file that recorded the synced commit has been removed.

### `extension/src/` — the TypeScript extension

**`extension.ts`** — activation entry point. Creates the `TestController`, run profile, and file system watcher. Coordinates workspace discovery on activation, on `.feature` file changes, and on configuration changes.

**`pytestRunner.ts`** — spawns pytest subprocesses for discovery and execution. Resolves the working directory from `big-dill.cwd` (falling back to `python.testing.cwd`, then workspace root). Creates and manages the named-pipe IPC server.

**`treeBuilder.ts`** — transforms a `DiscoveredTestPayload` into the `TestItem` tree:
- BDD items are organised under a folder hierarchy mirroring the `.feature` file's directory path
- Feature file nodes use the `Feature:` declaration name from the Gherkin source
- Folder and feature file labels are sentence-cased (underscores become spaces, first character capitalised)
- `scenario_tags` are shown as `description` text on scenario items; `feature_tags` on feature file items
- Path resolution uses `payload.cwd` (the actual pytest working directory) rather than the workspace root, so the tree is correct when `cwd` is a subdirectory

**`resultResolver.ts`** — receives discovery and execution payloads from the IPC server. Maps custom statuses to VS Code run states using `big-dill.outcomeMapping`. Prepends ⏳ to scenario labels mapped to the `enqueued` state and removes it when a terminal result arrives.

### `extension/python_files/run_pytest.py`

A thin runner script (also adapted from ms-python) that reads test node IDs from a file and invokes pytest, with the `vscode_pytest` plugin active to stream results back over the named pipe.

### IPC: how Python talks to TypeScript

The extension creates a named pipe before spawning the subprocess and passes its path in the `TEST_RUN_PIPE` environment variable. `vscode_pytest` writes newline-delimited JSON messages to this pipe. TypeScript reads them and emits them as events. This is the same pattern used by the ms-python extension — one message per discovery payload, one per test-batch result.

---

## Step discovery — a separate two-phase pipeline

Test discovery (above) is not the same pipeline as *step* discovery, which feeds
completions, hover, go-to-definition, and the Step Browser.

**Phase A — step discovery.** Triggered by saves to files matching
`big-dill.stepDefinitionGlob` (default `**/step_defs/**/*.py`, `**/steps/**/*.py`,
`**/conftest.py`). Runs `pytest --collect-only`; the plugin walks the fixture registry for
functions carrying `_pytest_bdd_step_context` and emits a `stepDefinitions` payload over the
same named pipe. Because pytest loads everything registered in the environment, this covers
steps from installed packages as well as local ones, with no special handling. The result is
cached in `StepCache`.

**Phase B — lint.** `pytest --bdd-lint` emits `lintDiagnostics` payloads. In CLI mode the
plugin detects the absence of `TEST_RUN_PIPE` and writes human-readable text to stdout
instead, exiting non-zero on any error-severity diagnostic — which is what makes it usable
as a CI gate.

Note that the structural linter in the extension is a third, independent path: it parses
the Gherkin AST in-process on every edit and needs no subprocess at all. It publishes to its
own `DiagnosticCollection` (`big-dill-gherkin`) so it never overwrites the Python
linter's results (`pytest-big-dill`).

### Distributed step library metadata

Step definitions shipped inside a published package can supply completions *before* any
collection run. A package author generates the metadata at packaging time:

```bash
pytest-big-dill          # writes pytest_big_dill_steps.json
```

and declares it via an entry point so consumers can find it:

```toml
[project.entry-points."pytest_big_dill.steps"]
my-package = "my_package:pytest_big_dill_steps.json"
```

On activation the extension enumerates registered `pytest_big_dill.steps` entry points and
loads each file as a base layer (`loadDistributedStepMetadata` in `extension.ts`). Live
Phase A data is merged on top, and **local step definitions always win** over distributed
metadata for the same pattern.

## Gherkin language features

These are pure in-extension providers over a shared `GherkinParseCache`, which parses each
document once per version and shares the AST across every consumer. The `@cucumber/gherkin`
parser recovers from errors rather than throwing, so it is safe to run against a file being
actively edited; parse errors surface in the result's `errors[]`.

- **Semantic tokens** (`featureSemanticTokens.ts`) — distinguishes datatables from Examples
  tables, pipes from cell content, and quoted strings from bare values.
- **Formatter** (`featureFormatter.ts`) — see below.
- **Structural linter** (`featureLinter.ts`) — the rules in [lint-rules.md](lint-rules.md).

### Formatter rules

Only table rows are rewritten; keywords, step text, tags, and blank lines are left
untouched. If the parse produced any errors the formatter returns no edits at all, so a
malformed file is never reflowed.

| | DataTable | Examples body | Examples header |
|---|---|---|---|
| Alignment | Left | Left, but **right-align numeric columns** | Left |
| Padding | One space each side | One space each side | One space each side |
| Column width | Max across all rows | Max across header and body | Same pass as body |

A column counts as numeric when every non-empty cell matches `/^-?\d+(\.\d+)?$/`.

## Deliberately out of scope

Recorded so the boundary is not relitigated:

- Phrase and convention validation for *step implementations* — the phrasing rules apply to
  step text written by testers in `.feature` files, not to developers' Python code
- Living documentation / HTML report generation
- CI/CD integration or JUnit XML enrichment
- Coverage gap reporting
- Gherkin localisation (multilingual keywords)
- Splitting into an extension pack — one extension for now

## Repository layout

```
big-dill/
├── extension/
│   ├── src/                    TypeScript extension source
│   │   └── testController/     Test controller, runner, resolver, tree builder
│   └── python_files/           Python bridge (adapted from ms-python)
│       ├── vscode_pytest/      IPC + serialisation layer
│       └── run_pytest.py       Execution runner script
├── pytest-plugin/              Installable pytest plugin (pytest-big-dill)
│   └── pytest_big_dill/       Hook implementations and hookspecs
└── playground/                 End-to-end demo project
    ├── features/               .feature files used for manual validation
    └── tests/                  pytest entry point (scenarios())
```

---

## Upstream tracking

The adapted `vscode_pytest/__init__.py` tracks ms-python at a specific commit. To check for upstream changes:

```bash
# In a local clone of microsoft/vscode-python:
git diff 5c2c3948 HEAD -- python_files/vscode_pytest/__init__.py
```

Nothing is tracked against ms-python any more.
