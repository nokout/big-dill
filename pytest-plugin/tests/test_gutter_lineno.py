"""
Gutter-icon line numbers for BDD items.

A host displays a scenario against its .feature file, so the item's line must be
the Scenario keyword's line there. Using ``item.location[1]`` — the line of the
``scenarios()`` call in the Python test file — puts gutter icons on an unrelated
line, or past the end of the file.

This was fixed once in the vendored ms-python bridge and then reintroduced when
that bridge was replaced by ``pytest_big_dill.bridge``; these tests are what
should catch it a third time. They run real items captured through pytester
rather than mocks, because the bug lives in what pytest reports about an item.
"""

import pytest

from pytest_big_dill.bridge import discovery_item

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _ItemCapture:
    """Minimal plugin that stores collected items after collection finishes."""
    def __init__(self):
        self.items: list[pytest.Item] = []

    def pytest_collection_finish(self, session: pytest.Session) -> None:
        self.items.extend(session.items)


# Feature file designed so that scenario lines are far from the Python test
# file line numbers (scenarios() call is on line 2 of the generated Python
# file; scenario keywords are on lines 7 and 14 here).
GUTTER_FEATURE = """\
Feature: Gutter line test

  # Some padding so scenario lines are well clear of Python file lines.
  # Line 4 (this comment)
  # Line 5
  # Line 6
  Scenario: Plain scenario
    Given a gutter step

  # Line 10
  # Line 11
  # Line 12
  # Line 13
  Scenario Outline: Outline scenario
    Given a gutter step with <val>

    Examples:
      | val |
      | foo |
      | bar |
"""

GUTTER_CONFTEST = """\
from pytest_bdd import given, parsers

@given("a gutter step")
def gutter_step():
    pass

@given(parsers.parse("a gutter step with {val}"))
def gutter_step_param(val):
    pass
"""

GUTTER_TEST = """\
from pytest_bdd import scenarios
scenarios("gutter.feature")
"""

# Scenario keyword lines in GUTTER_FEATURE (1-indexed):
PLAIN_SCENARIO_LINE = 7
OUTLINE_SCENARIO_LINE = 14


def _collect(pytester: pytest.Pytester) -> list[pytest.Item]:
    pytester.makeconftest(GUTTER_CONFTEST)
    pytester.makefile(".feature", gutter=GUTTER_FEATURE)
    pytester.makepyfile(test_gutter=GUTTER_TEST)
    capture = _ItemCapture()
    pytester.inline_run("--collect-only", plugins=[capture])
    return capture.items


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_plain_scenario_lineno_uses_feature_file_line(pytester: pytest.Pytester):
    """The payload must report the Scenario keyword line, not the Python line."""
    items = _collect(pytester)
    plain = [i for i in items if hasattr(i, "_bdd_feature_path") and not hasattr(i, "callspec")]
    assert plain, "Expected at least one plain (non-outline) BDD item"

    for item in plain:
        node = discovery_item(item, str(item.config.rootdir))
        assert node["lineno"] == PLAIN_SCENARIO_LINE, (
            f"Plain scenario lineno should be the feature file line {PLAIN_SCENARIO_LINE}, "
            f"got {node['lineno']!r}. "
            f"(Python file location was line {item.location[1] + 1})"
        )


def test_plain_scenario_lineno_differs_from_python_location(pytester: pytest.Pytester):
    """Confirms the pre-fix lineno (Python file line) was wrong for BDD items."""
    items = _collect(pytester)
    plain = [i for i in items if hasattr(i, "_bdd_feature_path") and not hasattr(i, "callspec")]
    assert plain

    for item in plain:
        python_lineno = item.location[1] + 1 if item.location[1] is not None else 0
        node = discovery_item(item, str(item.config.rootdir))
        assert node["lineno"] != python_lineno, (
            f"lineno {node['lineno']!r} should differ from the Python file line "
            f"{python_lineno!r} — they happen to match, weakening the test. "
            "Adjust GUTTER_FEATURE so scenario lines are further from line 2."
        )


def test_outline_all_rows_use_scenario_outline_line(pytester: pytest.Pytester):
    """All example rows for an outline must report the Scenario Outline keyword line."""
    items = _collect(pytester)
    outline = [i for i in items if hasattr(i, "_bdd_feature_path") and hasattr(i, "callspec")]
    assert len(outline) == 2, f"Expected 2 outline rows, got {len(outline)}"

    for item in outline:
        node = discovery_item(item, str(item.config.rootdir))
        assert node["lineno"] == OUTLINE_SCENARIO_LINE, (
            f"Outline row lineno should be the Scenario Outline line {OUTLINE_SCENARIO_LINE}, "
            f"got {node['lineno']!r}"
        )


def test_non_bdd_item_lineno_unchanged(pytester: pytest.Pytester):
    """Non-BDD items must still use the Python file location (existing behaviour)."""
    pytester.makepyfile(test_plain="""\
def test_something():
    pass
""")
    capture = _ItemCapture()
    pytester.inline_run("--collect-only", plugins=[capture])
    plain = [i for i in capture.items if not hasattr(i, "_bdd_feature_path")]
    assert plain

    for item in plain:
        node = discovery_item(item, str(item.config.rootdir))
        expected = item.location[1] + 1 if item.location[1] is not None else 0
        assert node["lineno"] == expected, (
            f"Non-BDD item lineno should be the Python file line {expected!r}, "
            f"got {node['lineno']!r}"
        )
