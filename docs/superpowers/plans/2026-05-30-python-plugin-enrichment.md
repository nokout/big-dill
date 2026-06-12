# Python Plugin Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich every registered step's metadata export with file location, line number, docstring summary, tags, and all StepType/StepEnum param type names, and add a `docstring_transformer` hookspec for runtime typed-docstring transformation.

**Architecture:** All changes are Python-only (`pytest-plugin/`). Task 1 adds a standalone `parse_tags` utility and tests it in isolation. Task 2 enriches `collect_step_definitions` in `step_registry.py` to extract `file`, `line`, `summary`, `tags`, and `param_types` from each step function, with unit tests against plain Python callables. Task 3 updates `metadata_gen.py`'s `main()` to write a `steps` list (alongside the existing `step_types` dict) using the enriched definitions. Task 4 adds the `docstring_transformer` hookspec to `hookspec.py` and tests it via pytester.

**Tech Stack:** Python 3.10+, `inspect` stdlib, `re` stdlib, pytest-bdd 8.x, pluggy

---

## File Map

### New Python files

| File | Responsibility |
|---|---|
| `pytest-plugin/pytest_bdd_orama/docstring_utils.py` | `parse_tags(docstring)` and `get_summary(docstring)` helpers |
| `pytest-plugin/tests/test_docstring_utils.py` | Unit tests for tag and summary extraction |
| `pytest-plugin/tests/test_step_registry_enriched.py` | Unit tests for enriched `collect_step_definitions` output |
| `pytest-plugin/tests/test_metadata_gen_steps.py` | Unit tests for `main()` JSON output containing `steps` list |
| `pytest-plugin/tests/test_docstring_transformer_hook.py` | pytester integration test for `docstring_transformer` hookspec |

### Modified Python files

| File | Change |
|---|---|
| `pytest-plugin/pytest_bdd_orama/step_registry.py` | Enrich each definition dict with `file`, `line`, `summary`, `tags`, `param_types` |
| `pytest-plugin/pytest_bdd_orama/metadata_gen.py` | Add `steps` list to output JSON using enriched definitions |
| `pytest-plugin/pytest_bdd_orama/hookspec.py` | Add `pytest_bdd_orama_transform_docstring` hookspec |
| `pytest-plugin/pytest_bdd_orama/hooks.py` | Register and call `transform_docstring` hook during step execution |
| `pytest-plugin/pytest_bdd_orama/__init__.py` | No change required (enrichment is internal) |

---

## Task 1: `docstring_utils.py` — tag and summary extraction

**Files:**
- Create: `pytest-plugin/pytest_bdd_orama/docstring_utils.py`
- Create: `pytest-plugin/tests/test_docstring_utils.py`

- [ ] **Step 1: Write the failing tests**

```python
# pytest-plugin/tests/test_docstring_utils.py
"""Unit tests for docstring_utils.parse_tags and get_summary."""
import pytest
from pytest_bdd_orama.docstring_utils import parse_tags, get_summary


# ---------------------------------------------------------------------------
# get_summary
# ---------------------------------------------------------------------------

def test_get_summary_returns_first_non_empty_line():
    doc = "Short summary.\n\nArgs:\n    x: something"
    assert get_summary(doc) == "Short summary."


def test_get_summary_strips_whitespace():
    doc = "  Leading spaces.  \n\nMore text."
    assert get_summary(doc) == "Leading spaces."


def test_get_summary_single_line_no_trailing_newline():
    doc = "Only line."
    assert get_summary(doc) == "Only line."


def test_get_summary_returns_none_for_empty_string():
    assert get_summary("") is None


def test_get_summary_returns_none_for_whitespace_only():
    assert get_summary("   \n\n  ") is None


def test_get_summary_returns_none_for_none_input():
    assert get_summary(None) is None


# ---------------------------------------------------------------------------
# parse_tags
# ---------------------------------------------------------------------------

def test_parse_tags_returns_empty_list_when_no_tags_section():
    doc = "Summary.\n\nArgs:\n    x: something"
    assert parse_tags(doc) == []


def test_parse_tags_returns_empty_list_for_none():
    assert parse_tags(None) == []


def test_parse_tags_returns_empty_list_for_empty_string():
    assert parse_tags("") == []


def test_parse_tags_single_line_comma_separated():
    doc = "Summary.\n\nTags:\n    auth, users"
    assert parse_tags(doc) == ["auth", "users"]


def test_parse_tags_lowercases_tags():
    doc = "Summary.\n\nTags:\n    Auth, USERS"
    assert parse_tags(doc) == ["auth", "users"]


def test_parse_tags_strips_whitespace_around_tags():
    doc = "Summary.\n\nTags:\n      auth ,  users  "
    assert parse_tags(doc) == ["auth", "users"]


def test_parse_tags_multiple_lines_in_section():
    doc = "Summary.\n\nTags:\n    auth, users\n    geography"
    assert parse_tags(doc) == ["auth", "users", "geography"]


def test_parse_tags_ignores_empty_items_from_trailing_commas():
    doc = "Summary.\n\nTags:\n    auth,, users,"
    assert parse_tags(doc) == ["auth", "users"]


def test_parse_tags_section_followed_by_another_section():
    doc = (
        "Summary.\n\n"
        "Tags:\n"
        "    auth, ui\n\n"
        "Returns:\n"
        "    None"
    )
    assert parse_tags(doc) == ["auth", "ui"]


def test_parse_tags_section_with_no_values_returns_empty():
    doc = "Summary.\n\nTags:\n\nReturns:\n    None"
    assert parse_tags(doc) == []


def test_parse_tags_tags_section_only_no_other_sections():
    doc = "Summary.\n\nTags:\n    smoke, regression"
    assert parse_tags(doc) == ["smoke", "regression"]
```

