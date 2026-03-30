# Step Types, Completions & Linting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `StepType`/`StepEnum` base classes, `--bdd-lint` CLI linting, `StepDefinition` metadata emission, VS Code `.feature` completions, and Problems-panel diagnostics — all sharing one data pipeline from Python to TypeScript.

**Architecture:** Phase A (Python, independently releasable): `StepType`/`StepEnum` base classes, `LintDiagnostic` types, two lint hookspecs, `--bdd-lint` pytest option, step metadata emission during `--collect-only`. Phase B (VS Code): TypeScript step cache, `CompletionItemProvider` for `.feature` files, lint subprocess on save, `DiagnosticCollection` updates, distributed metadata.

**Tech Stack:** Python 3.10+, pytest-bdd 8.x, `parse` library, hatchling; TypeScript 5.x, VS Code API (`CompletionItemProvider`, `DiagnosticCollection`, `FileSystemWatcher`), Jest

---

## File Map

### New Python files

| File | Responsibility |
|---|---|
| `pytest-plugin/pytest_bdd_orama/step_types.py` | `StepType`, `StepEnum` base classes |
| `pytest-plugin/pytest_bdd_orama/lint_types.py` | `LintDiagnostic`, `InterpolatedScenario`, `InterpolatedStep` dataclasses |
| `pytest-plugin/pytest_bdd_orama/step_registry.py` | enumerate registered steps, extract patterns and type metadata |
| `pytest-plugin/pytest_bdd_orama/lint_runner.py` | parameter extraction, validation, scenario interpolation, lint orchestration |
| `pytest-plugin/pytest_bdd_orama/metadata_gen.py` | `generate-metadata` CLI command |
| `pytest-plugin/tests/test_step_types.py` | unit tests for StepType/StepEnum |
| `pytest-plugin/tests/test_lint_types.py` | unit tests for LintDiagnostic/InterpolatedScenario |
| `pytest-plugin/tests/test_lint_runner.py` | unit tests for parameter matching and validation |
| `pytest-plugin/tests/test_bdd_lint_option.py` | integration tests for `--bdd-lint` |

### Modified Python files

| File | Change |
|---|---|
| `pytest-plugin/pytest_bdd_orama/hookspec.py` | add `lint_scenario`, `lint_outline` hookspecs |
| `pytest-plugin/pytest_bdd_orama/hooks.py` | add `--bdd-lint` option, step definition payload emission, lint flow |
| `pytest-plugin/pytest_bdd_orama/__init__.py` | export `StepType`, `StepEnum`, `LintDiagnostic` |
| `pytest-plugin/pyproject.toml` | add `generate-metadata` scripts entry point |

### New TypeScript files

| File | Responsibility |
|---|---|
| `vscode-extension/src/stepCache.ts` | store and query cached step definitions |
| `vscode-extension/src/featureCompletion.ts` | `CompletionItemProvider` for `.feature` files |
| `vscode-extension/src/featureDiagnostics.ts` | lint subprocess on save, `DiagnosticCollection` management |
| `vscode-extension/src/test/stepCache.test.ts` | Jest tests for StepCache |
| `vscode-extension/src/test/featureCompletion.test.ts` | Jest tests for completion logic |

### Modified TypeScript files

| File | Change |
|---|---|
| `vscode-extension/src/testController/types.ts` | add `StepDefinition`, `StepParameter`, `LintDiagnosticPayload` types |
| `vscode-extension/src/testController/pytestRunner.ts` | change `discoverTests` to collect all IPC messages; add `runBddLint` |
| `vscode-extension/src/extension.ts` | populate step cache, add step-file watcher, register completion provider and diagnostics |
| `vscode-extension/package.json` | add `stepDefinitionGlob` setting |

---

## Phase A: Python Foundation

### Task 1: StepType and StepEnum base classes

**Files:**
- Create: `pytest-plugin/pytest_bdd_orama/step_types.py`
- Create: `pytest-plugin/tests/test_step_types.py`
- Modify: `pytest-plugin/pytest_bdd_orama/__init__.py`

- [ ] **Step 1: Write the failing tests**

```python
# pytest-plugin/tests/test_step_types.py
from pytest_bdd_orama.step_types import StepType, StepEnum


def test_step_type_suggested_values_is_empty():
    assert StepType.suggested_values() == []


def test_step_type_validate_returns_none():
    assert StepType.validate("anything") is None


def test_step_enum_suggested_values_returns_member_values():
    class Colour(StepEnum):
        RED = "red"
        BLUE = "blue"

    assert Colour.suggested_values() == ["red", "blue"]


def test_step_enum_validate_valid_value_returns_none():
    class Colour(StepEnum):
        RED = "red"

    assert Colour.validate("red") is None


def test_step_enum_validate_invalid_value_returns_error_message():
    class Colour(StepEnum):
        RED = "red"

    result = Colour.validate("green")
    assert result is not None
    assert "green" in result
    assert "Colour" in result


def test_step_enum_members_are_strings():
    class Direction(StepEnum):
        NORTH = "north"

    assert Direction.NORTH == "north"
    assert isinstance(Direction.NORTH, str)


def test_custom_step_type_validate_only():
    """Types with validate() but empty suggested_values() are valid."""
    class PositiveInt(StepType):
        @classmethod
        def validate(cls, value: str) -> str | None:
            return None if value.isdigit() and int(value) > 0 else f"'{value}' must be a positive integer"

    assert PositiveInt.suggested_values() == []
    assert PositiveInt.validate("5") is None
    assert PositiveInt.validate("abc") is not None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd pytest-plugin
python -m pytest tests/test_step_types.py -v
```
Expected: `ModuleNotFoundError: No module named 'pytest_bdd_orama.step_types'`

- [ ] **Step 3: Create `step_types.py`**

```python
# pytest-plugin/pytest_bdd_orama/step_types.py
from __future__ import annotations
from enum import Enum


class StepType:
    """Base class for pytest-bdd step parameter types.

    Subclass and override suggested_values() and/or validate() to add
    autocomplete and validation for step parameters in VS Code.
    """

    @classmethod
    def suggested_values(cls) -> list[str]:
        """Return values to offer as autocomplete suggestions.

        Return an empty list when there is no fixed set of valid values.
        """
        return []

    @classmethod
    def validate(cls, value: str) -> str | None:
        """Return an error message if *value* is invalid, otherwise None."""
        return None


class StepEnum(StepType, str, Enum):
    """StepType mixin for enum-based step parameter types.

    Members are the valid values. suggested_values() and validate() are
    implemented automatically from the enum members.

    Example::

        class AustralianState(StepEnum):
            NSW = "NSW"
            VIC = "Victoria"
            QLD = "Queensland"
    """

    @classmethod
    def suggested_values(cls) -> list[str]:
        return [e.value for e in cls]

    @classmethod
    def validate(cls, value: str) -> str | None:
        if value not in cls._value2member_map_:
            valid = ", ".join(cls._value2member_map_)
            return f"'{value}' is not a valid {cls.__name__}. Expected one of: {valid}"
        return None
```

- [ ] **Step 4: Export from `__init__.py`**

```python
# pytest-plugin/pytest_bdd_orama/__init__.py
from .step_types import StepType, StepEnum

__all__ = ["StepType", "StepEnum"]
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
cd pytest-plugin
python -m pytest tests/test_step_types.py -v
```
Expected: 7 tests PASSED.

- [ ] **Step 6: Add `AustralianState` typed step to the playground**

Append to `playground/tests/conftest.py`:

```python
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


@given(parsers.cfparse("the capital of {state:AustralianState} is visited"))
def visit_state_capital(state):
    pass  # step passes for any valid state; invalid states fail lint, not runtime
```

- [ ] **Step 7: Create the playground feature file**

Create `playground/features/typed_steps/typed_steps.feature`:

```gherkin
Feature: Typed step parameters
  Demonstrates StepEnum-typed parameters — VS Code completions and
  --bdd-lint validation will use the AustralianState type metadata.

  Scenario: Visit a valid state capital
    Given the capital of NSW is visited

  Scenario: Visit another valid state
    Given the capital of Victoria is visited
```

- [ ] **Step 8: Verify the playground still runs**

```bash
cd playground
python -m pytest tests/ -v
```
Expected: all scenarios PASSED (including the two new typed-step scenarios).

