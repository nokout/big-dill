# pytest-plugin/pytest_big_dill/lint_types.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass
class LintDiagnostic:
    """A diagnostic produced by a linting pass.

    Returned from ``pytest_big_dill_lint_scenario`` and
    ``pytest_big_dill_lint_outline`` hook implementations.
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

    Passed to ``pytest_big_dill_lint_scenario`` when linting each outline row.
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
