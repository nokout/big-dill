# Tester Guide

This guide is for people who write `.feature` files and use the VS Code extension to discover, author, and run scenarios.

## Prerequisites

The extension must be installed and the playground (or your project) set up. See [README](../README.md) for installation steps.

## Writing steps with completions

Start a step line with `Given`, `When`, `Then`, `And`, or `But`. Press `Ctrl+Space` to see matching step completions.

- Completions are ranked by how often each step appears in your project
- Steps that accept typed parameters show a pick-list of valid values (e.g. `NSW | Victoria | Queensland`)
- If you've already typed part of a step (including a parameter value), `Ctrl+Space` still shows matching completions

```gherkin
Given the capital of |NSW|Victoria|Queensland|...| is visited
                      ^--- pick-list appears here
```

## Step browser

Open the **Step Browser** panel from the Activity Bar (sidebar icon) or via `View → Open View → Step Browser`.

The panel lists all steps discovered from your project. You can:

- **Group by File** — see which Python file each step lives in
- **Group by Step Type** — see steps grouped by their typed parameter class (e.g. `AustralianState`)
- **Group by Tag** — see steps grouped by their documentation tags
- **Filter** — click the filter icon and type a keyword to narrow the list

Clicking a step in the browser opens the Python implementation at the correct line.

## Hover documentation

Hover over any step in a `.feature` file to see:

- The step pattern (with parameter names)
- A description (from the Python docstring)
- Valid values for typed parameters

## Go to definition

Press `F12` (or right-click → Go to Definition) on a step line to jump to the Python implementation.

## Unimplemented step warnings

Steps with no matching implementation are underlined with a warning. This lets you know before running tests that a step needs to be implemented.

## Docstring data blocks

Steps can accept structured data as inline docstrings. Both triple-quote and backtick delimiters work, and you get syntax highlighting for JSON and YAML content.

**Triple-quote style:**
```gherkin
Given the service is configured with the following JSON:
  """json
  {
    "timeout": 30,
    "retries": 3
  }
  """
```

**Backtick style:**
```gherkin
Given the pipeline is seeded with the following YAML:
  ```yaml
  records:
    - id: 1
      name: Alice
  ```
```

Use the snippets `docstring-json` and `docstring-yaml` to insert a block template quickly.

## Running tests

Open the Testing panel (`Ctrl+Shift+T` or the beaker icon in the Activity Bar). The tree shows:

- Folders mirroring your `features/` directory structure
- Feature files (using the `Feature:` declaration name)
- Individual scenarios

Click the play button next to any item to run it. Click a scenario to jump to its line in the `.feature` file.

## Tags

Tags from your `.feature` files appear in the Testing panel. You can filter runs by tag using the tag filter icon in the Testing panel toolbar.

## Snippets

Type these prefixes and press `Tab` to expand:

| Prefix | Expands to |
|---|---|
| `feature` | Full Feature template with one Scenario |
| `scenario` | Scenario with Given/When/Then |
| `outline` | Scenario Outline with Examples table |
| `background` | Background block |
| `examples` | Examples table |
| `docstring-json` | `"""json` block |
| `docstring-yaml` | `"""yaml` block |
