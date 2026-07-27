"""
Integration tests for the pytest-bdd-orama custom-status hook chain.

These tests validate the interface between the pytest plugin and the IPC payload:

  test raises exception
      → pytest_runtest_makereport (hooks.py hookwrapper)
          → calls pytest_bdd_orama_custom_status
              → returns status string (or None)
          → attaches status as report.vscode_custom_status

Each test uses pytester to run a real (in-process) pytest session and captures
the vscode_custom_status attribute on call-phase reports via a plugin injected
through pytester.plugins.

The captured values represent exactly what vscode_pytest/__init__.py will read
when building the execution payload sent to the extension.
"""
import pytest

# ---------------------------------------------------------------------------
# Shared conftest snippet embedded in every pytester project
# ---------------------------------------------------------------------------

CONFTEST = """\
# pytest_bdd_orama is auto-loaded via the pytest11 entry point when the package
# is installed in the active venv.  Do NOT add pytest_plugins here — doing so
# would double-register the plugin and trigger a pluggy hookspec conflict.

class WaitingSignal(Exception):
    pass

class OtherBadThingSignal(Exception):
    pass

class KnownError(Exception):
    pass

def pytest_bdd_orama_custom_status(report, config):
    if report.when != "call":
        return None
    longrepr = str(getattr(report, "longrepr", ""))
    if "KnownError" in longrepr:
        return "knownError"
    if "WaitingSignal" in longrepr:
        return "waiting"
    if "OtherBadThingSignal" in longrepr:
        return "otherbadthing"
    return None
"""

TEST_FILE = """\
def test_passing():
    pass

def test_failing():
    raise AssertionError("ordinary failure")

def test_waiting():
    from conftest import WaitingSignal
    raise WaitingSignal("waiting for something")

def test_otherbadthing():
    from conftest import OtherBadThingSignal
    raise OtherBadThingSignal("something bad")

def test_known_error():
    from conftest import KnownError
    raise KnownError("a known problem")
"""


# ---------------------------------------------------------------------------
# Helper: run pytester project and collect call-phase vscode_custom_status values
# ---------------------------------------------------------------------------

def _run_and_capture(pytester: pytest.Pytester) -> dict[str, object]:
    """Return {nodeid: vscode_custom_status} for all call-phase reports."""
    pytester.makeconftest(CONFTEST)
    pytester.makepyfile(test_states=TEST_FILE)
    reprec = pytester.inline_run()
    return {
        r.nodeid: getattr(r, "vscode_custom_status", None)
        for r in reprec.getreports("pytest_runtest_logreport")
        if r.when == "call"
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_passing_test_has_no_custom_status(pytester: pytest.Pytester):
    """A test that passes must not have a custom status set."""
    captured = _run_and_capture(pytester)
    assert captured.get("test_states.py::test_passing") is None


def test_plain_assertion_error_has_no_custom_status(pytester: pytest.Pytester):
    """An ordinary AssertionError must not produce a custom status."""
    captured = _run_and_capture(pytester)
    assert captured.get("test_states.py::test_failing") is None


def test_waiting_signal_sets_custom_status_waiting(pytester: pytest.Pytester):
    """WaitingSignal must produce custom_status='waiting' on the report."""
    captured = _run_and_capture(pytester)
    assert captured.get("test_states.py::test_waiting") == "waiting"


def test_otherbadthing_signal_sets_custom_status(pytester: pytest.Pytester):
    """OtherBadThingSignal must produce custom_status='otherbadthing'."""
    captured = _run_and_capture(pytester)
    assert captured.get("test_states.py::test_otherbadthing") == "otherbadthing"


def test_known_error_sets_custom_status(pytester: pytest.Pytester):
    """KnownError must produce custom_status='knownError'."""
    captured = _run_and_capture(pytester)
    assert captured.get("test_states.py::test_known_error") == "knownError"


def test_all_states_captured_together(pytester: pytest.Pytester):
    """Smoke test: all five outcomes are produced correctly in a single run."""
    captured = _run_and_capture(pytester)

    assert captured["test_states.py::test_passing"] is None
    assert captured["test_states.py::test_failing"] is None
    assert captured["test_states.py::test_waiting"] == "waiting"
    assert captured["test_states.py::test_otherbadthing"] == "otherbadthing"
    assert captured["test_states.py::test_known_error"] == "knownError"