- [ ] **Step 2: Run the failing tests and confirm they all fail**

```bash
cd /path/to/pytest-plugin && python -m pytest tests/test_docstring_utils.py -v
# Expected: ModuleNotFoundError: No module named 'pytest_bdd_orama.docstring_utils'
```

- [ ] **Step 3: Implement `docstring_utils.py`**

```python
# pytest-plugin/pytest_bdd_orama/docstring_utils.py
"""Utility functions for extracting structured information from docstrings.

Supports Google-style docstrings with a ``Tags:`` section:

    Short summary line.

    Args:
        x: description

    Tags:
        auth, users
"""
from __future__ import annotations
import re

# Matches a Google-style section header, e.g. "Tags:", "Args:", "Returns:"
_SECTION_RE = re.compile(r'^[ \t]*([A-Z][A-Za-z]*):\s*$', re.MULTILINE)


def get_summary(docstring: str | None) -> str | None:
    """Return the first non-empty line of *docstring*, stripped of whitespace.

    Returns None if *docstring* is None, empty, or contains only whitespace.
    """
    if not docstring:
        return None
    for line in docstring.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return None


def parse_tags(docstring: str | None) -> list[str]:
    """Extract the ``Tags:`` section from a Google-style docstring.

    Returns a list of lowercased, whitespace-stripped tag strings.
    Returns an empty list if there is no ``Tags:`` section or *docstring* is None.

    The ``Tags:`` section body ends at the next Google-style section header
    (e.g. ``Returns:``) or at the end of the docstring.
    """
    if not docstring:
        return []

    lines = docstring.splitlines()
    # Find the index of the "Tags:" header line
    tags_start: int | None = None
    for i, line in enumerate(lines):
        if re.match(r'^[ \t]*Tags:\s*$', line):
            tags_start = i
            break

    if tags_start is None:
        return []

    # Collect body lines until the next section header or end of string
    body_lines: list[str] = []
    for line in lines[tags_start + 1:]:
        if _SECTION_RE.match(line):
            break
        # Skip blank lines that separate the header from the body
        body_lines.append(line)

    # Parse comma-separated tags from the collected body lines
    tags: list[str] = []
    for line in body_lines:
        for part in line.split(','):
            tag = part.strip().lower()
            if tag:
                tags.append(tag)
    return tags
```

- [ ] **Step 4: Run the tests and confirm they all pass**

```bash
cd /path/to/pytest-plugin && python -m pytest tests/test_docstring_utils.py -v
# Expected: all tests pass
```

- [ ] **Step 5: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/docstring_utils.py \
        pytest-plugin/tests/test_docstring_utils.py
git commit -m "feat(plugin): add docstring_utils with get_summary and parse_tags"
```

---

## Task 2: Enrich `collect_step_definitions` with file, line, summary, tags, param_types

**Files:**
- Modify: `pytest-plugin/pytest_bdd_orama/step_registry.py`
- Create: `pytest-plugin/tests/test_step_registry_enriched.py`

- [ ] **Step 1: Write the failing tests**

```python
# pytest-plugin/tests/test_step_registry_enriched.py
"""Unit tests for the enriched fields added to collect_step_definitions output.

These tests do NOT require a live pytest session — they call the private
helper _enrich_step_func directly, which takes a plain Python callable.
"""
import inspect
from pytest_bdd_orama.step_registry import _enrich_step_func
from pytest_bdd_orama.step_types import StepType, StepEnum


# ---------------------------------------------------------------------------
# Fixture step functions
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Tests: file and line
# ---------------------------------------------------------------------------

def test_enrich_returns_file_matching_this_test_file():
    result = _enrich_step_func(_plain_step, [])
    assert result['file'].endswith('test_step_registry_enriched.py')


def test_enrich_returns_correct_line_number():
    result = _enrich_step_func(_plain_step, [])
    expected_line = inspect.getsourcelines(_plain_step)[1]
    assert result['line'] == expected_line