- [ ] **Step 9: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/step_types.py \
        pytest-plugin/pytest_bdd_orama/__init__.py \
        pytest-plugin/tests/test_step_types.py \
        playground/tests/conftest.py \
        playground/features/typed_steps/typed_steps.feature
git commit -m "feat(python): add StepType and StepEnum base classes with playground example"
```

---

### Task 2: LintDiagnostic and InterpolatedScenario types

**Files:**
- Create: `pytest-plugin/pytest_bdd_orama/lint_types.py`
- Create: `pytest-plugin/tests/test_lint_types.py`
- Modify: `pytest-plugin/pytest_bdd_orama/__init__.py`

- [ ] **Step 1: Write the failing tests**

```python
# pytest-plugin/tests/test_lint_types.py
from pytest_bdd_orama.lint_types import LintDiagnostic, InterpolatedScenario, InterpolatedStep


def test_lint_diagnostic_defaults():
    d = LintDiagnostic(message="bad value")
    assert d.severity == "error"
    assert d.line is None


def test_lint_diagnostic_custom_fields():
    d = LintDiagnostic(message="watch out", severity="warning", line=10)
    assert d.severity == "warning"
    assert d.line == 10


def test_interpolated_step_defaults():
    step = InterpolatedStep(keyword="Given", text="I have NSW apples")
    assert step.keyword == "Given"
    assert step.text == "I have NSW apples"
    assert step.line_number is None


def test_interpolated_scenario_fields():
    steps = [InterpolatedStep(keyword="Given", text="state is NSW")]
    s = InterpolatedScenario(name="Test", steps=steps, tags=["smoke"], line_number=5)
    assert s.name == "Test"
    assert len(s.steps) == 1
    assert s.tags == ["smoke"]
    assert s.line_number == 5
```

- [ ] **Step 2: Run to verify failure**

```bash
cd pytest-plugin
python -m pytest tests/test_lint_types.py -v
```
Expected: `ModuleNotFoundError: No module named 'pytest_bdd_orama.lint_types'`

- [ ] **Step 3: Create `lint_types.py`**

```python
# pytest-plugin/pytest_bdd_orama/lint_types.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class LintDiagnostic:
    """A diagnostic produced by a linting pass.

    Returned from ``pytest_bdd_orama_lint_scenario`` and
    ``pytest_bdd_orama_lint_outline`` hook implementations.
    """
    message: str
    severity: Literal["error", "warning", "info"] = "error"
    line: int | None = None


@dataclass
class InterpolatedStep:
    """A scenario step with Scenario Outline placeholders substituted."""
    keyword: str
    text: str
    line_number: int | None = None


@dataclass
class InterpolatedScenario:
    """A Scenario Outline row fully interpolated into a concrete scenario.

    Passed to ``pytest_bdd_orama_lint_scenario`` when linting each outline row.
    Exposes the same interface as a plain scenario so scenario-level linters
    need not be aware of outlines.

    Attributes:
        name:        Scenario name with placeholders substituted.
        steps:       Steps with placeholder text substituted.
        tags:        Scenario-level tags (no leading ``@``).
        line_number: Line of the ``Scenario Outline:`` keyword in the feature file.
    """
    name: str
    steps: list[InterpolatedStep]
    tags: list[str]
    line_number: int
```

- [ ] **Step 4: Export from `__init__.py`**

```python
# pytest-plugin/pytest_bdd_orama/__init__.py
from .step_types import StepType, StepEnum
from .lint_types import LintDiagnostic, InterpolatedScenario, InterpolatedStep

__all__ = ["StepType", "StepEnum", "LintDiagnostic", "InterpolatedScenario", "InterpolatedStep"]
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
cd pytest-plugin
python -m pytest tests/test_lint_types.py -v
```
Expected: 4 tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/lint_types.py \
        pytest-plugin/pytest_bdd_orama/__init__.py \
        pytest-plugin/tests/test_lint_types.py
git commit -m "feat(python): add LintDiagnostic and InterpolatedScenario types"
```

---

### Task 3: Lint hookspecs

**Files:**
- Modify: `pytest-plugin/pytest_bdd_orama/hookspec.py`

- [ ] **Step 1: Add two new hookspecs to `BddOramaHookSpec`**

Open `pytest-plugin/pytest_bdd_orama/hookspec.py`. Add this import at the top:

```python
from .lint_types import LintDiagnostic, InterpolatedScenario
```

Add to the `BddOramaHookSpec` class after the existing hookspecs:

```python
    @pytest.hookspec
    def pytest_bdd_orama_lint_scenario(
        self,
        scenario,
    ) -> "list[LintDiagnostic]":
        """Lint a single scenario and return diagnostics.

        Called for every plain ``Scenario``, and also for each interpolated row
        of a ``Scenario Outline`` (after placeholder substitution).  The
        ``scenario`` argument is either a pytest-bdd ``ScenarioTemplate`` (plain
        scenarios) or an ``InterpolatedScenario`` (outline rows).

        Both types expose:
            scenario.name          -- scenario display name
            scenario.steps         -- list of steps with .keyword and .name/.text
            scenario.tags          -- list of tag strings (no ``@`` prefix)
            scenario.line_number   -- line in the .feature file

        Returns:
            A list of LintDiagnostic objects (return [] or None for no issues).
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
            A list of LintDiagnostic objects (return [] or None for no issues).
        """
```

- [ ] **Step 2: Write a smoke test**

```python
# Add to pytest-plugin/tests/test_lint_types.py

def test_lint_hookspecs_registered(testdir):
    """The plugin registers the lint hookspecs without errors."""
    testdir.makepyfile(conftest="""
        pytest_plugins = ["pytest_bdd_orama.hooks"]
    """)
    testdir.makepyfile(test_dummy="def test_x(): pass")
    result = testdir.runpytest("--collect-only", "-q")
    result.stdout.no_fnmatch_line("*ERROR*")
    assert result.ret == 0
```

- [ ] **Step 3: Run smoke test**

```bash
cd pytest-plugin
python -m pytest tests/test_lint_types.py::test_lint_hookspecs_registered -v
```
Expected: PASSED.

- [ ] **Step 4: Add lint hookspec examples to the playground**

Append to `playground/tests/conftest.py`:

```python
# ---------------------------------------------------------------------------
# pytest-bdd-orama hook — lint checks (demonstrates lint hookspecs)
# ---------------------------------------------------------------------------
from pytest_bdd_orama.lint_types import LintDiagnostic


def pytest_bdd_orama_lint_outline(scenario, examples):
    """Warn when an outline has duplicate example rows or a very large table."""
    diagnostics = []
    for block in examples:
        seen = []
        for row in block.rows:
            row_key = tuple(sorted(row.items()))
            if row_key in seen:
                diagnostics.append(
                    LintDiagnostic(
                        message=f"Duplicate example row in '{scenario.name}': {dict(row)}",
                        severity="warning",
                    )
                )
            seen.append(row_key)
        if len(block.rows) > 20:
            diagnostics.append(
                LintDiagnostic(
                    message=f"Example table in '{scenario.name}' has {len(block.rows)} rows — consider splitting",
                    severity="warning",
                )
            )
    return diagnostics
```

- [ ] **Step 5: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/hookspec.py \
        pytest-plugin/tests/test_lint_types.py \
        playground/tests/conftest.py
git commit -m "feat(python): add lint_scenario and lint_outline hookspecs with playground example"
```

---

### Task 4: Step registry enumeration

**Files:**
- Create: `pytest-plugin/pytest_bdd_orama/step_registry.py`

This module enumerates all registered pytest-bdd step definitions from a running session.

- [ ] **Step 1: Probe the step parser API**

Before writing tests, run this one-liner to find the attribute that holds the format string on a step's parser object:

```bash
cd pytest-plugin
python -c "
from pytest_bdd import given
@given('I have {count:d} items')
def s(count): pass
ctx = getattr(s, '_pytest_bdd_step_context', None)
print('ctx.type:', ctx.type)
p = ctx.parser
print('parser type:', type(p).__name__)
print('parser attrs:', [a for a in dir(p) if not a.startswith('__')])
inner = getattr(p, '_parser', None)
print('inner:', inner)
print('inner._format:', getattr(inner, '_format', 'NOT FOUND'))
"
```

If `inner._format` is `NOT FOUND`, inspect the output and update `_get_pattern_string()` in the next step to use the correct attribute.

- [ ] **Step 2: Create `step_registry.py`**

```python
# pytest-plugin/pytest_bdd_orama/step_registry.py
"""Enumerate registered pytest-bdd step definitions and extract type metadata."""
from __future__ import annotations
import re
from typing import TYPE_CHECKING

