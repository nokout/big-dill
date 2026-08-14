# Big Dill

[![CI](https://github.com/nokout/big-dill/actions/workflows/ci.yml/badge.svg)](https://github.com/nokout/big-dill/actions/workflows/ci.yml)
[![Security](https://github.com/nokout/big-dill/actions/workflows/security.yml/badge.svg)](https://github.com/nokout/big-dill/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/nokout/big-dill/badge)](https://scorecard.dev/viewer/?uri=github.com/nokout/big-dill)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A VS Code extension for [pytest-bdd](https://pytest-bdd.readthedocs.io/) that surfaces Gherkin scenarios as first-class citizens in the Testing panel and provides a full authoring experience for testers writing `.feature` files.

**Quick links:** [Extension listing](extension/README.md) · [Overview](docs/overview.md) · [Tester guide](docs/tester-guide.md) · [Developer guide](docs/developer-guide.md) · [Architecture](docs/architecture.md) · [Lint rules](docs/lint-rules.md)

---

## What it is

VS Code's built-in Python test runner shows pytest-bdd scenarios as a tree of Python modules with mangled function names. This is the wrong mental model for BDD — the feature file is the specification; the Python test function is an implementation detail.

Big Dill replaces that view with one that reflects the Gherkin source:

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

On top of the runner it adds Gherkin authoring tools: step completions, hover docs, go-to-definition, a step browser, structural linting, syntax highlighting, and snippets. The full feature tour with screenshots is in the [extension listing README](extension/README.md); the design deep-dive is in [docs/architecture.md](docs/architecture.md).

Two installable pieces work together:

- **`extension/`** — the TypeScript extension (Testing API controller + language tooling)
- **`pytest-plugin/`** — the `pytest-big-dill` pytest plugin (BDD metadata, display-name/status/lint hookspecs, `--bdd-lint` CLI)

`playground/` is an end-to-end demo project used for manual validation and screenshots.

---

## Getting started

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18 or later (20+ LTS recommended) |
| Python | 3.10 or later |
| VS Code stable or Insiders | 1.87 or later |
| ms-python extension | optional — see `big-dill.pythonPath` |

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
# Produces: extension/big-dill-*.vsix
```

### Set up the playground

```bash
cd playground
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e .                 # installs pytest, pytest-bdd, and pytest-big-dill
pip install -e ../pytest-plugin  # installs the local plugin in editable mode
```

Select the `.venv` interpreter in VS Code (`Ctrl+Shift+P` → `Python: Select Interpreter`), then open the repo root as the workspace — `.vscode/settings.json` already configures the extension for the playground.

Configuration reference: see the [extension listing README](extension/README.md#settings).

---

## Developing the extension

For working on the extension itself, the repo ships a watch/debug workflow in `.vscode/` — don't rebuild and reinstall the `.vsix` on every change.

### Auto-build on watch

`.vscode/tasks.json` defines `watch-extension`, a background task that runs the TypeScript compiler in watch mode (`npm run watch` in `extension/`). It is the default build task, so `Ctrl+Shift+B` starts it. Compile errors stream into the Problems panel as you type; output lands in `extension/dist/`.

The task sources `~/.nvm/nvm.sh` when present, so it also works where node is nvm-managed and the editor wasn't launched from a shell with nvm on `PATH` (e.g. the VSCodium flatpak, whose sandbox has no node of its own).

### Extension Development Host

Press `F5` (the "Run Extension" launch config). This:

1. starts `watch-extension` automatically and waits for the first compile
2. opens an **Extension Development Host** window with `extension/` loaded from source and `playground/` as its workspace
3. attaches the debugger — breakpoints in `src/*.ts` work via source maps

VS Code cannot hot-swap a running extension's code. The iteration loop is:

```
save file  →  watcher recompiles (~1 s)  →  Ctrl+R in the dev host window
```

`Ctrl+R` (`Developer: Reload Window`) reloads the dev host with the fresh build from `dist/`; the debugger reattaches automatically. No re-launch needed.

Note that an installed `.vsix` is a frozen copy — it never picks up source changes. Iterate in the dev host, and run `./build.sh --install` only when you want to refresh the installed version.

### Unit tests

```bash
cd extension
npx jest
```

### README screenshots

The listing screenshots live in `extension/images/` — inside the extension
folder so they are packaged into the VSIX — and the listing README references them
with relative paths.

Packaging must therefore pass `--no-rewrite-relative-links` (the `package` script,
`build.sh`, and CI all do). Without it, vsce rewrites the paths to
`github.com/<repo>/raw/HEAD/images/...`, which is the wrong path — the images are
under `extension/`, not the repository root.

Relative paths render in VS Code's extension details pane and on GitHub. The
Marketplace *web page* requires absolute HTTPS image URLs, so the Marketplace
publish step drops the flag and passes instead:

```bash
npm run package:marketplace
```

which expands to:

```bash
vsce package --baseImagesUrl https://raw.githubusercontent.com/nokout/big-dill/main/extension
```

> **The base URL stops at `extension`, not `extension/images`.** The README
> already references screenshots as `images/<name>.png`, and vsce joins the base to that
> relative path — so including `/images` yields `…/images/images/<name>.png`, and every
> screenshot 404s on the listing page. The `package:marketplace` script exists so this is
> not retyped from memory.

The repository is public, so those URLs resolve.

---

## Documentation map

| Document | Audience |
|---|---|
| [extension/README.md](extension/README.md) | Users — the marketplace listing: features, quick start, settings |
| [docs/overview.md](docs/overview.md) | Everyone — what the project does and who it's for |
| [docs/tester-guide.md](docs/tester-guide.md) | Testers writing `.feature` files |
| [docs/developer-guide.md](docs/developer-guide.md) | Developers implementing steps, hooks, typed steps, custom lint rules |
| [docs/lint-rules.md](docs/lint-rules.md) | Reference — every diagnostic the linter can raise |
| [docs/architecture.md](docs/architecture.md) | Contributors — Testing API integration, IPC, component breakdown, upstream tracking |
| [pytest-plugin/README.md](pytest-plugin/README.md) | Users — the PyPI listing for the pytest plugin |
| [SECURITY.md](SECURITY.md) | Everyone — trust model, supply chain, and how to report a vulnerability |
| [UPSTREAM.md](UPSTREAM.md) | Contributors — which files are adapted from ms-python, and how to re-sync them |

That table plus this file is the whole of the repo's prose. Design rationale belongs in
`architecture.md` and user-facing behaviour in the guides; planned work and open decisions
live in [GitHub issues](https://github.com/nokout/big-dill/issues), not in files.
Superseded specs and plans are not kept — git history has them.