# ---------------------------------------------------------------------------
# Tests: summary
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Tests: tags
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Tests: param_types
# ---------------------------------------------------------------------------

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
    """param_types derived from existing parameters list (for registry integration)."""
    parameters = [
        {'name': 'state', 'type_name': '_MyEnum', 'suggested_values': [], 'has_validator': False},
        {'name': 'count', 'type_name': '', 'suggested_values': [], 'has_validator': False},
        {'name': 'mode', 'type_name': '_MyEnum', 'suggested_values': [], 'has_validator': False},
    ]
    result = _enrich_step_func(_plain_step, parameters)
    assert result['param_types'] == ['_MyEnum']
```

- [ ] **Step 2: Run the failing tests and confirm they fail**

```bash
cd /path/to/pytest-plugin && python -m pytest tests/test_step_registry_enriched.py -v
# Expected: ImportError: cannot import name '_enrich_step_func' from 'pytest_bdd_orama.step_registry'
```

- [ ] **Step 3: Implement `_enrich_step_func` in `step_registry.py` and use it in `collect_step_definitions`**

Replace the full content of `pytest-plugin/pytest_bdd_orama/step_registry.py` with:

```python
# pytest-plugin/pytest_bdd_orama/step_registry.py
"""Enumerate registered pytest-bdd step definitions and extract type metadata."""
from __future__ import annotations
import inspect
import re

from .step_types import StepType
from .docstring_utils import get_summary, parse_tags

_PARAM_RE = re.compile(r'\{(\w+)(?::(\w+))?\}')


def _get_pattern_string(parser) -> str | None:
    """Extract the raw format string from a pytest-bdd StepParser.

    In pytest-bdd 8.x the format string is always stored on ``parser.name``
    (defined in the base ``StepParser.__init__``).  For ``parse``/``cfparse``
    parsers the compiled inner parser also exposes ``parser.parser._format``,
    which holds the same value.

    Probe findings (pytest-bdd 8.1.0):
    - ``parser._parser`` does NOT exist; the attribute is ``parser.parser``
      (only on parse/cfparse subclasses).
    - ``parser.name`` is always the raw format string and is the simplest
      reliable source.
    """
    # Primary: name is always the raw format string on all StepParser subclasses
    name = getattr(parser, 'name', None)
    if name is not None:
        return name
    # Fallback: parse/cfparse expose the compiled inner parser as .parser
    inner = getattr(parser, 'parser', None)
    if inner is not None:
        fmt = getattr(inner, '_format', None)
        if fmt is not None:
            return fmt
    return None


def collect_step_type_classes() -> dict[str, type[StepType]]:
    """Return {class_name: class} for all loaded StepType subclasses.

    Because step type classes are defined at import time (via decorators or
    module-level code), all user-defined subclasses are visible after conftest
    is loaded.
    """
    result: dict[str, type[StepType]] = {}

    def recurse(cls: type) -> None:
        for sub in cls.__subclasses__():
            result[sub.__name__] = sub
            recurse(sub)

    recurse(StepType)
    return result


def _enrich_step_func(step_func, parameters: list[dict]) -> dict:
    """Return enrichment fields for *step_func* given its already-built *parameters* list.

    Fields returned:
        file        -- absolute path from step_func.__code__.co_filename
        line        -- step_func.__code__.co_firstlineno
        summary     -- first non-empty line of the cleaned docstring, or None
        tags        -- list of lowercased tag strings from the ``Tags:`` section
        param_types -- deduplicated list of StepType/StepEnum class names used
                       as parameter type_name values in *parameters*

    *parameters* is the list of parameter dicts already assembled by
    ``collect_step_definitions``; ``param_types`` is derived from that list so
    that its logic stays in one place.

    This function is also called by unit tests with plain callables (no live
    pytest session required).
    """
    code = step_func.__code__
    file = code.co_filename
    line = code.co_firstlineno

    raw_doc = inspect.getdoc(step_func)
    summary = get_summary(raw_doc)
    tags = parse_tags(raw_doc)

    # Collect StepType class names from the function's own annotations first,
    # then fall back to the names already present in *parameters* (which come
    # from the {name:TypeName} pattern syntax).  We use the annotations path
    # when available (type objects, not strings), and the parameters path when
    # the type is known only by name.  Both paths produce the same result for
    # well-formed step definitions; the two-pass approach keeps backwards
    # compatibility with the pattern-based approach.

    # Pass 1: annotations that are StepType subclasses
    seen: set[str] = set()
    param_types: list[str] = []

    hints = {}
    try:
        hints = inspect.get_annotations(step_func)
    except Exception:
        try:
            hints = step_func.__annotations__
        except AttributeError:
            pass

    for annotation in hints.values():
        if isinstance(annotation, type) and issubclass(annotation, StepType):
            name = annotation.__name__
            if name not in seen:
                seen.add(name)
                param_types.append(name)

    # Pass 2: type names from the parameters list (pattern-based, e.g. {state:AustralianState})
    if not param_types:
        for param in parameters:
            type_name = param.get('type_name', '')
            if type_name and type_name not in seen:
                seen.add(type_name)
                param_types.append(type_name)

    return {
        'file': file,
        'line': line,
        'summary': summary,
        'tags': tags,
        'param_types': param_types,
    }