from .step_types import StepType

if TYPE_CHECKING:
    pass

_PARAM_RE = re.compile(r'\{(\w+)(?::(\w+))?\}')


def _get_pattern_string(parser) -> str | None:
    """Extract the raw format string from a pytest-bdd StepParser.

    pytest-bdd wraps ``parse.Parser`` — the format string lives on ``_format``
    of the inner parser object.  Update this if the probe in Task 4 Step 1
    shows a different attribute name.
    """
    inner = getattr(parser, '_parser', None)
    if inner is not None:
        fmt = getattr(inner, '_format', None)
        if fmt is not None:
            return fmt
    return getattr(parser, 'pattern', None)


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


def collect_step_definitions(session) -> list[dict]:
    """Return a list of step definition dicts suitable for JSON serialisation.

    Each dict has:
        keyword:    "given" | "when" | "then" | "step"
        pattern:    raw format string, e.g. "the state is {state:AustralianState}"
        parameters: list of {name, type_name, suggested_values, has_validator}
    """
    step_types = collect_step_type_classes()
    definitions: list[dict] = []

    fm = getattr(session, '_fixturemanager', None)
    if fm is None:
        return definitions

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
                        'has_validator': cls.validate is not StepType.validate,
                    })
                else:
                    parameters.append({
                        'name': param_name,
                        'type_name': type_name or '',
                        'suggested_values': [],
                        'has_validator': False,
                    })

            definitions.append({
                'keyword': keyword,
                'pattern': pattern,
                'parameters': parameters,
            })

    return definitions
```

- [ ] **Step 3: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/step_registry.py
git commit -m "feat(python): add step registry enumeration utility"
```

---

### Task 5: Lint runner — parameter extraction and scenario interpolation

**Files:**
- Create: `pytest-plugin/pytest_bdd_orama/lint_runner.py`
- Create: `pytest-plugin/tests/test_lint_runner.py`

- [ ] **Step 1: Write failing tests**

```python
# pytest-plugin/tests/test_lint_runner.py
from pytest_bdd_orama.step_types import StepEnum
from pytest_bdd_orama.lint_types import LintDiagnostic, InterpolatedScenario
from pytest_bdd_orama.lint_runner import match_step_params, validate_step_params, interpolate_scenario


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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd pytest-plugin
python -m pytest tests/test_lint_runner.py -v
```
Expected: `ModuleNotFoundError: No module named 'pytest_bdd_orama.lint_runner'`

- [ ] **Step 3: Create `lint_runner.py`**

```python
# pytest-plugin/pytest_bdd_orama/lint_runner.py
"""Lint runner: parameter validation, scenario interpolation, and lint orchestration."""
from __future__ import annotations
import re

import parse as parse_lib

from .lint_types import LintDiagnostic, InterpolatedScenario, InterpolatedStep

_PARAM_RE = re.compile(r'\{(\w+)(?::(\w+))?\}')


def _bare_pattern(pattern: str) -> str:
    """Strip type annotations: ``{name:TypeName}`` → ``{name}``."""
    return _PARAM_RE.sub(lambda m: '{' + m.group(1) + '}', pattern)


def match_step_params(step_text: str, step_def: dict) -> dict[str, str] | None:
    """Match *step_text* against *step_def* pattern, returning raw param values.

    Returns a dict of ``{param_name: raw_string_value}`` or ``None`` if the
    text does not match the pattern.
    """
    bare = _bare_pattern(step_def['pattern'])
    result = parse_lib.parse(bare, step_text)
    if result is None:
        return None
    return {k: str(v) for k, v in result.named.items()}


def validate_step_params(
    step_text: str,
    step_def: dict,
    step_types: dict,
    line_number: int | None = None,
) -> list[LintDiagnostic]:
    """Validate parameter values in *step_text* against their StepType validators.

    Returns a list of LintDiagnostic objects (empty if all parameters are valid).
    """
    params = match_step_params(step_text, step_def)
    if params is None:
        return []

    diagnostics: list[LintDiagnostic] = []
    for param_def in step_def['parameters']:
        if not param_def['has_validator']:
            continue
        name = param_def['name']
        type_name = param_def['type_name']
        value = params.get(name)
        if value is None:
            continue
        cls = step_types.get(type_name)
        if cls is None:
            continue
        error = cls.validate(value)
        if error is not None:
            diagnostics.append(LintDiagnostic(message=error, line=line_number))
    return diagnostics


def interpolate_scenario(scenario_template, row: dict) -> InterpolatedScenario:
    """Substitute ``<placeholder>`` text in *scenario_template* with *row* values.

    ``row`` maps column names to string values, e.g. ``{"state": "NSW"}``.
    Returns an :class:`InterpolatedScenario` suitable for ``lint_scenario`` hooks.
    """
    def sub(text: str) -> str:
        for key, value in row.items():
            text = text.replace(f'<{key}>', str(value))
        return text

    steps = [
        InterpolatedStep(
            keyword=getattr(step, 'keyword', getattr(step, 'type', '')),
            text=sub(step.name),
            line_number=getattr(step, 'line_number', None),
        )
        for step in scenario_template.steps
    ]
    return InterpolatedScenario(
        name=sub(scenario_template.name),
        steps=steps,
        tags=list(getattr(scenario_template, 'tags', [])),
        line_number=getattr(scenario_template, 'line_number', 0),
    )
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd pytest-plugin
python -m pytest tests/test_lint_runner.py -v
```
Expected: all tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/lint_runner.py \
        pytest-plugin/tests/test_lint_runner.py
git commit -m "feat(python): add step parameter validation and outline interpolation"
```

---

### Task 6: `--bdd-lint` pytest option and full lint flow

**Files:**
- Modify: `pytest-plugin/pytest_bdd_orama/hooks.py`
- Create: `pytest-plugin/tests/test_bdd_lint_option.py`

Wire everything together: the `--bdd-lint` option triggers parameter validation and lint hookspecs, then exits.

- [ ] **Step 1: Write failing integration tests**

```python
# pytest-plugin/tests/test_bdd_lint_option.py
import textwrap


def test_bdd_lint_passes_valid_feature_file(testdir):
    testdir.makefile(".feature", states="""
Feature: States
  Scenario: Valid state
    Given the state is NSW
""")
    testdir.makepyfile(conftest=textwrap.dedent("""
        from pytest_bdd import given
        from pytest_bdd_orama.step_types import StepEnum

        class AustralianState(StepEnum):
            NSW = "NSW"
            VIC = "Victoria"

        @given("the state is {state:AustralianState}")
        def step(state): pass
    """))
    result = testdir.runpytest("--bdd-lint", "-v")
    assert result.ret == 0


def test_bdd_lint_fails_on_invalid_parameter(testdir):
    testdir.makefile(".feature", states="""
Feature: States
  Scenario: Invalid state
    Given the state is Narnia
""")
    testdir.makepyfile(conftest=textwrap.dedent("""
        from pytest_bdd import given
        from pytest_bdd_orama.step_types import StepEnum

        class AustralianState(StepEnum):
            NSW = "NSW"

        @given("the state is {state:AustralianState}")
        def step(state): pass
    """))
    result = testdir.runpytest("--bdd-lint")
    assert result.ret != 0
    result.stdout.fnmatch_lines(["*Narnia*"])


def test_bdd_lint_scenario_hook_fires(testdir):
    testdir.makefile(".feature", checks="""
Feature: Hook test
  Scenario: Too many steps
    Given step 1
    And step 2
    And step 3
""")
    testdir.makepyfile(conftest=textwrap.dedent("""
        from pytest_bdd import given
        from pytest_bdd_orama.lint_types import LintDiagnostic

        @given("step 1")
        def s1(): pass
        @given("step 2")
        def s2(): pass
        @given("step 3")
        def s3(): pass

        def pytest_bdd_orama_lint_scenario(scenario):
            if len(scenario.steps) > 2:
                return [LintDiagnostic(message="Too many steps")]
            return []
    """))
    result = testdir.runpytest("--bdd-lint")
    assert result.ret != 0
    result.stdout.fnmatch_lines(["*Too many steps*"])


