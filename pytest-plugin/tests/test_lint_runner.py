# pytest-plugin/tests/test_lint_runner.py
from pytest_bdd_orama.lint_runner import (
    interpolate_scenario,
    match_step_params,
    validate_step_params,
)
from pytest_bdd_orama.lint_types import InterpolatedScenario
from pytest_bdd_orama.step_types import StepEnum


class AustralianState(StepEnum):
    NSW = "NSW"
    VIC = "Victoria"


STEP_DEF = {
    'keyword': 'given',
    'pattern': 'the state is {state:AustralianState}',
    'parameters': [{
        'name': 'state',
        'type_name': 'AustralianState',
        'suggested_values': AustralianState.suggested_values(),
        'has_validator': True,
    }],
}

STEP_TYPES = {'AustralianState': AustralianState}


# --- match_step_params ---

def test_match_returns_param_values_on_match():
    assert match_step_params('the state is NSW', STEP_DEF) == {'state': 'NSW'}


def test_match_returns_none_on_no_match():
    assert match_step_params('something else entirely', STEP_DEF) is None


# --- validate_step_params ---

def test_validate_valid_value_returns_empty_list():
    result = validate_step_params('the state is NSW', STEP_DEF, STEP_TYPES, line_number=5)
    assert result == []


def test_validate_invalid_value_returns_diagnostic():
    result = validate_step_params('the state is Narnia', STEP_DEF, STEP_TYPES, line_number=5)
    assert len(result) == 1
    assert 'Narnia' in result[0].message
    assert result[0].line == 5
    assert result[0].severity == 'error'


def test_validate_step_without_validator_returns_empty():
    step_def = {
        'keyword': 'given',
        'pattern': 'I have {count:int} items',
        'parameters': [{'name': 'count', 'type_name': 'int', 'suggested_values': [], 'has_validator': False}],
    }
    result = validate_step_params('I have 5 items', step_def, {}, line_number=1)
    assert result == []


# --- interpolate_scenario ---

class _FakeStep:
    def __init__(self, keyword, name, line_number=None):
        self.keyword = keyword
        self.name = name
        self.line_number = line_number


class _FakeScenario:
    def __init__(self, name, steps, tags=None, line_number=1):
        self.name = name
        self.steps = steps
        self.tags = tags or []
        self.line_number = line_number


def test_interpolate_substitutes_placeholders():
    scenario = _FakeScenario(
        name="state is <state>",
        steps=[
            _FakeStep("Given", "the state is <state>"),
            _FakeStep("Then", "it should be valid"),
        ],
    )
    result = interpolate_scenario(scenario, {"state": "NSW"})

    assert isinstance(result, InterpolatedScenario)
    assert result.name == "state is NSW"
    assert result.steps[0].text == "the state is NSW"
    assert result.steps[1].text == "it should be valid"


def test_interpolate_preserves_tags_and_line():
    scenario = _FakeScenario(name="s", steps=[], tags=["smoke"], line_number=7)
    result = interpolate_scenario(scenario, {})
    assert result.tags == ["smoke"]
    assert result.line_number == 7