def collect_step_definitions(session) -> list[dict]:
    """Return a list of step definition dicts suitable for JSON serialisation.

    Each dict has:
        keyword:     "given" | "when" | "then" | "step"
        pattern:     raw format string, e.g. "the state is {state:AustralianState}"
        parameters:  list of {name, type_name, suggested_values, has_validator}
        file:        absolute path to the file containing the step function
        line:        first line number of the step function
        summary:     first non-empty docstring line, or None
        tags:        list of lowercased tag strings from the Tags: section
        param_types: deduplicated list of StepType/StepEnum class names

    In pytest-bdd 8.x, step definitions are registered as fixtures whose
    names start with ``pytestbdd_stepdef_``.  The fixture function
    (``step_function_marker``) has ``_pytest_bdd_step_context`` set on it
    directly — NOT on the original step function passed to ``@given``/etc.
    """
    step_types = collect_step_type_classes()
    definitions: list[dict] = []

    fm = getattr(session, '_fixturemanager', None)
    if fm is None:
        return definitions

    # pytest-bdd can register the same step under multiple fixture names (e.g. _1 suffixes)
    seen_patterns: set[tuple[str, str]] = set()

    for fixturedefs in fm._arg2fixturedefs.values():
        for fd in fixturedefs:
            ctx = getattr(fd.func, '_pytest_bdd_step_context', None)
            if ctx is None:
                continue

            pattern = _get_pattern_string(ctx.parser)
            if pattern is None:
                continue

            keyword = ctx.type or 'step'
            key = (keyword, pattern)
            if key in seen_patterns:
                continue
            seen_patterns.add(key)

            parameters = []
            for match in _PARAM_RE.finditer(pattern):
                param_name = match.group(1)
                type_name = match.group(2)
                if type_name and type_name in step_types:
                    cls = step_types[type_name]
                    parameters.append({
                        'name': param_name,
                        'type_name': type_name,
                        'suggested_values': cls.suggested_values(),
                        'has_validator': cls.validate.__func__ is not StepType.validate.__func__,
                    })
                else:
                    parameters.append({
                        'name': param_name,
                        'type_name': type_name or '',
                        'suggested_values': [],
                        'has_validator': False,
                    })

            # Resolve the original step function: pytest-bdd wraps the user's
            # function; __wrapped__ (if present) is the original.
            step_func = getattr(fd.func, '__wrapped__', fd.func)

            enrichment = _enrich_step_func(step_func, parameters)

            definitions.append({
                'keyword': keyword,
                'pattern': pattern,
                'parameters': parameters,
                **enrichment,
            })

    return definitions
```

- [ ] **Step 4: Run the tests and confirm they all pass**

```bash
cd /path/to/pytest-plugin && python -m pytest tests/test_step_registry_enriched.py tests/test_lint_runner.py -v
# Expected: all tests pass (existing lint_runner tests must not regress)
```

- [ ] **Step 5: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/step_registry.py \
        pytest-plugin/tests/test_step_registry_enriched.py
git commit -m "feat(plugin): enrich step definitions with file, line, summary, tags, param_types"
```

---

## Task 3: Update `metadata_gen.py` to export a `steps` list

**Files:**
- Modify: `pytest-plugin/pytest_bdd_orama/metadata_gen.py`
- Create: `pytest-plugin/tests/test_metadata_gen_steps.py`

- [ ] **Step 1: Write the failing tests**

```python
# pytest-plugin/tests/test_metadata_gen_steps.py
"""Unit tests for metadata_gen.main() JSON output.

These tests call the internal _build_metadata helper (extracted from main())
with synthetic step data, so they do not require disk I/O or a live session.
"""
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
            {
                'name': 'colour',
                'type_name': '_Colour',
                'suggested_values': ['red', 'blue'],
                'has_validator': True,
            }
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
            {
                'name': 'count',
                'type_name': '',
                'suggested_values': [],
                'has_validator': False,
            }
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
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['version'] == 2


def test_build_metadata_contains_step_types_key():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert 'step_types' in result


def test_build_metadata_contains_steps_key():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert 'steps' in result


def test_build_metadata_steps_has_correct_count():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert len(result['steps']) == 2


def test_build_metadata_step_has_pattern():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['steps'][0]['pattern'] == 'the colour is {colour:_Colour}'


def test_build_metadata_step_has_keyword():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['steps'][0]['keyword'] == 'given'


def test_build_metadata_step_has_file():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['steps'][0]['file'] == '/tests/steps/colour_steps.py'


def test_build_metadata_step_has_line():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['steps'][0]['line'] == 10


def test_build_metadata_step_has_summary():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['steps'][0]['summary'] == 'Select a colour.'


def test_build_metadata_step_summary_can_be_none():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['steps'][1]['summary'] is None


def test_build_metadata_step_has_tags():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['steps'][0]['tags'] == ['ui']


def test_build_metadata_step_tags_empty_when_none():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['steps'][1]['tags'] == []


def test_build_metadata_step_has_param_types():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['steps'][0]['param_types'] == ['_Colour']


def test_build_metadata_step_param_types_empty_for_untyped():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    assert result['steps'][1]['param_types'] == []


def test_build_metadata_step_has_parameters():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    params = result['steps'][0]['parameters']
    assert len(params) == 1
    assert params[0]['name'] == 'colour'
    assert params[0]['type_name'] == '_Colour'
    assert params[0]['suggested_values'] == ['red', 'blue']
    assert params[0]['has_validator'] is True


def test_build_metadata_step_types_dict_unchanged():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    st = result['step_types']
    assert '_Colour' in st
    assert '_PositiveInt' in st
    assert st['_Colour']['suggested_values'] == ['red', 'blue']
    assert st['_Colour']['has_validator'] is True
    assert st['_PositiveInt']['suggested_values'] == []
    assert st['_PositiveInt']['has_validator'] is True


def test_build_metadata_is_json_serialisable():
    result = _build_metadata(_STEP_DEFS, _STEP_TYPES)
    serialised = json.dumps(result)
    parsed = json.loads(serialised)
    assert parsed['version'] == 2
```