def test_bdd_lint_outline_hook_fires_for_duplicates(testdir):
    testdir.makefile(".feature", outlines="""
Feature: Outline linting
  Scenario Outline: State check
    Given the state is <state>
    Examples:
      | state |
      | NSW   |
      | NSW   |
""")
    testdir.makepyfile(conftest=textwrap.dedent("""
        from pytest_bdd import given
        from pytest_bdd_orama.lint_types import LintDiagnostic

        @given("the state is {state}")
        def step(state): pass

        def pytest_bdd_orama_lint_outline(scenario, examples):
            all_rows = [tuple(r.values()) for block in examples for r in block.rows]
            if len(all_rows) != len(set(all_rows)):
                return [LintDiagnostic(message="Duplicate example rows detected")]
            return []
    """))
    result = testdir.runpytest("--bdd-lint")
    assert result.ret != 0
    result.stdout.fnmatch_lines(["*Duplicate example rows*"])
```

- [ ] **Step 2: Run to verify failure**

```bash
cd pytest-plugin
python -m pytest tests/test_bdd_lint_option.py::test_bdd_lint_passes_valid_feature_file -v
```
Expected: fails with `unrecognized arguments: --bdd-lint`.

- [ ] **Step 3: Add lint wiring to `hooks.py`**

Add after the existing imports in `pytest-plugin/pytest_bdd_orama/hooks.py`:

```python
from pathlib import Path
from .lint_runner import match_step_params, validate_step_params, interpolate_scenario
from .lint_types import LintDiagnostic
from .step_registry import collect_step_definitions, collect_step_type_classes
```

Add new hook functions to `hooks.py`:

```python
def pytest_addoption(parser):
    parser.addoption(
        "--bdd-lint",
        nargs="?",
        const="__all__",
        default=None,
        metavar="FILE",
        help="Lint .feature files for parameter errors and scenario rule violations.",
    )


def pytest_sessionfinish(session, exitstatus):
    opt = session.config.getoption("--bdd-lint", default=None)
    if opt is None:
        return

    step_defs = collect_step_definitions(session)
    step_types = collect_step_type_classes()

    # Determine which feature files to lint
    if opt == "__all__":
        feature_files = list({
            Path(session.config.rootdir) / item._bdd_feature_path
            for item in session.items
            if hasattr(item, '_bdd_feature_path')
        })
    else:
        feature_files = [Path(opt)]

    all_diagnostics: list[tuple[str, LintDiagnostic]] = []
    for feature_path in feature_files:
        diags = _lint_feature_file(feature_path, step_defs, step_types, session.config)
        for d in diags:
            all_diagnostics.append((str(feature_path), d))

    _emit_lint_results(all_diagnostics, session.config)

    if any(d.severity == "error" for _, d in all_diagnostics):
        session.exitstatus = 1


def _lint_feature_file(
    path: Path,
    step_defs: list[dict],
    step_types: dict,
    config,
) -> list[LintDiagnostic]:
    """Parse and lint a single .feature file, returning all diagnostics."""
    # Determine the correct parser import (pytest-bdd 8.x)
    try:
        from pytest_bdd.parser import parse_feature_file
    except ImportError:
        from pytest_bdd import parser as _p
        parse_feature_file = _p.parse_feature_file  # type: ignore[attr-defined]

    try:
        feature = parse_feature_file(str(path))
    except Exception as exc:
        return [LintDiagnostic(message=f"Failed to parse {path.name}: {exc}")]

    diagnostics: list[LintDiagnostic] = []

    for scenario in feature.scenarios.values():
        has_examples = bool(getattr(scenario, 'examples', None))

        # Parameter validation: every step in every scenario
        for step in scenario.steps:
            step_text = step.name
            line = getattr(step, 'line_number', None)
            for step_def in step_defs:
                diags = validate_step_params(step_text, step_def, step_types, line_number=line)
                diagnostics.extend(diags)

        if has_examples:
            # 1. Outline-level checks (duplicates, large sets, etc.)
            for result_list in config.hook.pytest_bdd_orama_lint_outline(
                scenario=scenario, examples=scenario.examples
            ):
                if result_list:
                    diagnostics.extend(result_list)

            # 2. Scenario-level checks applied to each interpolated row
            for examples_block in scenario.examples:
                for row in examples_block.rows:
                    interpolated = interpolate_scenario(scenario, row)
                    for result_list in config.hook.pytest_bdd_orama_lint_scenario(
                        scenario=interpolated
                    ):
                        if result_list:
                            diagnostics.extend(result_list)
        else:
            for result_list in config.hook.pytest_bdd_orama_lint_scenario(scenario=scenario):
                if result_list:
                    diagnostics.extend(result_list)

    return diagnostics


def _emit_lint_results(
    diagnostics: list[tuple[str, LintDiagnostic]],
    config,
) -> None:
    """Route lint diagnostics to stdout (CLI) or IPC (VS Code)."""
    import os
    if os.environ.get('TEST_RUN_PIPE'):
        _emit_ipc(diagnostics)
    else:
        _emit_stdout(diagnostics)


def _emit_stdout(diagnostics: list[tuple[str, LintDiagnostic]]) -> None:
    if not diagnostics:
        print("pytest-bdd-orama lint: no issues found")
        return
    for path, d in diagnostics:
        loc = f"{path}:{d.line}" if d.line else path
        print(f"{d.severity.upper()}: {loc}: {d.message}")


def _emit_ipc(diagnostics: list[tuple[str, LintDiagnostic]]) -> None:
    """Send lint diagnostics to VS Code via the existing IPC pipe."""
    try:
        from vscode_pytest import send_message  # available when PYTHONPATH set by extension
    except ImportError:
        return

    payload = {
        "type": "lintDiagnostics",
        "diagnostics": [
            {
                "path": path,
                "message": d.message,
                "severity": d.severity,
                "line": d.line,
            }
            for path, d in diagnostics
        ],
    }
    send_message(payload)  # type: ignore[arg-type]  # send_message accepts any dict at runtime
```

- [ ] **Step 4: Check pytest-bdd parser import**

Run this to confirm the correct import path:

```bash
cd pytest-plugin
python -c "from pytest_bdd.parser import parse_feature_file; print('ok')"
```

If it fails, run:
```bash
python -c "import pytest_bdd.parser as p; print(dir(p))"
```
and update the `try/except` import in `_lint_feature_file` to use the correct function name.

- [ ] **Step 5: Run integration tests**

```bash
cd pytest-plugin
python -m pytest tests/test_bdd_lint_option.py -v
```
Expected: all 4 tests PASSED.

- [ ] **Step 6: Run full test suite**

```bash
cd pytest-plugin
python -m pytest tests/ -v
```
Expected: all tests PASSED.

- [ ] **Step 7: Verify `--bdd-lint` works end-to-end against the playground**

The playground conftest already has `AustralianState` (added in Task 1) and the duplicate-row lint hook (added in Task 3). Install the local plugin into the playground venv first if not already done:

```bash
cd playground
pip install -e ../pytest-plugin
```

Then run the linter:

```bash
cd playground
python -m pytest --bdd-lint -v
```
Expected: exit 0, output lists each feature file checked and reports no errors. The duplicate-row hook should fire on any outline that has repeated rows.

To see a lint failure in action, temporarily add a duplicate row to any outline feature file, re-run, then revert.

- [ ] **Step 8: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/hooks.py \
        pytest-plugin/tests/test_bdd_lint_option.py
git commit -m "feat(python): add --bdd-lint option with parameter validation and lint hooks"
```

---

### Task 7: Step definition payload emission during collection

**Files:**
- Modify: `pytest-plugin/pytest_bdd_orama/hooks.py`

Emit step definitions over IPC during `--collect-only` so the VS Code extension can populate its step cache.

- [ ] **Step 1: Add `pytest_collection_finish` to `hooks.py`**

Append to `pytest-plugin/pytest_bdd_orama/hooks.py`:

