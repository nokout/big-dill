"""Unit tests for metadata_gen._build_metadata."""
import json
from pytest_bdd_orama.metadata_gen import _build_metadata
from pytest_bdd_orama.step_types import StepType, StepEnum


class _Colour(StepEnum):
    RED = "red"
    BLUE = "blue"


class _PositiveInt(StepType):
    @classmethod
    def suggested_values(cls) -> list[str]:
        return []

    @classmethod
    def validate(cls, value: str) -> str | None:
        return None if value.isdigit() and int(value) > 0 else f"'{value}' must be positive"


_STEP_DEFS = [
    {
        'keyword': 'given',
        'pattern': 'the colour is {colour:_Colour}',
        'parameters': [
            {'name': 'colour', 'type_name': '_Colour', 'suggested_values': ['red', 'blue'], 'has_validator': True}
        ],
        'file': '/tests/steps/colour_steps.py',
        'line': 10,
        'summary': 'Select a colour.',
        'tags': ['ui'],
        'param_types': ['_Colour'],
    },
    {
        'keyword': 'when',
        'pattern': 'I enter {count} items',
        'parameters': [
            {'name': 'count', 'type_name': '', 'suggested_values': [], 'has_validator': False}
        ],
        'file': '/tests/steps/item_steps.py',
        'line': 25,
        'summary': None,
        'tags': [],
        'param_types': [],
    },
]

_STEP_TYPES = {'_Colour': _Colour, '_PositiveInt': _PositiveInt}


def test_build_metadata_returns_version_2():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['version'] == 2

def test_build_metadata_contains_step_types_key():
    assert 'step_types' in _build_metadata(_STEP_DEFS, _STEP_TYPES)

def test_build_metadata_contains_steps_key():
    assert 'steps' in _build_metadata(_STEP_DEFS, _STEP_TYPES)

def test_build_metadata_steps_has_correct_count():
    assert len(_build_metadata(_STEP_DEFS, _STEP_TYPES)['steps']) == 2

def test_build_metadata_step_has_pattern():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][0]['pattern'] == 'the colour is {colour:_Colour}'

def test_build_metadata_step_has_keyword():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][0]['keyword'] == 'given'

def test_build_metadata_step_has_file():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][0]['file'] == '/tests/steps/colour_steps.py'

def test_build_metadata_step_has_line():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][0]['line'] == 10

def test_build_metadata_step_has_summary():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][0]['summary'] == 'Select a colour.'

def test_build_metadata_step_summary_can_be_none():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][1]['summary'] is None

def test_build_metadata_step_has_tags():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][0]['tags'] == ['ui']

def test_build_metadata_step_tags_empty_when_none():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][1]['tags'] == []

def test_build_metadata_step_has_param_types():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][0]['param_types'] == ['_Colour']

def test_build_metadata_step_param_types_empty_for_untyped():
    assert _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][1]['param_types'] == []

def test_build_metadata_step_has_parameters():
    params = _build_metadata(_STEP_DEFS, _STEP_TYPES)['steps'][0]['parameters']
    assert len(params) == 1
    assert params[0]['name'] == 'colour'
    assert params[0]['type_name'] == '_Colour'
    assert params[0]['suggested_values'] == ['red', 'blue']
    assert params[0]['has_validator'] is True

def test_build_metadata_step_types_dict_unchanged():
    st = _build_metadata(_STEP_DEFS, _STEP_TYPES)['step_types']
    assert '_Colour' in st and '_PositiveInt' in st
    assert st['_Colour']['suggested_values'] == ['red', 'blue']
    assert st['_Colour']['has_validator'] is True
    assert st['_PositiveInt']['suggested_values'] == []
    assert st['_PositiveInt']['has_validator'] is True

def test_build_metadata_is_json_serialisable():
    result = json.loads(json.dumps(_build_metadata(_STEP_DEFS, _STEP_TYPES)))
    assert result['version'] == 2
