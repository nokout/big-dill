"""
Playground conftest.py — all hooks and step definitions in one place.


pytest-bdd steps are discovered from conftest.py automatically, so a single
test_features.py calling scenarios() can pick up all feature files without
any per-feature registration.
"""
import json

import pytest
import yaml
from pytest_bdd import given, parsers, then, when
from pytest_bdd_orama import StepEnum


# ---------------------------------------------------------------------------
# Sentinel exceptions — detected by pytest_bdd_orama_custom_status below
# ---------------------------------------------------------------------------

class WaitingSignal(Exception):
    pass


class OtherBadThingSignal(Exception):
    pass


class KnownError(Exception):
    pass


# ---------------------------------------------------------------------------
# Step definitions — basic_states.feature
# ---------------------------------------------------------------------------

@given("a step that passes")
def step_passes():
    pass


@given("a step that fails")
def step_fails():
    raise AssertionError("This step is supposed to fail")


@given("a step that is skipped")
def step_skipped():
    pytest.skip("Skipping this scenario intentionally")


@given("a step that is waiting")
def step_waiting():
    raise WaitingSignal("This scenario is waiting")


@given("a step that causes something bad")
def step_otherbadthing():
    raise OtherBadThingSignal("Something bad happened")


@given("a step that raises a known error")
def step_known_error():
    raise KnownError("A known error occurred")


# ---------------------------------------------------------------------------
# Step definitions — complex_outline.feature
# ---------------------------------------------------------------------------

@given(parsers.parse("a record with id {id}"))
def record_with_id(id):
    return {"id": id}


@when(parsers.parse("processed with {input_a}, {input_b}, {input_c}"))
def process_record(input_a, input_b, input_c):
    pass


@then(parsers.parse("result is {expected}"))
def check_result(expected):
    if expected == "failure":
        raise AssertionError("Expected failure outcome for this example row")


# ---------------------------------------------------------------------------
# Step definitions — typed steps (demonstrates StepType/StepEnum completions)
# ---------------------------------------------------------------------------

class AustralianState(StepEnum):
    NSW = "New South Wales"
    VIC = "Victoria"
    QLD = "Queensland"
    WA = "Western Australia"
    SA = "South Australia"
    TAS = "Tasmania"
    ACT = "Australian Capital Territory"
    NT = "Northern Territory"


@given(parsers.cfparse("the capital of {state:AustralianState} is visited",
                       extra_types={"AustralianState": AustralianState}))
def visit_state_capital(state):
    pass  # step passes for any valid state; invalid states fail lint, not runtime


# ---------------------------------------------------------------------------
# pytest-bdd-orama hook — custom display name (id column for outlines)
# ---------------------------------------------------------------------------

def pytest_bdd_orama_test_name(scenario_name, example_params, feature_name, feature_path):
    if len(example_params.keys()) == 0:
        return scenario_name
    else:
        if "id" in example_params:
            return str(f"{scenario_name} [{example_params["id"]}]")
        return str(f"{scenario_name} [{", ".join(str(v) for v in example_params.values())}]")


# ---------------------------------------------------------------------------
# pytest-bdd-orama hook — map sentinel exceptions to custom status strings
# ---------------------------------------------------------------------------

def pytest_bdd_orama_custom_status(report, config):
    if report.when != "call":
        return None

    longrepr = str(getattr(report, "longrepr", ""))

    if "KnownError" in longrepr:
        return "knownError"

    if "WaitingSignal" in longrepr:
        return "waiting"

    if "OtherBadThingSignal" in longrepr:
        return "otherbadthing"

    return None


# ---------------------------------------------------------------------------
# Step definitions — datatables.feature (demo steps for visual inspection)
# ---------------------------------------------------------------------------

@given("the system is configured with")
def system_configured():
    # Demo step for datatable visualization — table content is not tested
    pass


@given("the following records exist")
def records_exist():
    # Demo step for datatable visualization — table content is not tested
    pass


# ---------------------------------------------------------------------------
# Step definitions — lint_examples.feature (demo steps for visual inspection)
# ---------------------------------------------------------------------------

@given(parsers.parse("value is {x}"))
def value_is(x):
    # Demo step for lint violations visualization
    pass


@given(parsers.parse("item {n}"))
def item_n(n):
    # Demo step for lint violations visualization
    pass


# ---------------------------------------------------------------------------
# Step definitions — docstrings.feature (JSON and YAML data blocks)
# ---------------------------------------------------------------------------

@given("the service is configured with the following JSON:")
def service_configured_json(docstring):
    config = json.loads(docstring)
    assert isinstance(config, dict), "JSON config must be an object"


@when("the service starts")
def service_starts():
    pass


@then("the service is running")
def service_running():
    pass


@given("the pipeline is seeded with the following YAML:")
def pipeline_seeded_yaml(docstring):
    config = yaml.safe_load(docstring)
    assert isinstance(config, dict), "YAML config must be a mapping"


@when("the pipeline runs")
def pipeline_runs():
    pass


@then("the pipeline completes successfully")
def pipeline_completes():
    pass


# ---------------------------------------------------------------------------
# pytest-bdd-orama hook — custom lint rule (demonstrates user-extensible hooks)
#
# Built-in TypeScript linter handles: empty comments, duplicate example rows,
# oversized tables, missing Examples blocks, empty Examples bodies.
# Use this hook for domain-specific rules that belong to your project.
# ---------------------------------------------------------------------------
from pytest_bdd_orama.lint_types import LintDiagnostic


def pytest_bdd_orama_lint_outline(scenario, examples):
    """Require that all Scenario Outline names begin with a capital letter."""
    if scenario.name and not scenario.name[0].isupper():
        return [LintDiagnostic(
            message=f"Scenario Outline name must start with a capital letter: '{scenario.name}'",
            severity="warning",
        )]
    return []