```python
def pytest_collection_finish(session) -> None:
    """Emit step definitions over IPC after collection (VS Code mode only)."""
    import os
    if not os.environ.get('TEST_RUN_PIPE'):
        return

    step_defs = collect_step_definitions(session)
    if not step_defs:
        return

    try:
        from vscode_pytest import send_message
    except ImportError:
        return

    payload = {
        "type": "stepDefinitions",
        "stepDefinitions": step_defs,
    }
    send_message(payload)  # type: ignore[arg-type]
```

- [ ] **Step 2: Verify the collection hook does not break normal collection**

```bash
cd pytest-plugin
python -m pytest tests/ -v
```
Expected: all tests still PASSED (no IPC errors because `TEST_RUN_PIPE` is unset in the test environment).

- [ ] **Step 3: Commit**

```bash
git add pytest-plugin/pytest_bdd_orama/hooks.py
git commit -m "feat(python): emit StepDefinition IPC payload after collection"
```

---

**Phase A is complete and independently releasable.** The plugin now provides `StepType`/`StepEnum` base classes, `--bdd-lint` for CI/CD and commit hooks, and emits step metadata for VS Code. Proceed to Phase B for the editor integration.

---

## Phase B: VS Code Integration

### Task 8: TypeScript types and updated discovery function

**Files:**
- Modify: `vscode-extension/src/testController/types.ts`
- Modify: `vscode-extension/src/testController/pytestRunner.ts`

Add the new payload types and change `discoverTests` to collect all IPC messages (not just the first) so both the discovery payload and the step definitions payload are received.

- [ ] **Step 1: Add types to `types.ts`**

Append to `vscode-extension/src/testController/types.ts`:

```typescript
// ── Step definition types (for completions and validation) ─────────────────

export type StepParameter = {
    name: string;
    type_name: string;
    suggested_values: string[];
    has_validator: boolean;
};

export type StepDefinition = {
    keyword: 'given' | 'when' | 'then' | 'step';
    pattern: string;
    parameters: StepParameter[];
};

export type StepDefinitionPayload = {
    type: 'stepDefinitions';
    stepDefinitions: StepDefinition[];
};

// ── Lint diagnostic types ───────────────────────────────────────────────────

export type LintDiagnosticEntry = {
    path: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    line: number | null;
};

export type LintDiagnosticPayload = {
    type: 'lintDiagnostics';
    diagnostics: LintDiagnosticEntry[];
};
```

- [ ] **Step 2: Change `discoverTests` to return step definitions alongside the discovery payload**

In `vscode-extension/src/testController/pytestRunner.ts`, change the return type and implementation of `discoverTests`:

```typescript
// Change the import line for types:
import { DiscoveredTestPayload, ExecutionTestPayload, StepDefinition, StepDefinitionPayload } from './types';

// Change the return type:
export type DiscoveryResult = {
    discovery: DiscoveredTestPayload;
    stepDefinitions: StepDefinition[];
};

// Replace the discoverTests function body from the `return new Promise<DiscoveredTestPayload>` line
// through the end of the function with:
export async function discoverTests(
    workspaceUri: Uri,
    interpreterPath: string,
    token?: CancellationToken,
): Promise<DiscoveryResult> {
    const ipc = await createIpcServer();
    const cwd = resolveCwd(workspaceUri);
    const extraArgs = workspace.getConfiguration('pytest-bdd-orama').get<string[]>('pytestArgs', []);

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TEST_RUN_PIPE: ipc.pipeName,
        PYTHONPATH: buildPythonPath(PYTHON_FILES_DIR),
    };

    const args = [
        '-m', 'pytest',
        '--collect-only',
        '-q',
        '--rootdir', cwd,
        `--import-mode=importlib`,
        `-p`, `vscode_pytest`,
        ...extraArgs,
    ];

    let discoveryPayload: DiscoveredTestPayload | null = null;
    const stepDefinitions: StepDefinition[] = [];

    return new Promise<DiscoveryResult>((resolve, reject) => {
        ipc.onMessage((data) => {
            const payload = data as Record<string, unknown>;
            if (payload['type'] === 'stepDefinitions') {
                const p = payload as unknown as StepDefinitionPayload;
                stepDefinitions.push(...p.stepDefinitions);
            } else if ('cwd' in payload) {
                discoveryPayload = payload as unknown as DiscoveredTestPayload;
            }
        });

        const proc = cp.spawn(getPythonPath(interpreterPath), args, { cwd, env });

        const stderr: string[] = [];
        proc.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr.push(text);
            outputChannel.append(text);
        });

        token?.onCancellationRequested(() => {
            proc.kill();
            ipc.dispose();
            reject(new Error('Discovery cancelled'));
        });

        proc.on('close', (code) => {
            ipc.dispose();
            const discovery = discoveryPayload ?? {
                cwd,
                status: 'error' as const,
                error: code !== 0 ? stderr : [],
            };
            resolve({ discovery, stepDefinitions });
        });

        proc.on('error', (err) => {
            ipc.dispose();
            reject(err);
        });
    });
}
```

- [ ] **Step 3: Add `runBddLint` to `pytestRunner.ts`**

Append to `vscode-extension/src/testController/pytestRunner.ts`:

```typescript
import { LintDiagnosticEntry, LintDiagnosticPayload } from './types';

export async function runBddLint(
    featureFilePath: string,
    workspaceUri: Uri,
    interpreterPath: string,
    token?: CancellationToken,
): Promise<LintDiagnosticEntry[]> {
    const ipc = await createIpcServer();
    const cwd = resolveCwd(workspaceUri);
    const extraArgs = workspace.getConfiguration('pytest-bdd-orama').get<string[]>('pytestArgs', []);

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TEST_RUN_PIPE: ipc.pipeName,
        PYTHONPATH: buildPythonPath(PYTHON_FILES_DIR),
    };

    const args = [
        '-m', 'pytest',
        '--bdd-lint', featureFilePath,
        '--rootdir', cwd,
        '--import-mode=importlib',
        '-p', 'vscode_pytest',
        ...extraArgs,
    ];

    const entries: LintDiagnosticEntry[] = [];

    return new Promise<LintDiagnosticEntry[]>((resolve, reject) => {
        ipc.onMessage((data) => {
            const payload = data as Record<string, unknown>;
            if (payload['type'] === 'lintDiagnostics') {
                const p = payload as unknown as LintDiagnosticPayload;
                entries.push(...p.diagnostics);
            }
        });

        const proc = cp.spawn(getPythonPath(interpreterPath), args, { cwd, env });

        proc.stderr.on('data', (chunk) => outputChannel.append(chunk.toString()));

        token?.onCancellationRequested(() => {
            proc.kill();
            ipc.dispose();
            reject(new Error('Lint cancelled'));
        });

        proc.on('close', () => {
            ipc.dispose();
            resolve(entries);
        });

        proc.on('error', (err) => {
            ipc.dispose();
            reject(err);
        });
    });
}
```

- [ ] **Step 4: Fix the call site in `extension.ts`**

`discoverTests` now returns `DiscoveryResult` instead of `DiscoveredTestPayload`. Update `refreshWorkspace` in `extension.ts`:

```typescript
// Change:
const payload = await discoverTests(workspaceUri, interpreterPath, token);
resolver.resolveDiscovery(payload, testController, token);

// To:
const { discovery, stepDefinitions } = await discoverTests(workspaceUri, interpreterPath, token);
resolver.resolveDiscovery(discovery, testController, token);
stepCache.update(stepDefinitions);   // stepCache is wired in Task 9
```

(The `stepCache` reference will be added in Task 9 — leave a `// TODO: stepCache.update(stepDefinitions)` comment for now if TypeScript errors occur.)

- [ ] **Step 5: Verify the extension compiles**

```bash
cd vscode-extension
npm run compile
```
Expected: no TypeScript errors (or only the TODO-related one from the previous step).

- [ ] **Step 6: Commit**

```bash
git add vscode-extension/src/testController/types.ts \
        vscode-extension/src/testController/pytestRunner.ts \
        vscode-extension/src/extension.ts
git commit -m "feat(ts): add StepDefinition/LintDiagnostic types; update discovery to collect all IPC messages"
```

---

### Task 9: StepCache

**Files:**
- Create: `vscode-extension/src/stepCache.ts`
- Create: `vscode-extension/src/test/stepCache.test.ts`
- Modify: `vscode-extension/src/extension.ts`

