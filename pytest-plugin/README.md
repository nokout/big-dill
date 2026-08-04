# pytest-bdd-orama

The pytest plugin half of **pytest-bdd-orama** — a [pytest-bdd](https://pytest-bdd.readthedocs.io/)
test runner and Gherkin authoring experience for VS Code.

This package bridges pytest-bdd's data model to the editor: it attaches feature-file
metadata to collected tests, lets you customise how scenarios are named and reported,
and provides a static lint pass over your `.feature` files.

It is useful on its own for the lint pass, but is normally installed alongside the
[VS Code extension](https://github.com/nokout/pytest-bdd-orama).

## Install

```bash
pip install pytest-bdd-orama
```

The plugin registers itself with pytest automatically.

## What it does

- **Feature metadata** — attaches the `.feature` path, scenario name, and tags to each
  collected pytest-bdd item, so the editor can present tests grouped by feature file
  rather than by Python module.
- **Custom scenario names** — name outline rows something meaningful (`[E01]`) instead
  of a concatenation of parameter values.
- **Custom statuses** — report your own outcome strings (`waiting`, `knownError`) and
  map them to editor test states.
- **Linting** — `pytest --bdd-lint` statically checks feature files: typed step
  parameter validation, plus any rules you add yourself.

## Hooks

Implement these in your `conftest.py`:

```python
def pytest_bdd_orama_test_name(scenario_name, example_params, feature_name, feature_path):
    """Return a display name for a scenario, or None to keep the default."""
    if example_params.get("id"):
        return f"{scenario_name} [{example_params['id']}]"
    return None


def pytest_bdd_orama_custom_status(report, config):
    """Return a custom status string for a test result, or None."""
    if getattr(report, "wasxfail", None):
        return "knownError"
    return None
```

Two more hooks add your own lint rules, both returning a list of `LintDiagnostic`:

```python
from pytest_bdd_orama.lint_types import LintDiagnostic

def pytest_bdd_orama_lint_outline(scenario, examples):
    """Called once per Scenario Outline during --bdd-lint."""

def pytest_bdd_orama_lint_scenario(scenario):
    """Called per scenario, and per interpolated Examples row."""
```

## Linting

```bash
pytest --bdd-lint            # lint every discovered feature file
pytest --bdd-lint path.feature
```

Exits non-zero if any error-severity diagnostic is found, so it works as a CI gate.

## Documentation

- [Developer guide](https://github.com/nokout/pytest-bdd-orama/blob/main/docs/developer-guide.md) — full hookspec reference and typed steps
- [Lint rules](https://github.com/nokout/pytest-bdd-orama/blob/main/docs/lint-rules.md)
- [Repository](https://github.com/nokout/pytest-bdd-orama)

## License

Source-available, not open source. You may install and use it freely, including
commercially; redistribution and modification are not permitted. See
[`LICENSE`](https://github.com/nokout/pytest-bdd-orama/blob/main/LICENSE) and
[`THIRD-PARTY-NOTICES.md`](https://github.com/nokout/pytest-bdd-orama/blob/main/THIRD-PARTY-NOTICES.md).
