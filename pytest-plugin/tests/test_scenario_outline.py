"""
Integration tests for pytest_big_dill_test_name hook with Scenario Outlines.

Validates that:
  - Each example row produces a separate test item (not collapsed to one).
  - The hook is called with the correct example_params for each row.
  - Custom names returned by the hook are applied to items.
"""
import json

import pytest

# ---------------------------------------------------------------------------
# Shared conftest for all pytester projects in this module
# ---------------------------------------------------------------------------

OUTLINE_CONFTEST = """\
import json
from pytest_bdd import given, when, then, parsers

# ---------------------------------------------------------------------------
# Step definitions
# ---------------------------------------------------------------------------

@given(parsers.parse("a record with id {id}"))
def record_with_id(id):
    return {"id": id}

@when(parsers.parse("processed with {val}"))
def process_record(val):
    pass

@then("it completes")
def check_result():
    pass

# ---------------------------------------------------------------------------
# Big Dill hook — applies custom name using the id column
# ---------------------------------------------------------------------------

_hook_calls = []  # collects (scenario_name, example_params) per invocation

def pytest_big_dill_test_name(scenario_name, example_params, feature_name, feature_path):
    _hook_calls.append({
        "scenario_name": scenario_name,
        "example_params": dict(example_params),
        "feature_name": feature_name,
    })
    if "id" in example_params:
        return f"{scenario_name} [{example_params['id']}]"
    return None

def pytest_collection_finish(session):
    # Persist hook-call data so the outer test can assert on it without
    # coupling to pytester internals.
    import pathlib
    pathlib.Path("hook_calls.json").write_text(json.dumps(_hook_calls))

    # Persist item names (after custom naming) to validate hook was applied.
    names = []
    for item in session.items:
        bdd_name = getattr(item, "_bdd_scenario_name", None)
        if bdd_name is not None:
            names.append({"name": item.name, "bdd_scenario_name": bdd_name})
    pathlib.Path("item_names.json").write_text(json.dumps(names))
"""

OUTLINE_FEATURE = """\
Feature: Example outline

  Scenario Outline: Handle record
    Given a record with id <id>
    When processed with <val>
    Then it completes

    Examples:
      | id  | val   |
      | A01 | alpha |
      | A02 | beta  |
      | A03 | gamma |
"""

OUTLINE_TEST = """\
from pytest_bdd import scenarios
scenarios("outline.feature")
"""


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _setup_and_run(pytester: pytest.Pytester):
    """Create project files and run; return (hook_calls, item_names, reports)."""
    pytester.makeconftest(OUTLINE_CONFTEST)
    pytester.makefile(".feature", outline=OUTLINE_FEATURE)
    pytester.makepyfile(test_outline=OUTLINE_TEST)
    reprec = pytester.inline_run()

    hook_calls = json.loads((pytester.path / "hook_calls.json").read_text())
    item_names = json.loads((pytester.path / "item_names.json").read_text())
    call_reports = [
        r for r in reprec.getreports("pytest_runtest_logreport")
        if r.when == "call"
    ]
    return hook_calls, item_names, call_reports


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_outline_produces_one_item_per_example_row(pytester: pytest.Pytester):
    """Each example row must produce a separate test execution, not a single collapsed item."""
    _, _, call_reports = _setup_and_run(pytester)

    assert len(call_reports) == 3, (
        f"Expected 3 call-phase reports (one per example row), got {len(call_reports)}. "
        f"nodeids: {[r.nodeid for r in call_reports]}"
    )


def test_outline_hook_receives_example_params_for_each_row(pytester: pytest.Pytester):
    """pytest_big_dill_test_name must be called with example_params populated for each row."""
    hook_calls, _, _ = _setup_and_run(pytester)

    # Three rows → three hook invocations, each with a distinct 'id' value
    assert len(hook_calls) == 3, (
        f"Expected 3 hook calls (one per example row), got {len(hook_calls)}"
    )

    ids = [call["example_params"].get("id") for call in hook_calls]
    assert sorted(ids) == ["A01", "A02", "A03"], (
        f"Hook received unexpected id values: {ids}"
    )


def test_outline_hook_receives_all_example_columns(pytester: pytest.Pytester):
    """example_params must include every column from the Examples table, not just 'id'."""
    hook_calls, _, _ = _setup_and_run(pytester)

    for call in hook_calls:
        params = call["example_params"]
        assert "id" in params, f"'id' missing from example_params: {params}"
        assert "val" in params, f"'val' missing from example_params: {params}"


def test_outline_custom_names_applied_to_items(pytester: pytest.Pytester):
    """Items must carry the custom name returned by the hook (scenario + id column)."""
    _, item_names, _ = _setup_and_run(pytester)

    expected = {
        "Handle record [A01]",
        "Handle record [A02]",
        "Handle record [A03]",
    }
    actual = {entry["name"] for entry in item_names}
    assert actual == expected, (
        f"Item names after hook application do not match.\n"
        f"  expected: {sorted(expected)}\n"
        f"  actual:   {sorted(actual)}"
    )


def test_outline_bdd_scenario_name_matches_item_name(pytester: pytest.Pytester):
    """_bdd_scenario_name on each item must equal item.name after the hook runs."""
    _, item_names, _ = _setup_and_run(pytester)

    for entry in item_names:
        assert entry["name"] == entry["bdd_scenario_name"], (
            f"item.name ({entry['name']!r}) != item._bdd_scenario_name "
            f"({entry['bdd_scenario_name']!r})"
        )


def test_outline_non_outline_scenario_receives_empty_example_params(pytester: pytest.Pytester):
    """A plain (non-outline) scenario must arrive at the hook with example_params={}."""
    plain_conftest = OUTLINE_CONFTEST + """\

@given("a plain step")
def plain_step():
    pass
"""
    pytester.makeconftest(plain_conftest)
    pytester.makefile(".feature", mixed="""\
Feature: Mixed

  Scenario: Plain scenario
    Given a plain step

  Scenario Outline: Outline scenario
    Given a record with id <id>
    When processed with <val>
    Then it completes

    Examples:
      | id  | val |
      | X01 | foo |
""")
    pytester.makepyfile(test_mixed="""\
from pytest_bdd import scenarios
scenarios("mixed.feature")
""")
    pytester.inline_run()

    hook_calls = json.loads((pytester.path / "hook_calls.json").read_text())

    plain_calls = [c for c in hook_calls if c["scenario_name"] == "Plain scenario"]
    assert len(plain_calls) == 1
    assert plain_calls[0]["example_params"] == {}, (
        f"Plain scenario should have empty example_params, got: {plain_calls[0]['example_params']}"
    )

    outline_calls = [c for c in hook_calls if c["scenario_name"] == "Outline scenario"]
    assert len(outline_calls) == 1
    assert outline_calls[0]["example_params"].get("id") == "X01"
