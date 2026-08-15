# pytest-big-dill

The pytest plugin for [Big Dill](https://github.com/nokout/big-dill) — tooling for
[pytest-bdd](https://pytest-bdd.readthedocs.io/) that treats the feature file as
the specification.

```bash
pip install pytest-big-dill
```

It registers with pytest automatically. Install it into the environment your
tests run in.

## What it does

- **Feature metadata** — attaches the `.feature` path, scenario name, tags and
  scenario line to each collected pytest-bdd item, so a host can present tests
  grouped by feature file rather than by Python module.
- **Custom scenario names** — name outline rows something meaningful (`[E01]`)
  rather than a concatenation of parameter values.
- **Custom statuses** — report your own outcome strings (`waiting`,
  `knownError`) for a host to map onto its own test states.
- **Linting** — `pytest --bdd-lint` statically checks feature files: typed step
  parameter validation, plus any rules you add.
- **Reporting** — sends discovery and execution payloads to a host over a local
  pipe when one is listening, and is inert otherwise.

## Where this fits

| | |
|---|---|
| **`pytest-big-dill`** | this package — required; it is what knows about your scenarios |
| [`big-dill`](https://marketplace.visualstudio.com/items?itemName=nokout.big-dill) | the VS Code extension |
| [`@nokout/big-dill-core`](https://www.npmjs.com/package/@nokout/big-dill-core) | the headless engine the extension is built on |

Useful on its own as a CI lint gate; the editor experience needs the extension
too.

## Hooks

Implement any of these in your `conftest.py`:

```python
def pytest_big_dill_test_name(scenario_name, example_params, feature_name, feature_path):
    """A display name for a scenario, or None to keep the default."""
    if example_params.get("id"):
        return f"{scenario_name} [{example_params['id']}]"
    return None


def pytest_big_dill_custom_status(report, config):
    """A custom status string for a result, or None."""
    if getattr(report, "wasxfail", None):
        return "knownError"
    return None
```

Two more add your own lint rules, each returning a list of `LintDiagnostic`:

```python
from pytest_big_dill.lint_types import LintDiagnostic

def pytest_big_dill_lint_outline(scenario, examples):
    """Once per Scenario Outline during --bdd-lint."""

def pytest_big_dill_lint_scenario(scenario):
    """Per scenario, and per interpolated Examples row."""
```

Full reference, including typed step parameters:
[developer guide](https://github.com/nokout/big-dill/blob/main/pytest-plugin/developer-guide.md).

## Linting

```bash
pytest --bdd-lint              # every discovered feature file
pytest --bdd-lint path.feature
```

Exits non-zero on any error-severity diagnostic, so it works as a CI gate.

This package contributes the runtime half of the lint story: typed step parameter
validation, undefined-step detection, and whatever your own hooks add. Structural
rules about the Gherkin itself — duplicate scenario names, unused Examples
columns, outlines with a single row — come from the engine and are listed with
everything else in the
[lint rules reference](https://github.com/nokout/big-dill/blob/main/docs/lint-rules.md).

## Documentation

- [Developer guide](https://github.com/nokout/big-dill/blob/main/pytest-plugin/developer-guide.md) — hookspecs, typed steps, custom lint rules
- [Lint rules](https://github.com/nokout/big-dill/blob/main/docs/lint-rules.md) — every diagnostic, across all three packages
- [Repository](https://github.com/nokout/big-dill)

## License

MIT. See [`LICENSE`](https://github.com/nokout/big-dill/blob/main/LICENSE) and
[`THIRD-PARTY-NOTICES.md`](https://github.com/nokout/big-dill/blob/main/THIRD-PARTY-NOTICES.md).