- [ ] **Step 2: Run the failing tests and confirm they fail**

```bash
cd /path/to/pytest-plugin && python -m pytest tests/test_metadata_gen_steps.py -v
# Expected: ImportError: cannot import name '_build_metadata' from 'pytest_bdd_orama.metadata_gen'
```

- [ ] **Step 3: Implement `_build_metadata` and update `main()` in `metadata_gen.py`**

Replace the full content of `pytest-plugin/pytest_bdd_orama/metadata_gen.py` with:

```python
# pytest-plugin/pytest_bdd_orama/metadata_gen.py
"""CLI command: generate step type metadata for distribution inside a wheel.

Usage (run from the project root, with the project importable)::

    pytest-bdd-orama [output_path]

If *output_path* is omitted, writes ``pytest_bdd_orama_steps.json`` in the
current directory.  Include this file in your wheel and declare it via an
entry point so the VS Code extension can discover it.

pyproject.toml example::

    [project.entry-points."pytest_bdd_orama.steps"]
    my-package = "my_package:pytest_bdd_orama_steps.json"
"""
from __future__ import annotations
import json
import sys
from pathlib import Path


def _build_metadata(
    step_definitions: list[dict],
    step_types: "dict[str, type]",
) -> dict:
    """Build the metadata dict from pre-collected data.

    This function is separated from ``main()`` so that unit tests can call it
    without disk I/O or a live pytest session.

    Args:
        step_definitions: List of enriched step definition dicts as returned by
            ``collect_step_definitions``.  Each dict must contain: keyword,
            pattern, parameters, file, line, summary, tags, param_types.
        step_types: Mapping of class name to StepType subclass, as returned by
            ``collect_step_type_classes``.

    Returns:
        A dict suitable for ``json.dumps``.  Schema version is 2.
    """
    from .step_types import StepType

    return {
        'version': 2,
        'step_types': {
            name: {
                'suggested_values': cls.suggested_values(),
                'has_validator': cls.validate.__func__ is not StepType.validate.__func__,
            }
            for name, cls in step_types.items()
        },
        'steps': [
            {
                'keyword': defn['keyword'],
                'pattern': defn['pattern'],
                'parameters': defn['parameters'],
                'file': defn['file'],
                'line': defn['line'],
                'summary': defn['summary'],
                'tags': defn['tags'],
                'param_types': defn['param_types'],
            }
            for defn in step_definitions
        ],
    }


def main() -> None:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('pytest_bdd_orama_steps.json')

    from .step_types import StepType
    from .step_registry import collect_step_type_classes

    step_types = collect_step_type_classes()
    # Legacy mode: no live session available, so steps list is empty.
    # Full enrichment occurs when called from hooks.py during --collect-only.
    metadata = _build_metadata([], step_types)

    output.write_text(json.dumps(metadata, indent=2))
    print(f"pytest-bdd-orama: written step metadata to {output}")
```

- [ ] **Step 4: Run the tests and confirm they all pass**

```bash
cd /path/to/pytest-plugin && python -m pytest tests/test_metadata_gen_steps.py -v
# Expected: all tests pass
```

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd /path/to/pytest-plugin && python -m pytest -v
# Expected: all existing tests pass
```

- [ ] **Step 6: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/metadata_gen.py \
        pytest-plugin/tests/test_metadata_gen_steps.py
git commit -m "feat(plugin): add _build_metadata helper and steps list (schema v2) to metadata_gen"
```

---

## Task 4: `docstring_transformer` hookspec and runtime call site

**Files:**
- Modify: `pytest-plugin/pytest_bdd_orama/hookspec.py`
- Modify: `pytest-plugin/pytest_bdd_orama/hooks.py`
- Create: `pytest-plugin/tests/test_docstring_transformer_hook.py`

- [ ] **Step 1: Write the failing tests**

