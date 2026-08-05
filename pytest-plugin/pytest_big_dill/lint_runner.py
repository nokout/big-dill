"""Lint runner: parameter validation, scenario interpolation, and lint orchestration."""
from __future__ import annotations

import re

import parse as parse_lib

from .lint_types import InterpolatedScenario, InterpolatedStep, LintDiagnostic

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
