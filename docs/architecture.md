# Architecture

How the three packages work, and where the boundaries fall. For the API itself
see [`core/adapter-contract.md`](../core/adapter-contract.md); for the diagnostics
see [lint-rules.md](lint-rules.md).

## The split

```
  ┌──────────────────────────┐
  │  big-dill                │   editor types, registration, display
  │  extension/  (VSIX)      │
  ├──────────────────────────┤
  │  @nokout/big-dill-core   │   parsing, linting, completion, tree shape,
  │  core/  (npm)            │   outcome decisions, pytest orchestration
  ├──────────────────────────┤
  │  pytest-big-dill         │   BDD metadata, hooks, lint pass,
  │  pytest-plugin/  (PyPI)  │   discovery and execution payloads
  └──────────────────────────┘
```

**Core never imports an editor API** — CI asserts it — and returns plain data
throughout. The extension is an adapter: it maps that data onto VS Code types and
registers the results.

Keeping the boundary there has two effects. The logic is testable without an
editor stub — core holds most of the test suite and none of it needs a mock — and
the engine is usable without an editor at all, from a CI lint gate, a script, or
another host.

## Test discovery

1. The extension resolves an interpreter and working directory from its settings,
   and hands them to core as plain options.
2. Core opens a local pipe (a named pipe on Windows, a Unix domain socket
   elsewhere), passes its path in `TEST_RUN_PIPE`, and spawns
   `python -m pytest --collect-only`.
3. `pytest-big-dill` loads automatically through its `pytest11` entry point. During
   collection it attaches the feature path, scenario name, tags and the **scenario's
   line in the `.feature` file** to each pytest-bdd item.
4. At `pytest_collection_finish` it sends a discovery payload, and a second payload
   carrying the step definitions it found.
5. Core parses the frames and returns them. `buildTestTree` turns the payload into
   a plain tree; the extension materialises that as `TestItem`s.

Items are sent **flat** beneath a single root. The folder hierarchy is derived by
`buildTestTree` from each item's `feature_path`, so nesting them in the payload
would be a second source of truth for the same shape.

## Test execution

Same pipe, different command: `python -m pytest_big_dill`. Test node ids arrive
in a file named by `BIG_DILL_TEST_IDS` rather than on the command line, because
Windows caps a command line at roughly 32,000 characters and a few hundred
scenarios exceeds it.

The plugin folds each phase report — setup, call, teardown — into one result per
test, and sends them at session end. Core turns the payload into
`OutcomeDecision`s; the extension applies them to a `TestRun`.

Discovery and step-definition payloads are sent **only** for `--collect-only`
runs, so a test run produces exactly one frame.

## The wire protocol

One frame per message:

```
content-length: <N>\r\n
content-type: application/json\r\n
\r\n
{"jsonrpc": "2.0", "params": <payload>}
```

The payload shapes live in `core/src/protocol/types.ts` and are the contract
between the two packages. Two details are load-bearing:

- **`N` counts characters, not bytes.** That is only safe because `json.dumps`
  escapes non-ASCII by default, making the two equal. A test asserts this; do not
  pass `ensure_ascii=False` without changing the reader.
- **Lines are 1-based on the wire** and 0-based everywhere core returns them.

Because the ids in a discovery payload are what execution results are keyed on,
the two commands must produce identical node ids — which is why discovery passes
`--import-mode=importlib` and execution does not, matching how each has always
run. Changing one without the other silently detaches every result from its tree
node.

## Step discovery — a separate two-phase pipeline

Test discovery is not the same pipeline as *step* discovery, which feeds
completions, hover, go-to-definition, and the Step Browser.

**Phase A — step discovery.** Triggered by saves to files matching
`big-dill.stepDefinitionGlob` (default `**/step_defs/**/*.py`, `**/steps/**/*.py`,
`**/conftest.py`). Runs `pytest --collect-only`; the plugin walks the fixture
registry for functions carrying `_pytest_bdd_step_context` and emits a
`stepDefinitions` payload over the same pipe. Because pytest loads everything
registered in the environment, this covers steps from installed packages as well
as local ones, with no special handling. The result is cached in `StepCache`.