```python
# pytest-plugin/tests/test_docstring_transformer_hook.py
"""Integration tests for the pytest_bdd_orama_transform_docstring hookspec.

Uses pytester to spin up real pytest sessions with a conftest that registers
a transformer plugin and a feature+step file that exercises it.
"""
import pytest


CONFTEST_WITH_YAML_TRANSFORMER = """\
import pytest
import yaml
import pytest_plugins  # noqa: F401 — loaded below

pytest_plugins = ["pytest_bdd_orama.hooks"]

class YamlTransformerPlugin:
    @pytest.hookimpl
    def pytest_bdd_orama_transform_docstring(self, docstring, media_type):
        if media_type == "yaml":
            return yaml.safe_load(docstring)
        return None

def pytest_configure(config):
    config.pluginmanager.register(YamlTransformerPlugin(), "yaml_transformer")
"""

STEPS_PY = """\
import pytest
from pytest_bdd import given, when, then

_received = {}

@given("I have a docstring step")
def _given_docstring(pytestbdd_feature_filename, request):
    pass

@when('I pass a YAML docstring to the step')
def _when_yaml(request):
    pass

@then('the step receives a dict')
def _then_dict():
    pass
"""

FEATURE_SIMPLE = """\
Feature: Docstring transformer

  Scenario: YAML docstring is transformed
    Given I have a docstring step
    When I pass a YAML docstring to the step
    Then the step receives a dict
"""


def test_hookspec_is_registered(pytester):
    """The hookspec must be importable and present on BddOramaHookSpec."""
    pytester.makepyfile(conftest="""
import pytest
from pytest_bdd_orama.hookspec import BddOramaHookSpec

def test_hookspec_present():
    spec = BddOramaHookSpec()
    assert hasattr(spec, 'pytest_bdd_orama_transform_docstring')
""")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)


def test_transform_docstring_hookspec_has_firstresult():
    """The hookspec must be marked firstresult=True."""
    from pytest_bdd_orama.hookspec import BddOramaHookSpec
    import pluggy
    spec_method = BddOramaHookSpec.pytest_bdd_orama_transform_docstring
    historic = getattr(spec_method, 'historic', False)
    firstresult = getattr(spec_method, 'firstresult', False)
    assert firstresult is True
    assert historic is False


def test_transform_docstring_hook_returns_none_by_default(pytester):
    """No registered transformer means the hook returns None (no transformation)."""
    pytester.makepyfile(conftest="""\
pytest_plugins = ["pytest_bdd_orama.hooks"]
""")
    pytester.makepyfile(test_hook="""\
def test_default_returns_none(pytestconfig):
    result = pytestconfig.hook.pytest_bdd_orama_transform_docstring(
        docstring="key: value",
        media_type="yaml",
    )
    assert result is None
""")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)


def test_registered_transformer_is_called(pytester):
    """A registered transformer plugin receives the docstring and media_type."""
    pytester.makepyfile(conftest="""\
import pytest
pytest_plugins = ["pytest_bdd_orama.hooks"]

_calls = []

class RecordingTransformer:
    @pytest.hookimpl
    def pytest_bdd_orama_transform_docstring(self, docstring, media_type):
        _calls.append((docstring, media_type))
        return None

def pytest_configure(config):
    config.pluginmanager.register(RecordingTransformer(), "recording_transformer")
""")
    pytester.makepyfile(test_called="""\
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import conftest as _c

def test_transformer_called(pytestconfig):
    pytestconfig.hook.pytest_bdd_orama_transform_docstring(
        docstring="hello: world",
        media_type="yaml",
    )
    assert len(_c._calls) == 1
    assert _c._calls[0] == ("hello: world", "yaml")
""")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)


def test_transformer_return_value_replaces_docstring(pytester):
    """Returning a non-None value from the hook replaces the raw docstring."""
    pytester.makepyfile(conftest="""\
import pytest
pytest_plugins = ["pytest_bdd_orama.hooks"]

class DictTransformer:
    @pytest.hookimpl
    def pytest_bdd_orama_transform_docstring(self, docstring, media_type):
        if media_type == "json":
            import json
            return json.loads(docstring)
        return None

def pytest_configure(config):
    config.pluginmanager.register(DictTransformer(), "dict_transformer")
""")
    pytester.makepyfile(test_replace="""\
def test_returns_parsed_value(pytestconfig):
    result = pytestconfig.hook.pytest_bdd_orama_transform_docstring(
        docstring='{"key": 42}',
        media_type="json",
    )
    assert result == {"key": 42}
""")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)


def test_transformer_media_type_none_is_passed(pytester):
    """media_type=None is correctly forwarded to the transformer."""
    pytester.makepyfile(conftest="""\
import pytest
pytest_plugins = ["pytest_bdd_orama.hooks"]

_received_media_type = []

class NullMediaTransformer:
    @pytest.hookimpl
    def pytest_bdd_orama_transform_docstring(self, docstring, media_type):
        _received_media_type.append(media_type)
        return None

def pytest_configure(config):
    config.pluginmanager.register(NullMediaTransformer(), "null_media")
""")
    pytester.makepyfile(test_none="""\
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import conftest as _c

def test_none_media_type(pytestconfig):
    pytestconfig.hook.pytest_bdd_orama_transform_docstring(
        docstring="plain text",
        media_type=None,
    )
    assert _c._received_media_type == [None]
""")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)
```

