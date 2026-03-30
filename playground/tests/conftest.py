"""
Playground conftest.py — all hooks and step definitions in one place.

pytest-bdd steps are discovered from conftest.py automatically, so a single
test_features.py calling scenarios() can pick up all feature files without
any per-feature registration.
"""
import pytest
from pytest_bdd import given, parsers, then, when


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
# Step definitions — typed_steps.feature (demonstrates StepType/StepEnum)
# ---------------------------------------------------------------------------
from pytest_bdd_orama import StepEnum


class AustralianState(StepEnum):
    NSW = "NSW"
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
