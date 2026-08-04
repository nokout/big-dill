# Changelog

All notable changes to the pytest-bdd-orama extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Licensing settled ahead of the first public release: the project is now
  source-available rather than MIT. It remains free to install and use,
  including commercially; redistribution and modification are not permitted.
  See `LICENSE` and `THIRD-PARTY-NOTICES.md`.

## [0.1.0] — unreleased

Initial release.

### Added

- **Testing panel integration** — Gherkin scenarios appear as first-class test
  items in a feature-file tree, including Scenario Outline rows.
- **Custom status mapping** — map pytest custom outcome strings to VS Code test
  states via `pytest-bdd-orama.outcomeMapping`.
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
  metadata via the `pytest_bdd_orama.steps` entry point.

[Unreleased]: https://github.com/nokout/pytest-bdd-orama/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nokout/pytest-bdd-orama/releases/tag/v0.1.0