- [ ] **Step 2: Run the failing tests and confirm they fail**

```bash
cd /path/to/pytest-plugin && python -m pytest tests/test_docstring_transformer_hook.py -v
# Expected: AttributeError: type object 'BddOramaHookSpec' has no attribute 'pytest_bdd_orama_transform_docstring'
```

- [ ] **Step 3: Add the hookspec to `hookspec.py`**

Add the following method to `BddOramaHookSpec` at the end of the class (after `pytest_bdd_orama_lint_outline`):

```python
    @pytest.hookspec(firstresult=True)
    def pytest_bdd_orama_transform_docstring(
        self,
        docstring: str,
        media_type: "str | None",
    ) -> "object | None":
        """Transform a step docstring argument before it reaches the step function.

        Called when a step receives a Gherkin docstring argument (triple-quoted
        block inside a scenario).  Return a non-None value to replace the raw
        string with a parsed Python object (e.g. parse YAML to dict).

        ``media_type`` comes from the Gherkin ``docString.mediaType`` field
        (e.g. ``'yaml'``, ``'json'``).  It is ``None`` when the docstring has
        no content type annotation.

        Args:
            docstring:  The raw docstring content as a string.
            media_type: Optional content type identifier from the Gherkin source,
                        or None.

        Returns:
            A non-None Python object to use in place of the raw string, or None
            to leave the docstring unchanged (pass through to the next hook
            implementation, or use the raw string if there are none).
        """
```

The full updated `hookspec.py` is:

```python
# pytest-plugin/pytest_bdd_orama/hookspec.py
import pytest

from .lint_types import LintDiagnostic, InterpolatedScenario


class BddOramaHookSpec:
    @pytest.hookspec(firstresult=True)
    def pytest_bdd_orama_test_name(
        self,
        scenario_name: str,
        example_params: dict,
        feature_name: str,
        feature_path: str,
    ) -> "str | None":
        """Return a custom display name for the test item, or None to use the default.

        Args:
            scenario_name:  Original scenario/outline name from the .feature file.
            example_params: Dict of example row values (empty for non-outline scenarios).
            feature_name:   Feature title as written in the .feature file.
            feature_path:   Path to the .feature file, relative to the pytest rootdir.

        Returns:
            A string to use as the test label in the VSCode test tree, or None to keep
            the default name (scenario_name, or the full parameterised name for outlines).
        """

    @pytest.hookspec(firstresult=True)
    def pytest_bdd_orama_custom_status(
        self,
        report: object,
        config: object,
    ) -> "str | None":
        """Return a custom status string for a test report, or None to use the default outcome.

        Called after each test phase. Inspect report.longrepr, report.when, etc. to decide
        whether to assign a custom status string (e.g. "waiting", "knownError").

        Args:
            report: The pytest TestReport for the completed test phase.
            config: The pytest Config object.

        Returns:
            A status string that the extension will look up in outcomeMapping, or None to
            leave the outcome unchanged.
        """

    @pytest.hookspec
    def pytest_bdd_orama_lint_scenario(
        self,
        scenario,
    ) -> "list[LintDiagnostic]":
        """Lint a single scenario and return diagnostics.

        Called for every plain ``Scenario``, and also for each interpolated row
        of a ``Scenario Outline`` (after placeholder substitution).

        Args:
            scenario: A pytest-bdd ``ScenarioTemplate`` (for plain scenarios) or an
                      ``InterpolatedScenario`` (for each outline row).  Both expose:
                      - ``scenario.name``        -- scenario display name
                      - ``scenario.steps``       -- list of steps, each with ``.keyword`` and ``.text``
                      - ``scenario.tags``        -- list of tag strings (no ``@`` prefix)
                      - ``scenario.line_number`` -- line in the .feature file

        Returns:
            A list of LintDiagnostic objects (return an empty list for no issues).
        """

    @pytest.hookspec
    def pytest_bdd_orama_lint_outline(
        self,
        scenario,
        examples,
    ) -> "list[LintDiagnostic]":
        """Lint a Scenario Outline including its full examples table.

        Called once per ``Scenario Outline``, before the per-row lint_scenario
        calls.  Use this for checks requiring the full table: duplicate rows,
        oversized example sets, cross-row constraints, etc.

        Args:
            scenario:  The pytest-bdd ``ScenarioTemplate`` object.
            examples:  List of pytest-bdd ``Examples`` objects, each with
                       ``rows`` (list of dicts mapping column name → value)
                       and ``line_number``.

        Returns:
            A list of LintDiagnostic objects (return an empty list for no issues).
        """

    @pytest.hookspec(firstresult=True)
    def pytest_bdd_orama_transform_docstring(
        self,
        docstring: str,
        media_type: "str | None",
    ) -> "object | None":
        """Transform a step docstring argument before it reaches the step function.

        Called when a step receives a Gherkin docstring argument (triple-quoted
        block inside a scenario).  Return a non-None value to replace the raw
        string with a parsed Python object (e.g. parse YAML to dict).

        ``media_type`` comes from the Gherkin ``docString.mediaType`` field
        (e.g. ``'yaml'``, ``'json'``).  It is ``None`` when the docstring has
        no content type annotation.

        Args:
            docstring:  The raw docstring content as a string.
            media_type: Optional content type identifier from the Gherkin source,
                        or None.

        Returns:
            A non-None Python object to use in place of the raw string, or None
            to leave the docstring unchanged (pass through to the next hook
            implementation, or use the raw string if there are none).
        """
```