**Phase B — lint.** `pytest --bdd-lint` emits `lintDiagnostics` payloads. With no
`TEST_RUN_PIPE` set the plugin writes human-readable text to stdout instead and
exits non-zero on any error-severity diagnostic, which is what makes it usable as
a CI gate.

The structural linter is a third, independent path: core parses the Gherkin AST
in-process on every edit and needs no subprocess at all. The extension publishes
those to their own `DiagnosticCollection` (`big-dill-gherkin`) so they never
overwrite the Python linter's results (`big-dill`).

### Distributed step library metadata

Step definitions shipped inside a published package can supply completions
*before* any collection run. A package author generates the metadata at packaging
time:

```bash
pytest-big-dill          # writes pytest_big_dill_steps.json
```

and declares it via an entry point so consumers can find it:

```toml
[project.entry-points."pytest_big_dill.steps"]
my-package = "my_package:pytest_big_dill_steps.json"
```

On activation the extension enumerates registered `pytest_big_dill.steps` entry
points and loads each file as a base layer (`loadDistributedStepMetadata` in
`extension.ts`). Live Phase A data is merged on top, and **local step definitions
always win** over distributed metadata for the same pattern.

## Gherkin language features

All of these are computed in core over a shared `GherkinParseCache`, which parses
each document once per version and shares the AST. The `@cucumber/gherkin` parser
recovers from errors rather than throwing, so it is safe to run against a file
being actively edited; parse errors surface in the result's `errors[]`.

The extension contributes only the mapping: plain diagnostics become
`vscode.Diagnostic`, plain token positions are encoded for the highlighter, a
plain symbol tree becomes `DocumentSymbol`s, and so on.

### Formatter rules

Only table rows are rewritten; keywords, step text, tags, and blank lines are
left untouched. If the parse produced any errors the formatter returns no edits at
all, so a malformed file is never reflowed.

| | DataTable | Examples body | Examples header |
|---|---|---|---|
| Alignment | Left | Left, but **right-align numeric columns** | Left |
| Padding | One space each side | One space each side | One space each side |
| Column width | Max across all rows | Max across header and body | Same pass as body |

A column counts as numeric when every non-empty cell matches `/^-?\d+(\.\d+)?$/`.

## Packaging

The extension is **bundled** with esbuild into a single `dist/extension.js` and
ships no `node_modules`. That is what makes the npm-workspaces layout viable:
unbundled, `vsce` walks up into the hoisted root and tries to package the whole
development dependency graph.

The npm package is deliberately *not* bundled. Bundling a library hides its
dependency graph from `npm audit`, Dependabot and SBOM tooling, and prevents
consumers deduplicating or overriding a transitive dependency.

## Deliberately out of scope

Recorded so the boundary is not relitigated:

- Phrase and convention validation for *step implementations* — the phrasing rules
  apply to step text written by testers in `.feature` files, not to developers'
  Python code
- Living documentation / HTML report generation
- CI/CD integration or JUnit XML enrichment
- Coverage gap reporting
- Gherkin localisation (multilingual keywords)
- Splitting into an extension pack — one extension for now

## Repository layout

```
core/                    @nokout/big-dill-core (npm)
  src/
    gherkin/             parsing and the per-version cache
    lint/                the structural rules and their dispatch
    completion/          step and parameter completion
    steps/               step index, browser model, stubs, docs, references
    format/  tokens/  symbols/
    tree/                discovery payload -> plain test tree
    results/             execution payload -> outcome decisions
    pytest/              spawning pytest and reading payloads
    ipc/                 the pipe server and frame parsing
    protocol/            the wire contract shared with the plugin

extension/               big-dill (VSIX)
  src/
    testController/      TestController, tree materialisation, run results
    feature*.ts          one adapter per language provider
    extension.ts         activation and registration

pytest-plugin/           pytest-big-dill (PyPI)
  pytest_big_dill/
    hooks.py             collection, metadata, reporting, lint entry
    bridge.py            payload construction and the pipe transport
    step_registry.py     step discovery from the fixture registry
    lint_runner.py       the typed-parameter lint pass

playground/              demo project; every end-to-end check runs against it
```
