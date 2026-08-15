# Big Dill

[![CI](https://github.com/nokout/big-dill/actions/workflows/ci.yml/badge.svg)](https://github.com/nokout/big-dill/actions/workflows/ci.yml)
[![Security](https://github.com/nokout/big-dill/actions/workflows/security.yml/badge.svg)](https://github.com/nokout/big-dill/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/nokout/big-dill/badge)](https://scorecard.dev/viewer/?uri=github.com/nokout/big-dill)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Big Dill Driven Development** — tooling for [pytest-bdd](https://pytest-bdd.readthedocs.io/)
that treats the feature file as the specification rather than an accident of how
the tests are written.

VS Code's built-in Python test runner shows pytest-bdd scenarios as a tree of
Python modules with mangled function names. That is the wrong mental model: the
`.feature` file is the specification; the Python test function is an
implementation detail. Big Dill shows the Gherkin instead —

```
Features 🗂
  Outlines 🗂
    Complex outline id things and stuff 🗒
      Process complex data [E01]   @alpha_examples
      Process complex data [E02]   @other_examples
  States 🗂
    Basic test states 🗒
      A passing scenario            @passes
      A failing scenario            @fails
      ⏳ A waiting scenario         @waits
```

— and adds the authoring tools that make writing Gherkin bearable: step
completion, hover documentation, go-to-definition, a step browser, structural
linting, and table formatting.

## Three packages

Each is published separately and usable on its own.

| Package | Registry | What it is |
|---|---|---|
| [`pytest-big-dill`](pytest-plugin/) | PyPI | The pytest plugin. Attaches BDD metadata, adds display-name/status/lint hooks and a `--bdd-lint` CLI gate. **Required** — it is what knows about your scenarios. |
| [`big-dill`](extension/) | VS Code Marketplace | The extension. A Testing panel that shows scenarios, plus the authoring tools. |
| [`@nokout/big-dill-core`](core/) | npm | The headless engine: Gherkin parsing, linting, completion, test-tree shape, pytest orchestration. No editor dependency. |

### How they fit together

```
  ┌─────────────────────┐        ┌──────────────────────┐
  │  big-dill           │  uses  │  @nokout/big-dill-   │
  │  (VS Code extension)│───────▶│  core (npm)          │
  └─────────────────────┘        └──────────┬───────────┘
                                            │ spawns pytest,
                                            │ reads payloads
                                            │ over a local pipe
                                 ┌──────────▼───────────┐
                                 │  pytest-big-dill     │
                                 │  (in your venv)      │
                                 └──────────────────────┘
```

The extension is a thin adapter: it maps plain results from core onto editor
types and registers them. Core does the work and talks to the plugin. The plugin
runs inside your pytest process and reports what it finds.

Because core needs no editor, anything that runs Node can host it — a CI lint
gate, a script, another editor. See
[`core/adapter-contract.md`](core/adapter-contract.md) if you want to build one.

## Getting started

**Using it:** install [`pytest-big-dill`](pytest-plugin/) into the environment your
tests run in, then install the [extension](extension/). The extension's
[README](extension/README.md) covers settings and the feature tour.

**Working on it:** you need Node 18+ (20 LTS recommended), Python 3.10+, and VS
Code 1.87+. The Python extension is optional — set `big-dill.pythonPath` if you
do not have it.

```bash
npm ci                    # installs both npm packages and builds core
./build.sh --install      # builds the VSIX and installs it   (bash; WSL or Git Bash on Windows)
```

Then set up the demo project, which every end-to-end check runs against:

```bash
cd playground
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ../pytest-plugin -e .
```

Open the repo root as your workspace — `.vscode/settings.json` already points the
extension at `playground/`.

### Iterating on the extension

Press `F5` for the **Run Extension** launch config. It starts the esbuild watcher,
opens an Extension Development Host with `playground/` loaded, and attaches the
debugger. The loop is:

```
save  →  watcher rebuilds (~50 ms)  →  Ctrl+R in the dev host window
```

VS Code cannot hot-swap a running extension, so the reload is required. An
installed `.vsix` is a frozen copy and never picks up source changes — iterate in
the dev host and only run `./build.sh --install` to refresh what is installed.

```bash
npm test --workspaces          # core + extension
cd pytest-plugin && pytest     # plugin
```

## Documentation

| Where | What |
|---|---|
| [`extension/README.md`](extension/README.md) | The Marketplace listing: features, screenshots, settings |
| [`extension/tester-guide.md`](extension/tester-guide.md) | Writing `.feature` files with the authoring tools |
| [`pytest-plugin/README.md`](pytest-plugin/README.md) | The PyPI listing: install, hooks, `--bdd-lint` |
| [`pytest-plugin/developer-guide.md`](pytest-plugin/developer-guide.md) | Step definitions, typed parameters, hookspecs, custom lint rules |
| [`core/README.md`](core/README.md) | The npm listing for the engine |
| [`core/adapter-contract.md`](core/adapter-contract.md) | Building a host on core — the API, and what a host must supply |
| [`docs/lint-rules.md`](docs/lint-rules.md) | Every diagnostic the linter can raise, across all three packages |
| [`docs/architecture.md`](docs/architecture.md) | How the pieces work — Testing API integration, IPC, the wire protocol |
| [`SECURITY.md`](SECURITY.md) | Trust model, supply chain, reporting a vulnerability |

Documentation about a package lives with that package. Only genuinely
cross-cutting material is in `docs/`. Planned work and open decisions live in
[GitHub issues](https://github.com/nokout/big-dill/issues) rather than in files,
and superseded specs are not kept — git history has them.

## Packaging note

Marketplace listing images must be absolute HTTPS URLs, so publishing uses
`npm run package:marketplace`. Its `--baseImagesUrl` stops at `extension`, **not**
`extension/images`: the listing already references `images/<name>.png`, and vsce
joins the base to that relative path, so an extra `/images` makes every screenshot
404. The script exists so this is not retyped from memory.

## License

MIT — see [`LICENSE`](LICENSE) and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