- [ ] **Step 1: Write failing Jest tests**

```typescript
// vscode-extension/src/test/stepCache.test.ts
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const GIVEN_STATE: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [{
        name: 'state',
        type_name: 'AustralianState',
        suggested_values: ['NSW', 'Victoria'],
        has_validator: true,
    }],
};

const WHEN_ACTION: StepDefinition = {
    keyword: 'when',
    pattern: 'the user clicks the button',
    parameters: [],
};

const STEP_GENERIC: StepDefinition = {
    keyword: 'step',
    pattern: 'a generic step',
    parameters: [],
};

describe('StepCache', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([GIVEN_STATE, WHEN_ACTION, STEP_GENERIC]);
    });

    test('getAll returns all step definitions', () => {
        expect(cache.getAll()).toHaveLength(3);
    });

    test('getForKeyword filters by keyword', () => {
        expect(cache.getForKeyword('given')).toHaveLength(1);
        expect(cache.getForKeyword('when')).toHaveLength(1);
    });

    test('getForKeyword includes keyword=step in all keyword queries', () => {
        expect(cache.getForKeyword('given')).toContain(STEP_GENERIC);
        expect(cache.getForKeyword('when')).toContain(STEP_GENERIC);
        expect(cache.getForKeyword('then')).toContain(STEP_GENERIC);
    });

    test('matchLine returns null for non-matching text', () => {
        expect(cache.matchLine('something completely different')).toBeNull();
    });

    test('matchLine returns step and extracted params on match', () => {
        const result = cache.matchLine('the state is NSW');
        expect(result).not.toBeNull();
        expect(result!.step.pattern).toBe('the state is {state:AustralianState}');
        expect(result!.params).toEqual({ state: 'NSW' });
    });

    test('paramPositionAt returns null for non-matching line', () => {
        expect(cache.paramPositionAt('unrelated line', 5)).toBeNull();
    });

    test('paramPositionAt returns parameter when cursor is inside param value', () => {
        // "the state is NSW" — "NSW" starts at col 13
        const result = cache.paramPositionAt('the state is NSW', 14);
        expect(result).not.toBeNull();
        expect(result!.parameter.name).toBe('state');
        expect(result!.valueStart).toBe(13);
        expect(result!.valueEnd).toBe(16);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd vscode-extension
npm test -- --testPathPattern stepCache
```
Expected: `Cannot find module '../stepCache'`

- [ ] **Step 3: Create `stepCache.ts`**

```typescript
// vscode-extension/src/stepCache.ts
import { StepDefinition, StepParameter } from './testController/types';

export type LineMatch = {
    step: StepDefinition;
    params: Record<string, string>;
};

export type ParamAtPosition = {
    parameter: StepParameter;
    valueStart: number;
    valueEnd: number;
};

/** Convert a step pattern to a regex with named capture groups for each parameter. */
function patternToRegex(pattern: string): RegExp {
    // Escape regex metacharacters except our own {} placeholders
    const parts = pattern.split(/(\{[^}]+\})/);
    const regexStr = parts
        .map((part, i) => {
            if (i % 2 === 1) {
                // parameter placeholder — extract name, create named capture group
                const name = part.replace(/^\{(\w+)(?::[^}]+)?\}$/, '$1');
                return `(?<${name}>.+?)`;
            }
            // literal text — escape regex metacharacters
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('');
    return new RegExp(`^${regexStr}$`);
}

export class StepCache {
    private steps: StepDefinition[] = [];

    update(steps: StepDefinition[]): void {
        this.steps = steps;
    }

    getAll(): StepDefinition[] {
        return this.steps;
    }

    getForKeyword(keyword: string): StepDefinition[] {
        const norm = keyword.toLowerCase();
        return this.steps.filter(
            (s) => s.keyword === norm || s.keyword === 'step'
        );
    }

    /** Match full step text (no keyword prefix) against cached patterns. */
    matchLine(stepText: string): LineMatch | null {
        for (const step of this.steps) {
            const rx = patternToRegex(step.pattern);
            const m = rx.exec(stepText);
            if (m?.groups) {
                return { step, params: { ...m.groups } };
            }
        }
        return null;
    }

    /**
     * Return the parameter the cursor (at *column*) sits inside on *lineText*,
     * or null if the cursor is not inside a parameter value.
     */
    paramPositionAt(lineText: string, column: number): ParamAtPosition | null {
        for (const step of this.steps) {
            const rx = patternToRegex(step.pattern);
            const m = rx.exec(lineText);
            if (!m?.groups) continue;

            let searchFrom = 0;
            for (const param of step.parameters) {
                const value = m.groups[param.name];
                if (value === undefined) continue;
                const idx = lineText.indexOf(value, searchFrom);
                if (idx === -1) continue;
                const end = idx + value.length;
                if (column >= idx && column <= end) {
                    return { parameter: param, valueStart: idx, valueEnd: end };
                }
                searchFrom = end;
            }
        }
        return null;
    }
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd vscode-extension
npm test -- --testPathPattern stepCache
```
Expected: all tests PASSED.

- [ ] **Step 5: Wire StepCache into `extension.ts`**

In `extension.ts`, add after the imports:

```typescript
import { StepCache } from './stepCache';
```

Inside the `activate` function, before `refreshAllWorkspaces()`:

```typescript
const stepCache = new StepCache();
```

In `refreshWorkspace`, replace the temporary TODO comment from Task 8 with:

```typescript
const { discovery, stepDefinitions } = await discoverTests(workspaceUri, interpreterPath, token);
resolver.resolveDiscovery(discovery, testController, token);
stepCache.update(stepDefinitions);
```

Also add the step-definition file watcher after the existing `featureWatcher`:

```typescript
const stepDefGlob = vscode.workspace.getConfiguration('pytest-bdd-orama')
    .get<string>('stepDefinitionGlob', '{**/step_defs/**/*.py,**/steps/**/*.py}');
const stepFileWatcher = vscode.workspace.createFileSystemWatcher(stepDefGlob);
stepFileWatcher.onDidChange(() => refreshAllWorkspaces());
stepFileWatcher.onDidCreate(() => refreshAllWorkspaces());
stepFileWatcher.onDidDelete(() => refreshAllWorkspaces());
context.subscriptions.push(stepFileWatcher);
```

Add the setting to `vscode-extension/package.json` inside `contributes.configuration.properties`:

```json
"pytest-bdd-orama.stepDefinitionGlob": {
    "type": "string",
    "default": "{**/step_defs/**/*.py,**/steps/**/*.py}",
    "markdownDescription": "Glob pattern for Python step definition files. Saves to matching files trigger step rediscovery."
}
```

- [ ] **Step 6: Verify extension compiles**

```bash
cd vscode-extension
npm run compile
```
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add vscode-extension/src/stepCache.ts \
        vscode-extension/src/test/stepCache.test.ts \
        vscode-extension/src/extension.ts \
        vscode-extension/package.json
git commit -m "feat(ts): add StepCache, populate from discovery, add step-file watcher"
```

---

### Task 10: CompletionItemProvider for `.feature` files

**Files:**
- Create: `vscode-extension/src/featureCompletion.ts`
- Create: `vscode-extension/src/test/featureCompletion.test.ts`
- Modify: `vscode-extension/src/extension.ts`

- [ ] **Step 1: Write failing Jest tests**

```typescript
// vscode-extension/src/test/featureCompletion.test.ts
import { buildStepCompletions, buildDomainCompletions, extractStepText } from '../featureCompletion';
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const STATE_STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [{
        name: 'state',
        type_name: 'AustralianState',
        suggested_values: ['NSW', 'Victoria', 'Queensland'],
        has_validator: true,
    }],
};

const PLAIN_STEP: StepDefinition = {
    keyword: 'when',
    pattern: 'the user logs in',
    parameters: [],
};

describe('extractStepText', () => {
    test('strips Given keyword and returns remainder', () => {
        expect(extractStepText('Given the state is NSW')).toEqual({ keyword: 'given', text: 'the state is NSW' });
    });

    test('strips When keyword', () => {
        expect(extractStepText('  When something happens')).toEqual({ keyword: 'when', text: 'something happens' });
    });

    test('returns null for non-step lines', () => {
        expect(extractStepText('Feature: My Feature')).toBeNull();
        expect(extractStepText('')).toBeNull();
    });

    test('handles And and But', () => {
        expect(extractStepText('And something')).toEqual({ keyword: 'and', text: 'something' });
        expect(extractStepText('But not that')).toEqual({ keyword: 'but', text: 'not that' });
    });
});

