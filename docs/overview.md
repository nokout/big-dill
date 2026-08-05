# Big Dill — Overview

Big Dill is a VS Code extension that makes writing and running BDD tests feel natural. It connects VS Code's Testing panel directly to pytest-bdd projects and provides authoring tools designed for testers who may not be comfortable in Python.

## What you get

### Testing panel integration

Gherkin scenarios appear in the Testing panel as a navigable tree that mirrors your feature file structure — not a flat list of mangled Python function names. Clicking a scenario jumps to the exact line in the `.feature` file.

### Authoring assistance

- **Step completions** — type a `Given`/`When`/`Then` line and press `Ctrl+Space` to see all matching steps, ranked by how often they're used in your project
- **Typed parameter completions** — for steps that accept typed values (e.g. an Australian state), the completion shows a pick-list of valid choices
- **Step browser** — a sidebar panel listing every available step, grouped by file, step type, or tag, with keyword filter
- **Hover docs** — hover over a step in a `.feature` file to see its signature and description
- **Go to definition** — `F12` from a step jumps to the Python implementation
- **Unimplemented step warnings** — steps with no matching implementation are flagged inline
- **Structural linting** — flags empty Examples blocks, duplicate rows, oversized tables, and more

### Syntax support

- Keyword highlighting for all Gherkin constructs
- Embedded JSON and YAML syntax highlighting inside `"""json` / `"""yaml` docstring blocks and ` ```json ` / ` ```yaml ` backtick blocks
- Snippets for Feature, Scenario, Scenario Outline, Background, Examples, and docstring blocks

## Who it's for

| Role | What they use |
|---|---|
| **Tester / feature writer** | Step completions, step browser, hover docs, linting — write valid Gherkin without developer help |
| **Developer** | Go-to-definition, unimplemented step warnings, step stub generation, type system for typed params |
| **Team lead** | Tag allowlist validation, phrasing rules, custom status mapping |

## Further reading

- [Tester guide](tester-guide.md) — using the VS Code authoring features
- [Developer guide](developer-guide.md) — implementing hooks, typed steps, and custom lint rules
- [README](../README.md) — architecture, getting started, and configuration reference
