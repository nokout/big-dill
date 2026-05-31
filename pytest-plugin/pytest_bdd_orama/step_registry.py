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
    """Return enrichment fields for step_func given its already-built parameters list."""
    code = step_func.__code__
    file = code.co_filename
    line = code.co_firstlineno

    # Use raw __doc__ to preserve leading blank lines (inspect.getdoc strips them,
    # which would cause a blank-first-line docstring to return a section header as summary).
    raw_doc = step_func.__doc__
    summary = get_summary(raw_doc)
    tags = parse_tags(raw_doc)

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

    # Pass 2: type names from parameters list (pattern-based)
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

            # Use the original step function (from context) for enrichment metadata
            step_func = getattr(ctx, 'step_func', fd.func)
            enrichment = _enrich_step_func(step_func, parameters)
            definitions.append({
                'keyword': keyword,
                'pattern': pattern,
                'parameters': parameters,
                **enrichment,
            })

    return definitions