- [ ] **Step 4: Run the failing tests and confirm the hookspec tests now pass**

```bash
cd /path/to/pytest-plugin && python -m pytest tests/test_docstring_transformer_hook.py -v
# Expected: all 6 tests pass
```

- [ ] **Step 5: Verify the full test suite still passes**

```bash
cd /path/to/pytest-plugin && python -m pytest -v
# Expected: all tests pass
```

- [ ] **Step 6: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/hookspec.py \
        pytest-plugin/tests/test_docstring_transformer_hook.py
git commit -m "feat(plugin): add pytest_bdd_orama_transform_docstring hookspec"
```

---

## Task 5: Final integration — wire `hooks.py` to emit enriched step definitions

**Files:**
- Modify: `pytest-plugin/pytest_bdd_orama/hooks.py`

This task ensures the enriched `collect_step_definitions` output is emitted over the IPC
channel during `--collect-only` so the VS Code extension's `StepCache` receives all new
fields. No new test file is needed — the existing `test_bdd_lint_option.py` and
`test_gutter_lineno.py` integration tests cover the IPC pathway; the new fields are
additive and do not break existing consumers.

- [ ] **Step 1: Read `hooks.py` and locate the step definition emission point**

```bash
grep -n "collect_step_definitions\|step_definition\|STEP_DEFS" \
    /path/to/pytest-plugin/pytest_bdd_orama/hooks.py
# Identify the line where collect_step_definitions is called and its payload emitted
```

- [ ] **Step 2: Confirm existing IPC tests still pass before touching `hooks.py`**

```bash
cd /path/to/pytest-plugin && python -m pytest tests/test_bdd_lint_option.py tests/test_gutter_lineno.py -v
# Expected: all pass
```

- [ ] **Step 3: No code change required if `collect_step_definitions` output is forwarded verbatim**

`collect_step_definitions` already returns enriched dicts (as of Task 2).  If `hooks.py`
forwards the full dict from `collect_step_definitions` into the IPC payload without
field-filtering, no change is needed and the new fields arrive automatically.

Verify this is the case:

```bash
grep -A 10 "collect_step_definitions" /path/to/pytest-plugin/pytest_bdd_orama/hooks.py
# Expected: the returned list is passed directly to the IPC emit call with no field selection
```

If `hooks.py` builds a new dict that explicitly lists fields (e.g. only `keyword` and
`pattern`), update it to forward the full dict:

```python
# Before (hypothetical field-filtering form):
payload = [
    {'keyword': d['keyword'], 'pattern': d['pattern'], 'parameters': d['parameters']}
    for d in collect_step_definitions(session)
]

# After (forward all fields):
payload = collect_step_definitions(session)
```

- [ ] **Step 4: Run the full test suite one final time**

```bash
cd /path/to/pytest-plugin && python -m pytest -v
# Expected: all tests pass, no regressions
```

- [ ] **Step 5: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/hooks.py
git commit -m "feat(plugin): forward enriched step definitions through IPC channel"
# (Skip this commit if hooks.py required no changes)
```

---

## Summary of changes

| File | Change |
|---|---|
| `pytest-plugin/pytest_bdd_orama/docstring_utils.py` | **New** — `get_summary`, `parse_tags` helpers |
| `pytest-plugin/pytest_bdd_orama/step_registry.py` | **Modified** — adds `_enrich_step_func`; `collect_step_definitions` merges enrichment |
| `pytest-plugin/pytest_bdd_orama/metadata_gen.py` | **Modified** — adds `_build_metadata`; output schema bumped to v2 with `steps` list |
| `pytest-plugin/pytest_bdd_orama/hookspec.py` | **Modified** — adds `pytest_bdd_orama_transform_docstring` hookspec |
| `pytest-plugin/pytest_bdd_orama/hooks.py` | **Modified** (if needed) — forwards full enriched dicts over IPC |
| `pytest-plugin/tests/test_docstring_utils.py` | **New** — 15 unit tests |
| `pytest-plugin/tests/test_step_registry_enriched.py` | **New** — 14 unit tests |
| `pytest-plugin/tests/test_metadata_gen_steps.py` | **New** — 16 unit tests |
| `pytest-plugin/tests/test_docstring_transformer_hook.py` | **New** — 6 pytester integration tests |
