# Developer Guide

This guide covers implementing step definitions, typed parameters, and custom hooks for Big Dill.

## Step definitions

Steps are standard pytest-bdd decorated functions in your `conftest.py` or step definition files. The extension discovers them automatically.

```python
from pytest_bdd import given, when, then, parsers

@given("the user is logged in")
def user_logged_in():
    pass

@when(parsers.parse("the user navigates to {page}"))
def user_navigates(page: str):
    pass
```

## Typed parameters with StepEnum

`StepEnum` lets you define a closed set of valid values for a step parameter. The extension uses this to:

- Show a pick-list in step completions
- Warn in the linter when an invalid value is used

```python
from pytest_big_dill import StepEnum

class AustralianState(StepEnum):
    NSW = "New South Wales"
    VIC = "Victoria"
    QLD = "Queensland"

@given(parsers.cfparse(
    "the capital of {state:AustralianState} is visited",
    extra_types={"AustralianState": AustralianState},
))
def visit_capital(state: AustralianState):
    ...
```

The enum values (left-hand side: `NSW`, `VIC`) are what testers type in `.feature` files. The display names (right-hand side: `"New South Wales"`) are shown in hover docs.

## Hookspecs

Add these functions to your `conftest.py` to customise extension behaviour.

### `pytest_big_dill_test_name`

Override the display name for scenarios, particularly outline rows:

```python
def pytest_big_dill_test_name(scenario_name, example_params, feature_name, feature_path):
    if not example_params:
        return scenario_name
    if "id" in example_params:
        return f"{scenario_name} [{example_params['id']}]"
    return f"{scenario_name} [{', '.join(str(v) for v in example_params.values())}]"
```

Parameters:
- `scenario_name` — the Gherkin `Scenario:` name
- `example_params` — dict of column name → value for the current outline row (empty for non-outline scenarios)
- `feature_name` — the `Feature:` name
- `feature_path` — absolute path to the `.feature` file

Return `None` to keep the default name.

### `pytest_big_dill_custom_status`

Map sentinel exceptions to custom status strings:

```python
def pytest_big_dill_custom_status(report, config):
    if report.when != "call":
        return None
    longrepr = str(getattr(report, "longrepr", ""))
    if "WaitingSignal" in longrepr:
        return "waiting"
    if "KnownError" in longrepr:
        return "knownError"
    return None
```

The returned string is matched against `big-dill.outcomeMapping` in workspace settings to determine the VS Code run state. See the [extension settings](https://github.com/nokout/big-dill/blob/main/extension/README.md#settings) for valid run states.

### `pytest_big_dill_lint_outline`

Add a custom lint rule for Scenario Outlines. Called once per outline during `--bdd-lint`:

```python
from pytest_big_dill.lint_types import LintDiagnostic

def pytest_big_dill_lint_outline(scenario, examples):
    if scenario.name and not scenario.name[0].isupper():
        return [LintDiagnostic(
            message=f"Scenario Outline name must start with a capital letter: '{scenario.name}'",
            severity="warning",   # "error" | "warning" | "information" | "hint"
        )]
    return []
```

`LintDiagnostic` fields:
- `message` — displayed in the Problems panel
- `severity` — one of `"error"`, `"warning"`, `"information"`, `"hint"`

## Running the linter

```bash
pytest --bdd-lint
```

This runs the built-in structural rules plus any `pytest_big_dill_lint_outline` hooks from your `conftest.py`. It does not run tests — it is a static analysis pass only.

## Docstring parameters

Step functions can receive the content of a Gherkin docstring block by declaring a `docstring` parameter:

```python
import json
import yaml

@given("the service is configured with the following JSON:")
def service_configured(docstring):
    config = json.loads(docstring)

@given("the pipeline is seeded with the following YAML:")
def pipeline_seeded(docstring):
    data = yaml.safe_load(docstring)
```

The `docstring` parameter name is detected by pytest-bdd automatically — no imports required.

## Datatable parameters

Step functions receive datatable data by declaring a `datatable` parameter:

```python
@given("the following users exist")
def users_exist(datatable):
    # datatable is a list of lists; first row is typically headers
    headers, *rows = datatable
    users = [dict(zip(headers, row)) for row in rows]
```

## Metadata for the step browser

The step browser shows hover docs and tags sourced from your step function's docstring. Use Google-style format:

```python
@given(parsers.parse("the user selects {state} from the dropdown"))
def select_state(state: str):
    """Select a value from the state dropdown widget.

    Tags:
        ui, geography
    """
    ...
```

The first line becomes the summary shown on hover. Lines under `Tags:` become the step's tags in the browser.

## Shipping steps in a package

If you publish a package of reusable step definitions, consumers get completions for your
steps as soon as they install it — but only after a discovery run has collected them. To
give them completions immediately, ship a metadata file alongside your code.

Generate it at packaging time:

```bash
pytest-big-dill          # writes pytest_big_dill_steps.json
```

Include that file in your wheel and declare it with an entry point:

```toml
[project.entry-points."pytest_big_dill.steps"]
my-package = "my_package:pytest_big_dill_steps.json"
```

On activation the extension enumerates every registered `pytest_big_dill.steps` entry
point and loads the metadata as a base layer. Live discovery is merged over the top, and
local step definitions always take precedence for the same pattern — so a consumer who
overrides one of your steps sees their own version, not yours.
