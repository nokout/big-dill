# pytest-bdd-orama

A VS Code test runner for [pytest-bdd](https://pytest-bdd.readthedocs.io/) that surfaces Gherkin scenarios as first-class citizens in the Testing panel — navigable by feature file, tagged, and with configurable outcome mapping for custom statuses.

---

## What it is

pytest-bdd-orama connects VS Code's Testing API to pytest-bdd projects. In the Testing panel it provides:

- **Feature-file tree** — the test tree mirrors `.feature` file paths and feature names, not Python module hierarchy
- **Scenario navigation** — clicking a scenario jumps to the correct line in the `.feature` file
- **Tag visibility** — scenario and feature tags from the Gherkin source are shown inline
- **Custom display names** — scenario outline rows show user-defined identifiers via a hookspec
- **Configurable status mapping** — custom pytest outcomes map to VS Code run states via workspace settings
- **Live rediscovery** — the tree updates automatically when `.feature` files are saved

---

## The problem it solves

VS Code's built-in Python test runner (ms-python) discovers pytest tests and displays them as a tree of Python modules, files, and functions. For a pytest-bdd project this produces entries like:

```
tests/
  test_features.py
    test_a_passing_scenario
    test_a_failing_scenario
    test_complex_outline_with_custom_id_alpha_100_true_success_0
```

This is the wrong mental model for BDD. The feature file is the specification; the Python test function is an implementation detail. There is no navigation to the `.feature` file, scenario names are mangled into Python identifiers, outline rows carry all their parameter values in the function name, and the folder structure reflects where `conftest.py` lives rather than how the features are organised.

pytest-bdd-orama replaces this view entirely with one that reflects the Gherkin source:

```
Features 🗂
  Outlines 🗂
    Complex outline id things and stuff 🗒
      Process complex data [E01]   @alpha_examples
      Process complex data [E02]   @other_examples
      Process complex data [E03]   @other_examples
  States 🗂
    Basic test states 🗒
      A passing scenario            @passes
      A failing scenario            @fails
      ⏳ A waiting scenario         @waits
```

---

## VS Code Testing API — the integration pattern

VS Code exposes a **Testing API** that allows extensions to register arbitrary test trees and report results independently of any built-in runner. The key concepts are:

| Concept | Role |
|---|---|
| `TestController` | Owns a tree of test items and one or more run profiles. One controller appears as one collapsible section in the Testing panel. |
| `TestItem` | A node in the tree — can be a folder, a file, or a leaf test. Carries a label, URI, line range, description, and tags. |
| `TestRunProfile` | Defines a way to run items in the tree (Run, Debug, Coverage). Users select which profile to use. |
| `TestRun` | Represents a single execution. The extension calls `run.passed()`, `run.failed()`, `run.skipped()` etc. on individual items as results arrive. |

pytest-bdd-orama creates **one `TestController`** (labelled `pytest-bdd`) with a single Run profile. It is entirely independent of the ms-python controller — both can coexist in the same workspace, but for pytest-bdd projects you should disable ms-python's pytest runner (`python.testing.pytestEnabled: false`) to avoid a duplicate tree.

This is a **subprocess-based controller**: when discovery or a run is requested, the extension spawns a Python subprocess running pytest, communicates with it over a named pipe (IPC), and translates the JSON payloads it receives into `TestItem` tree mutations and `TestRun` state calls.

---

## How the pieces fit together

```
VS Code Testing panel
        │
        │  TestItem tree / run results
        ▼
┌─────────────────────────────────────┐
│        vscode-extension (TS)        │
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
2. pytest collects tests. The `pytest-bdd-orama` pytest plugin hooks into `pytest_collection_modifyitems` and attaches `_bdd_feature_path`, `_bdd_scenario_name`, tags, and feature metadata to every pytest-bdd item.
3. `vscode_pytest/__init__.py` serialises the collected items into a JSON payload and sends it over a named pipe to the extension.
4. `resultResolver.ts` receives the payload and calls `buildTree`, which constructs the `TestItem` hierarchy from feature paths.

**Execution flow:**
1. The user runs tests from the Testing panel. The extension collects the pytest node IDs of the selected items, writes them to a temp file, and spawns `run_pytest.py`.
2. pytest runs the tests. For each result, `vscode_pytest` sends a JSON payload over the named pipe.
3. `resultResolver.ts` maps each result's `runID` back to a `TestItem` and calls the appropriate `TestRun` method (`passed`, `failed`, `skipped`, etc.), applying any custom outcome mapping from workspace settings.

---

## Component breakdown

### `pytest-plugin/` — pytest-bdd-orama

An installable pytest plugin (`pytest-bdd-orama`) that bridges pytest-bdd's data model to the VS Code extension.

**What it registers:**

- `pytest_collection_modifyitems` — after pytest collects all items, iterates over them and attaches to each pytest-bdd item:
  - `_bdd_feature_path` — path to the `.feature` file, relative to the pytest rootdir
  - `_bdd_scenario_name` — display name for the scenario (default: `scenario.name`)
  - Resolved from `scenario.feature.name`, `scenario.tags`, `scenario.feature.tags`, and the example row's Examples block tags

- `pytest_runtest_makereport` — after each test, calls the `pytest_bdd_orama_custom_status` hookspec and attaches any non-None result to the report as `vscode_custom_status`

**Hookspecs it exposes to user `conftest.py`:**

- `pytest_bdd_orama_test_name(scenario_name, example_params, feature_name, feature_path)` → `str | None`
  Override the display name for a scenario. Return `None` to keep the default. Commonly used to give outline rows a meaningful identifier from one of the example columns.

- `pytest_bdd_orama_custom_status(report, config)` → `str | None`
  Return a custom status string for a test result (e.g. `"waiting"`, `"knownError"`). The extension maps these strings to VS Code run states via `pytest-bdd-orama.outcomeMapping` in workspace settings.

### `vscode-extension/python_files/vscode_pytest/` — the adapted ms-python bridge

This is a modified version of the `vscode_pytest/__init__.py` file from the [microsoft/vscode-python](https://github.com/microsoft/vscode-python) extension. The original handles IPC, test tree serialisation, and result reporting for the ms-python test runner.

**Why adapt rather than replace:** the IPC protocol, subprocess lifecycle management, and JSON payload format are non-trivial. Adapting the upstream file gives us a working foundation and makes it tractable to track upstream security and bug fixes.

**What we changed:**
- `TestItem` TypedDict extended with `feature_path`, `scenario_name`, `scenario_tags`, `feature_tags`, and `feature_name` optional fields
- `create_test_node()` populates these fields from the `_bdd_*` attributes set by the pytest plugin, including Examples-block tag resolution for scenario outlines
- `build_test_tree()` routes pytest-bdd items into feature-path-keyed stub file nodes rather than Python-file-keyed nodes, so the TypeScript tree builder receives items grouped by feature file

Changes are marked `# BDD-ORAMA` in the source. See [UPSTREAM.md](UPSTREAM.md) for the tracked commit and diff instructions.

### `vscode-extension/src/` — the TypeScript extension

**`extension.ts`** — activation entry point. Creates the `TestController`, run profile, and file system watcher. Coordinates workspace discovery on activation, on `.feature` file changes, and on configuration changes.

**`pytestRunner.ts`** — spawns pytest subprocesses for discovery and execution. Resolves the working directory from `pytest-bdd-orama.cwd` (falling back to `python.testing.cwd`, then workspace root). Creates and manages the named-pipe IPC server.

**`treeBuilder.ts`** — transforms a `DiscoveredTestPayload` into the `TestItem` tree:
- BDD items are organised under a folder hierarchy mirroring the `.feature` file's directory path
- Feature file nodes use the `Feature:` declaration name from the Gherkin source
- Folder and feature file labels are sentence-cased (underscores become spaces, first character capitalised)
- `scenario_tags` are shown as `description` text on scenario items; `feature_tags` on feature file items
- Path resolution uses `payload.cwd` (the actual pytest working directory) rather than the workspace root, so the tree is correct when `cwd` is a subdirectory

**`resultResolver.ts`** — receives discovery and execution payloads from the IPC server. Maps custom statuses to VS Code run states using `pytest-bdd-orama.outcomeMapping`. Prepends ⏳ to scenario labels mapped to the `enqueued` state and removes it when a terminal result arrives.

### `vscode-extension/python_files/run_pytest.py`

A thin runner script (also adapted from ms-python) that reads test node IDs from a file and invokes pytest, with the `vscode_pytest` plugin active to stream results back over the named pipe.

### IPC: how Python talks to TypeScript

The extension creates a named pipe before spawning the subprocess and passes its path in the `TEST_RUN_PIPE` environment variable. `vscode_pytest` writes newline-delimited JSON messages to this pipe. TypeScript reads them and emits them as events. This is the same pattern used by the ms-python extension — one message per discovery payload, one per test-batch result.

---

## Repository layout

```
pytest-bdd-orama/
├── vscode-extension/
│   ├── src/                    TypeScript extension source
│   │   └── testController/     Test controller, runner, resolver, tree builder
│   └── python_files/           Python bridge (adapted from ms-python)
│       ├── vscode_pytest/      IPC + serialisation layer
│       └── run_pytest.py       Execution runner script
├── pytest-plugin/              Installable pytest plugin (pytest-bdd-orama)
│   └── pytest_bdd_orama/       Hook implementations and hookspecs
└── playground/                 End-to-end demo project
    ├── features/               .feature files used for manual validation
    └── tests/                  pytest entry point (scenarios())
```

---

## Getting started

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18 or later (20+ LTS recommended) |
| Python | 3.10 or later |
| VS Code stable or Insiders | 1.87 or later |
| ms-python extension | latest |

> **Windows:** `build.sh` is a bash script. Run it from WSL or Git Bash.

### Build and install the extension

```bash
# From the repo root — builds the .vsix and installs it into VS Code:
./build.sh --install
```

Then reload the VS Code window (`Ctrl+Shift+P` → `Developer: Reload Window`).

To build without installing:

```bash
./build.sh
# Produces: vscode-extension/pytest-bdd-runner-*.vsix
```

### Set up the playground

```bash
cd playground
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e .                 # installs pytest, pytest-bdd, and pytest-bdd-orama
pip install -e ../pytest-plugin  # installs the local plugin in editable mode
```

Select the `.venv` interpreter in VS Code (`Ctrl+Shift+P` → `Python: Select Interpreter`).

Open the repo root as the workspace. The `.vscode/settings.json` already disables ms-python's runner and configures the extension:

```jsonc
{
  "python.testing.pytestEnabled": false,
  "python.testing.unittestEnabled": false,
  "python.testing.autoTestDiscoverOnSaveEnabled": false,
  "pytest-bdd-orama.enabled": true,
  "pytest-bdd-orama.cwd": "./playground",
  "pytest-bdd-orama.outcomeMapping": {
    "waiting":    "enqueued",
    "knownError": "errored"
  }
}
```

---

## Configuration reference

All settings are under the `pytest-bdd-orama` namespace and can be set at workspace or folder level.

| Setting | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Enable or disable the extension entirely |
| `cwd` | string | `""` | Working directory for pytest. Relative paths are resolved from the workspace root. Falls back to `python.testing.cwd`, then workspace root. |
| `pytestArgs` | string[] | `[]` | Extra arguments appended to every pytest invocation |
| `outcomeMapping` | object | `{}` | Maps custom status strings (from `pytest_bdd_orama_custom_status`) to VS Code run states: `"passed"`, `"failed"`, `"skipped"`, `"errored"`, or `"enqueued"`. Unmapped statuses default to `"errored"`. |

### `outcomeMapping` example

```jsonc
"pytest-bdd-orama.outcomeMapping": {
  "waiting":    "enqueued",   // ⏳ prefix added to label; pending indicator in gutter
  "knownError": "errored",    // orange triangle
  "wip":        "skipped"     // blue skip indicator
}
```

The mapping is read fresh on every test run — no reload required when you change it.

---

## Upstream tracking

The adapted `vscode_pytest/__init__.py` tracks ms-python at a specific commit. To check for upstream changes:

```bash
# In a local clone of microsoft/vscode-python:
git diff 5c2c3948 HEAD -- python_files/vscode_pytest/__init__.py
```

See [UPSTREAM.md](UPSTREAM.md) for the full tracking table.