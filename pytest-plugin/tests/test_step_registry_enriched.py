"""Unit tests for enriched collect_step_definitions output."""
import inspect

from pytest_big_dill.step_registry import _enrich_step_func
from pytest_big_dill.step_types import StepEnum, StepType


def _plain_step():
    pass

def _step_with_summary():
    """Short summary here."""
    pass

def _step_with_summary_and_tags():
    """Does something useful.

    Tags:
        auth, ui
    """
    pass

def _step_with_tags_no_summary():
    """

    Tags:
        regression, smoke
    """
    pass

class _MyEnum(StepEnum):
    A = "alpha"
    B = "beta"

class _MyType(StepType):
    pass

def _step_with_typed_params(state: _MyEnum, count: _MyType):
    """Typed param step."""
    pass

def _step_plain_params(x: str, y: int):
    """Non-StepType params."""
    pass


def test_enrich_returns_file_matching_this_test_file():
    result = _enrich_step_func(_plain_step, [])
    assert result['file'].endswith('test_step_registry_enriched.py')

def test_enrich_returns_correct_line_number():
    result = _enrich_step_func(_plain_step, [])
    expected_line = inspect.getsourcelines(_plain_step)[1]
    assert result['line'] == expected_line

def test_enrich_returns_none_summary_when_no_docstring():
    result = _enrich_step_func(_plain_step, [])
    assert result['summary'] is None

def test_enrich_returns_first_docstring_line_as_summary():
    result = _enrich_step_func(_step_with_summary, [])
    assert result['summary'] == "Short summary here."

def test_enrich_returns_summary_when_docstring_has_tags_section():
    result = _enrich_step_func(_step_with_summary_and_tags, [])
    assert result['summary'] == "Does something useful."

def test_enrich_returns_none_summary_when_only_blank_first_line():
    result = _enrich_step_func(_step_with_tags_no_summary, [])
    assert result['summary'] is None

def test_enrich_returns_empty_tags_when_no_docstring():
    result = _enrich_step_func(_plain_step, [])
    assert result['tags'] == []

def test_enrich_returns_empty_tags_when_no_tags_section():
    result = _enrich_step_func(_step_with_summary, [])
    assert result['tags'] == []

def test_enrich_returns_tags_from_tags_section():
    result = _enrich_step_func(_step_with_summary_and_tags, [])
    assert result['tags'] == ["auth", "ui"]

def test_enrich_returns_tags_when_no_summary():
    result = _enrich_step_func(_step_with_tags_no_summary, [])
    assert result['tags'] == ["regression", "smoke"]

def test_enrich_param_types_empty_when_no_params():
    result = _enrich_step_func(_plain_step, [])
    assert result['param_types'] == []

def test_enrich_param_types_returns_step_type_class_names():
    result = _enrich_step_func(_step_with_typed_params, [])
    assert result['param_types'] == ['_MyEnum', '_MyType']

def test_enrich_param_types_excludes_non_step_type_annotations():
    result = _enrich_step_func(_step_plain_params, [])
    assert result['param_types'] == []

def test_enrich_param_types_deduplicates_repeated_type():
    def _step_repeated(a: _MyEnum, b: _MyEnum):
        pass
    result = _enrich_step_func(_step_repeated, [])
    assert result['param_types'] == ['_MyEnum']

def test_enrich_param_types_uses_existing_parameters_list():
    parameters = [
        {'name': 'state', 'type_name': '_MyEnum', 'suggested_values': [], 'has_validator': False},
        {'name': 'count', 'type_name': '', 'suggested_values': [], 'has_validator': False},
        {'name': 'mode', 'type_name': '_MyEnum', 'suggested_values': [], 'has_validator': False},
    ]
    result = _enrich_step_func(_plain_step, parameters)
    assert result['param_types'] == ['_MyEnum']
