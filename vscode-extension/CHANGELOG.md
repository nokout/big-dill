# Changelog

All notable changes to the Big Dill extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Renamed to Big Dill** — *Big Dill Driven Development*. Done before the first
  release, so no published version is affected. The extension ID is now
  `nokout.big-dill` and the pytest plugin is `pytest-big-dill` on PyPI.

  Every public identifier moved with it. If you were running a pre-release build
  from source, update:

  | Was | Now |
  |---|---|
  | `pytest-bdd-orama.*` settings | `big-dill.*` |
  | `pytest-bdd-orama.stepBrowser.*` commands | `big-dill.stepBrowser.*` |
  | `pip install pytest-bdd-orama` | `pip install pytest-big-dill` |
  | `import pytest_bdd_orama` | `import pytest_big_dill` |
  | `pytest_bdd_orama_*` hooks | `pytest_big_dill_*` |
  | `pytest_bdd_orama.steps` entry point | `pytest_big_dill.steps` |
  | `pytest_bdd_orama_steps.json` | `pytest_big_dill_steps.json` |

  The hook rename is silent rather than loud — pytest simply stops calling an
  implementation whose name no longer matches a spec, so custom display names,
  statuses, and lint rules would quietly stop working rather than erroring.

- Licensing settled ahead of the first public release: the project is now
  source-available rather than MIT. It remains free to install and use,
  including commercially; redistribution and modification are not permitted.
  See `LICENSE` and `THIRD-PARTY-NOTICES.md`.

### Fixed

- `playground/.vscode/extensions.json` recommended `pytest-bdd-orama.pytest-bdd-runner`,
  a publisher/extension pair that never existed — a leftover from an earlier
  rename. Now correctly `nokout.big-dill`.

## [0.1.0] — unreleased

Initial release.

### Added

- **Testing panel integration** — Gherkin scenarios appear as first-class test
  items in a feature-file tree, including Scenario Outline rows.
- **Custom status mapping** — map pytest custom outcome strings to VS Code test
  states via `big-dill.outcomeMapping`.
- **Feature file authoring** — syntax highlighting, semantic tokens for data
  tables and Examples, snippets, document symbols, hover, go-to-definition, and
  find-references between steps and their Python definitions.
- **Step completion** — suggestions drawn from discovered step definitions,
  including typed step parameters.
- **Step Browser view** — browse discovered steps grouped by file, step type, or
  tag, with filtering.
- **Linting** — 13 built-in structural rules plus configurable tag and phrasing
  checks, surfaced as editor diagnostics and available in CI through the
  plugin's `--bdd-lint` flag.
- **Document formatter** — aligns data tables and Examples tables per column.
- **Distributed step libraries** — third-party packages can contribute step
  metadata via the `pytest_big_dill.steps` entry point.

[Unreleased]: https://github.com/nokout/big-dill/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nokout/big-dill/releases/tag/v0.1.0