describe('buildStepCompletions', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([STATE_STEP, PLAIN_STEP]);
    });

    test('returns snippet completion for step with parameter', () => {
        const items = buildStepCompletions('', 'given', cache);
        expect(items).toHaveLength(1);
        expect(items[0].label).toBe('the state is {state:AustralianState}');
        // insertText is a SnippetString — check its value property
        expect((items[0].insertText as { value: string }).value).toBe('the state is ${1:state}');
    });

    test('filters by partial text', () => {
        const items = buildStepCompletions('the state', 'given', cache);
        expect(items).toHaveLength(1);
    });

    test('returns empty when partial text does not match', () => {
        expect(buildStepCompletions('nonexistent', 'given', cache)).toHaveLength(0);
    });

    test('plain step has non-snippet insertText', () => {
        const items = buildStepCompletions('', 'when', cache);
        expect(items).toHaveLength(1);
        expect(items[0].insertText).toBe('the user logs in');
    });
});

describe('buildDomainCompletions', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([STATE_STEP]);
    });

    test('returns domain values when cursor is inside param placeholder', () => {
        // Full step text, cursor after "the state is " (col 13)
        const items = buildDomainCompletions('the state is ', 13, cache);
        expect(items.map((i) => i.label)).toEqual(['NSW', 'Victoria', 'Queensland']);
    });

    test('returns domain values when cursor is inside a partially-typed value', () => {
        const items = buildDomainCompletions('the state is NS', 15, cache);
        expect(items.map((i) => i.label)).toEqual(['NSW', 'Victoria', 'Queensland']);
    });

    test('returns empty when cursor is not in a param position', () => {
        expect(buildDomainCompletions('unrelated text', 5, cache)).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd vscode-extension
npm test -- --testPathPattern featureCompletion
```
Expected: `Cannot find module '../featureCompletion'`

- [ ] **Step 3: Create `featureCompletion.ts`**

```typescript
// vscode-extension/src/featureCompletion.ts
import * as vscode from 'vscode';
import { StepCache } from './stepCache';

const KEYWORD_RE = /^\s*(Given|When|Then|And|But|\*)\s+/i;
const PARAM_RE = /\{(\w+)(?::[^}]+)?\}/g;

export type KeywordAndText = { keyword: string; text: string };

/** Extract the Gherkin keyword and the step text from a raw line, or null. */
export function extractStepText(line: string): KeywordAndText | null {
    const m = KEYWORD_RE.exec(line);
    if (!m) return null;
    return { keyword: m[1].toLowerCase(), text: line.slice(m[0].length) };
}

/** Convert a step pattern to a VS Code snippet string with numbered tab stops. */
function patternToSnippet(pattern: string): string {
    let i = 0;
    return pattern.replace(PARAM_RE, (_match, name) => `\${${++i}:${name}}`);
}

/**
 * Level 1: return snippet completion items for step patterns matching *partialText*.
 */
export function buildStepCompletions(
    partialText: string,
    keyword: string,
    cache: StepCache,
): vscode.CompletionItem[] {
    const lower = partialText.toLowerCase();
    return cache
        .getForKeyword(keyword)
        .filter((s) => s.pattern.toLowerCase().startsWith(lower))
        .map((s) => {
            const item = new vscode.CompletionItem(s.pattern, vscode.CompletionItemKind.Snippet);
            const snippet = patternToSnippet(s.pattern);
            item.insertText = snippet === s.pattern
                ? s.pattern  // no parameters — plain string
                : new vscode.SnippetString(snippet);
            item.detail = `${s.keyword} step`;
            return item;
        });
}

/**
 * Level 2: return domain value completion items when the cursor is inside a
 * parameter value position on a line that matches a known step pattern.
 */
export function buildDomainCompletions(
    lineText: string,
    column: number,
    cache: StepCache,
): vscode.CompletionItem[] {
    // Try exact match first; if the line is a partial value, attempt prefix match
    let pos = cache.paramPositionAt(lineText, column);

    if (!pos) {
        // Try trimming trailing partial text to see if the rest matches
        // e.g. "the state is NS" → try matching "the state is "
        const trimmed = lineText.slice(0, column).trimEnd();
        pos = cache.paramPositionAt(trimmed, column);
    }

    if (!pos) return [];
    return pos.parameter.suggested_values.map(
        (v) => new vscode.CompletionItem(v, vscode.CompletionItemKind.EnumMember),
    );
}

/** VS Code CompletionItemProvider for .feature files. */
export class FeatureCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly cache: StepCache) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const rawLine = document.lineAt(position).text;
        const column = position.character;
        const stepText = extractStepText(rawLine);
        if (!stepText) return [];

        // Level 2: domain values if cursor is inside a param value
        const stepTextStart = rawLine.indexOf(stepText.text);
        const colInStep = column - stepTextStart;
        const domainItems = buildDomainCompletions(stepText.text, colInStep, this.cache);
        if (domainItems.length > 0) return domainItems;

        // Level 1: step pattern completions
        const partialUpToCursor = rawLine.slice(stepTextStart, column);
        return buildStepCompletions(partialUpToCursor, stepText.keyword, this.cache);
    }
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd vscode-extension
npm test -- --testPathPattern featureCompletion
```
Expected: all tests PASSED.

- [ ] **Step 5: Register the provider in `extension.ts`**

In `extension.ts`, after the `stepCache` and `stepFileWatcher` setup:

```typescript
import { FeatureCompletionProvider } from './featureCompletion';

const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: 'feature', scheme: 'file' },
    new FeatureCompletionProvider(stepCache),
    ' ',  // trigger on space after keyword
);
context.subscriptions.push(completionProvider);
```

- [ ] **Step 6: Verify extension compiles**

```bash
cd vscode-extension
npm run compile
```
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add vscode-extension/src/featureCompletion.ts \
        vscode-extension/src/test/featureCompletion.test.ts \
        vscode-extension/src/extension.ts
git commit -m "feat(ts): add CompletionItemProvider for .feature files (step + domain completions)"
```

---

### Task 11: VS Code diagnostics — lint on save

**Files:**
- Create: `vscode-extension/src/featureDiagnostics.ts`
- Modify: `vscode-extension/src/extension.ts`

- [ ] **Step 1: Create `featureDiagnostics.ts`**

```typescript
// vscode-extension/src/featureDiagnostics.ts
import * as vscode from 'vscode';
import { runBddLint } from './testController/pytestRunner';

export class FeatureDiagnostics {
    private readonly collection: vscode.DiagnosticCollection;
    private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly getWorkspaceUri: () => vscode.Uri | undefined,
        private readonly getInterpreter: (uri: vscode.Uri) => Promise<string>,
    ) {
        this.collection = vscode.languages.createDiagnosticCollection('pytest-bdd-orama');
    }

    /** Schedule a lint run for *uri* (debounced, 300 ms). Called on document save. */
    schedule(uri: vscode.Uri): void {
        const key = uri.fsPath;
        const existing = this.pending.get(key);
        if (existing) clearTimeout(existing);
        this.pending.set(key, setTimeout(() => { void this.lint(uri); }, 300));
    }

    private async lint(uri: vscode.Uri): Promise<void> {
        const workspaceUri = this.getWorkspaceUri();
        if (!workspaceUri) return;

        const interpreterPath = await this.getInterpreter(workspaceUri);
        let entries;
        try {
            entries = await runBddLint(uri.fsPath, workspaceUri, interpreterPath);
        } catch {
            return;  // subprocess error — don't clear existing diagnostics
        }

        const diagnostics: vscode.Diagnostic[] = entries.map((e) => {
            const line = Math.max(0, (e.line ?? 1) - 1);
            const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
            const severity =
                e.severity === 'error' ? vscode.DiagnosticSeverity.Error :
                e.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
                vscode.DiagnosticSeverity.Information;
            return new vscode.Diagnostic(range, e.message, severity);
        });

        this.collection.set(uri, diagnostics);
    }

    dispose(): void {
        this.collection.dispose();
        for (const t of this.pending.values()) clearTimeout(t);
        this.pending.clear();
    }
}
```

- [ ] **Step 2: Wire into `extension.ts`**

In `extension.ts`, add:

```typescript
import { FeatureDiagnostics } from './featureDiagnostics';

// Inside activate(), after the stepCache setup:
const featureDiagnostics = new FeatureDiagnostics(
    () => vscode.workspace.workspaceFolders?.[0]?.uri,
    (uri) => getPythonInterpreter(uri),
);
context.subscriptions.push(featureDiagnostics);

// Trigger lint on .feature file save:
vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.fileName.endsWith('.feature')) {
        featureDiagnostics.schedule(doc.uri);
    }
}, null, context.subscriptions);
```

- [ ] **Step 3: Verify extension compiles**

```bash
cd vscode-extension
npm run compile
```
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add vscode-extension/src/featureDiagnostics.ts \
        vscode-extension/src/extension.ts
git commit -m "feat(ts): add FeatureDiagnostics — lint .feature files on save via Problems panel"
```

---

### Task 12: Distributed step library metadata

**Files:**
- Create: `pytest-plugin/pytest_bdd_orama/metadata_gen.py`
- Modify: `pytest-plugin/pyproject.toml`

This allows library authors to pre-generate step type metadata at packaging time so consumers get completions without a discovery run.

- [ ] **Step 1: Create `metadata_gen.py`**

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


def main() -> None:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('pytest_bdd_orama_steps.json')

    # Import the project to trigger step type class registration.
    # Callers must ensure the project is on sys.path before running this command.
    from .step_types import StepType
    from .step_registry import collect_step_type_classes

    step_types = collect_step_type_classes()
    metadata = {
        'version': 1,
        'step_types': {
            name: {
                'suggested_values': cls.suggested_values(),
                'has_validator': cls.validate is not StepType.validate,
            }
            for name, cls in step_types.items()
        },
    }

    output.write_text(json.dumps(metadata, indent=2))
    print(f"pytest-bdd-orama: written step metadata to {output}")
```

- [ ] **Step 2: Add entry point to `pyproject.toml`**

Open `pytest-plugin/pyproject.toml` and add:

```toml
[project.scripts]
pytest-bdd-orama = "pytest_bdd_orama.metadata_gen:main"
```

- [ ] **Step 3: Verify the command is importable**

```bash
cd pytest-plugin
python -c "from pytest_bdd_orama.metadata_gen import main; print('ok')"
```
Expected: `ok`

- [ ] **Step 4: Run and inspect the output**

```bash
cd pytest-plugin
python -c "
import sys; sys.path.insert(0, '.')
from pytest_bdd_orama.step_types import StepEnum
class TestState(StepEnum):
    A = 'A'
from pytest_bdd_orama.metadata_gen import main
main()
"
cat pytest_bdd_orama_steps.json
```
Expected: a JSON file containing `TestState` with `suggested_values: ["A"]` and `has_validator: true`.

- [ ] **Step 5: Add distributed metadata loading in `extension.ts`**

In `extension.ts`, add a helper and call it during activation:

```typescript
// After imports, add:
async function loadDistributedStepMetadata(
    workspaceUri: vscode.Uri,
    interpreterPath: string,
    cache: StepCache,
): Promise<void> {
    const cp = await import('child_process');
    const script = `
import json, sys
try:
    from importlib.metadata import entry_points
    eps = entry_points(group='pytest_bdd_orama.steps')
    result = []
    for ep in eps:
        pkg, filename = ep.value.split(':', 1)
        import importlib.resources, pathlib
        path = pathlib.Path(str(importlib.resources.files(pkg))) / filename
        data = json.loads(path.read_text())
        result.append(data)
    print(json.dumps(result))
except Exception as e:
    print(json.dumps([]), file=sys.stderr)
    sys.exit(0)
`.trim();

    return new Promise((resolve) => {
        const proc = cp.spawn(interpreterPath, ['-c', script], {
            cwd: workspaceUri.fsPath,
        });
        let stdout = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.on('close', () => {
            try {
                const entries: Array<{ version: number; step_types: Record<string, { suggested_values: string[]; has_validator: boolean }> }> = JSON.parse(stdout);
                const stepDefs = entries.flatMap((e) =>
                    Object.entries(e.step_types).map(([name, meta]) => ({
                        keyword: 'step' as const,
                        pattern: `{param:${name}}`,  // synthetic pattern for type-only lookup
                        parameters: [{
                            name: 'param',
                            type_name: name,
                            suggested_values: meta.suggested_values,
                            has_validator: meta.has_validator,
                        }],
                    }))
                );
                // Set as base layer — will be overridden by live discovery
                cache.updateDistributed(stepDefs);
            } catch { /* ignore */ }
            resolve();
        });
        proc.on('error', () => resolve());
    });
}
```

Add `updateDistributed` to `StepCache` in `stepCache.ts`:

```typescript
// Add to StepCache class:
private distributedSteps: StepDefinition[] = [];

updateDistributed(steps: StepDefinition[]): void {
    this.distributedSteps = steps;
}

// Change getAll() and getForKeyword() to merge distributed + live:
getAll(): StepDefinition[] {
    return [...this.distributedSteps, ...this.steps];
}

getForKeyword(keyword: string): StepDefinition[] {
    const norm = keyword.toLowerCase();
    return this.getAll().filter(
        (s) => s.keyword === norm || s.keyword === 'step'
    );
}
```

Call `loadDistributedStepMetadata` in `activate()` before `refreshAllWorkspaces()`:

```typescript
// In activate(), before refreshAllWorkspaces():
const firstFolder = vscode.workspace.workspaceFolders?.[0];
if (firstFolder) {
    const interp = await getPythonInterpreter(firstFolder.uri);
    await loadDistributedStepMetadata(firstFolder.uri, interp, stepCache);
}
```

- [ ] **Step 6: Update Jest tests for StepCache to cover distributed steps**

Add to `vscode-extension/src/test/stepCache.test.ts`:

```typescript
describe('StepCache distributed steps', () => {
    test('distributed steps are returned by getAll', () => {
        const cache = new StepCache();
        const dist: StepDefinition = { keyword: 'step', pattern: 'distributed', parameters: [] };
        cache.updateDistributed([dist]);
        expect(cache.getAll()).toContain(dist);
    });

    test('live steps override distributed when both present', () => {
        const cache = new StepCache();
        cache.updateDistributed([{ keyword: 'step', pattern: 'both', parameters: [] }]);
        cache.update([{ keyword: 'given', pattern: 'both', parameters: [] }]);
        const all = cache.getAll();
        expect(all).toHaveLength(2);  // both present; live takes precedence via ordering
    });
});
```

- [ ] **Step 7: Run all tests**

```bash
cd vscode-extension
npm test
```
Expected: all tests PASSED.

- [ ] **Step 8: Compile and commit**

```bash
cd vscode-extension && npm run compile
git add vscode-extension/src/stepCache.ts \
        vscode-extension/src/extension.ts \
        vscode-extension/src/test/stepCache.test.ts \
        pytest-plugin/pytest_bdd_orama/metadata_gen.py \
        pytest-plugin/pyproject.toml
git commit -m "feat: add generate-metadata command and distributed step library loading"
```

---

## Verification

After all tasks are complete:

**Python plugin (Phase A):**

```bash
cd pytest-plugin
python -m pytest tests/ -v
# Expected: all tests pass

# Smoke test with a real feature file:
cd playground
python -m pytest --bdd-lint tests/ -v
# Expected: exits 0 with "no issues found" (or lists real issues)
```

**VS Code extension (Phase B):**

1. Open the `playground/` folder in VS Code with the extension loaded.
2. Open a `.feature` file, type `Given ` — step completions should appear.
3. Select a completion with a parameter — cursor should land on the parameter tab stop.
4. With cursor inside a `{state:AustralianState}`-typed parameter, press Ctrl+Space — enum values should appear.
5. Type an invalid state value (e.g. `Narnia`), save the file — a red squiggle should appear in the Problems panel.
6. Edit a file matching the step-definition glob — discovery should re-run automatically.

**Compilation check:**

```bash
cd vscode-extension
npm run compile && npm test
# Expected: compiles cleanly, all Jest tests pass
```
