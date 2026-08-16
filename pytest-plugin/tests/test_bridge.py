"""Bridge behaviour that a green test run never exercises.

The happy path is covered end to end by the playground. What is tested here is
everything that only shows up when something goes wrong — which is precisely
what a reimplementation loses without anyone noticing.
"""

from __future__ import annotations

import json
import types

import pytest

from pytest_big_dill import bridge


def report(nodeid="t.py::test_a", when="call", outcome="passed", longrepr=None, **extra):
    """A stand-in for pytest's TestReport, carrying only what the bridge reads."""
    return types.SimpleNamespace(
        nodeid=nodeid, when=when, outcome=outcome, longrepr=longrepr,
        failed=outcome == "failed", skipped=outcome == "skipped", **extra,
    )


@pytest.fixture(autouse=True)
def _isolate_module_state(monkeypatch):
    """The bridge keeps errors and its writer at module scope; reset between tests."""
    monkeypatch.setattr(bridge, "_errors", [])
    monkeypatch.setattr(bridge, "_writer", None)
    monkeypatch.delenv(bridge.TEST_RUN_PIPE_ENV, raising=False)


# ── outcome mapping ─────────────────────────────────────────────────────────

class TestOutcomeMapping:
    def test_passed_becomes_success(self):
        assert bridge.outcome_of(report(outcome="passed")) == "success"

    def test_skipped_stays_skipped(self):
        assert bridge.outcome_of(report(outcome="skipped")) == "skipped"

    def test_failure_during_call_is_a_failure(self):
        assert bridge.outcome_of(report(outcome="failed", when="call")) == "failure"

    def test_failure_outside_call_is_an_error(self):
        """A test that never ran is an error, not a failing test."""
        assert bridge.outcome_of(report(outcome="failed", when="setup")) == "error"
        assert bridge.outcome_of(report(outcome="failed", when="teardown")) == "error"

    def test_xfail_arrives_as_skipped(self):
        """pytest reports an expected failure as skipped; the bridge does not disguise it."""
        assert bridge.outcome_of(report(outcome="skipped", when="call")) == "skipped"

    def test_xpass_arrives_as_failed(self):
        assert bridge.outcome_of(report(outcome="failed", when="call")) == "failure"


# ── phase folding ───────────────────────────────────────────────────────────

class TestRecordReport:
    def test_call_result_is_recorded(self):
        results = {}
        bridge.record_report(results, report(outcome="passed"))
        assert results["t.py::test_a"]["outcome"] == "success"

    def test_setup_failure_is_recorded_as_an_error(self):
        results = {}
        bridge.record_report(results, report(when="setup", outcome="failed"))
        assert results["t.py::test_a"]["outcome"] == "error"

    def test_setup_skip_is_recorded(self):
        """skipif and fixture skips arrive on the setup phase."""
        results = {}
        bridge.record_report(results, report(when="setup", outcome="skipped"))
        assert results["t.py::test_a"]["outcome"] == "skipped"

    def test_a_passing_teardown_does_not_overwrite_the_call_result(self):
        results = {}
        bridge.record_report(results, report(when="call", outcome="failed"))
        bridge.record_report(results, report(when="teardown", outcome="passed"))
        assert results["t.py::test_a"]["outcome"] == "failure"

    def test_a_failing_teardown_surfaces_over_a_passing_call(self):
        """A test that passes but breaks its fixtures should not report clean."""
        results = {}
        bridge.record_report(results, report(when="call", outcome="passed"))
        bridge.record_report(results, report(when="teardown", outcome="failed"))
        assert results["t.py::test_a"]["outcome"] == "error"

    def test_a_failing_teardown_does_not_mask_a_failing_call(self):
        results = {}
        bridge.record_report(results, report(when="call", outcome="failed", longrepr="the real problem"))
        bridge.record_report(results, report(when="teardown", outcome="failed", longrepr="noise"))
        assert results["t.py::test_a"]["message"] == "the real problem"

    def test_setup_skip_does_not_overwrite_an_existing_result(self):
        results = {}
        bridge.record_report(results, report(when="call", outcome="failed"))
        bridge.record_report(results, report(when="setup", outcome="skipped"))
        assert results["t.py::test_a"]["outcome"] == "failure"


class TestResultEntry:
    def test_longrepr_becomes_both_message_and_traceback(self):
        entry = bridge.result_entry(report(outcome="failed", longrepr="boom"))
        assert entry["message"] == "boom"
        assert entry["traceback"] == "boom"

    def test_no_longrepr_means_no_message(self):
        assert "message" not in bridge.result_entry(report())

    def test_custom_status_is_carried_through(self):
        entry = bridge.result_entry(report(outcome="failed", vscode_custom_status="waiting"))
        assert entry["custom_status"] == "waiting"


# ── error collection ────────────────────────────────────────────────────────

class TestErrors:
    def test_errors_reach_the_discovery_payload_and_flip_its_status(self):
        bridge.record_error("collection exploded")
        payload = bridge.discovery_payload([], "/repo")
        assert payload["status"] == "error"
        assert payload["error"] == ["collection exploded"]

    def test_errors_reach_the_execution_payload(self):
        bridge.record_error("interrupted")
        payload = bridge.execution_payload({}, "/repo")
        assert payload["status"] == "error"
        assert "interrupted" in payload["error"]

    def test_a_clean_run_reports_success(self):
        assert bridge.discovery_payload([], "/repo")["status"] == "success"
        assert bridge.execution_payload({}, "/repo")["status"] == "success"

    def test_not_found_is_omitted_when_empty(self):
        assert "notFound" not in bridge.execution_payload({}, "/repo", [])

    def test_not_found_is_included_when_present(self):
        payload = bridge.execution_payload({}, "/repo", ["t.py::gone"])
        assert payload["notFound"] == ["t.py::gone"]


# ── transport ───────────────────────────────────────────────────────────────

class TestSendMessage:
    def test_no_pipe_is_a_silent_no_op(self, capsys):
        """Running pytest outside a host must be completely unaffected."""
        bridge.send_message({"anything": True})
        assert capsys.readouterr().err == ""

    def test_a_broken_pipe_is_reported_but_does_not_raise(self, monkeypatch, capsys, tmp_path):
        monkeypatch.setenv(bridge.TEST_RUN_PIPE_ENV, str(tmp_path / "nonexistent.sock"))
        bridge.send_message({"anything": True})
        assert "big-dill" in capsys.readouterr().err

    def test_frame_declares_the_body_length_and_wraps_it_in_jsonrpc(self, monkeypatch, tmp_path):
        written = bytearray()
        monkeypatch.setenv(bridge.TEST_RUN_PIPE_ENV, str(tmp_path / "s.sock"))
        monkeypatch.setattr(bridge, "_writer", types.SimpleNamespace(
            write=lambda b: (written.extend(b), len(b))[1], flush=lambda: None,
        ))

        bridge.send_message({"hello": "world"})

        head, _, body = written.decode().partition("\r\n\r\n")
        declared = int(head.split("content-length:")[1].split("\r\n")[0])
        assert declared == len(body), "content-length must match the body it frames"
        assert json.loads(body) == {"jsonrpc": "2.0", "params": {"hello": "world"}}

    def test_non_ascii_is_escaped_so_length_stays_a_byte_count(self, monkeypatch, tmp_path):
        """The reader indexes by the declared count; escaping keeps chars == bytes."""
        written = bytearray()
        monkeypatch.setenv(bridge.TEST_RUN_PIPE_ENV, str(tmp_path / "s.sock"))
        monkeypatch.setattr(bridge, "_writer", types.SimpleNamespace(
            write=lambda b: (written.extend(b), len(b))[1], flush=lambda: None,
        ))

        bridge.send_message({"name": "Función ⏳"})

        head, _, body = written.decode().partition("\r\n\r\n")
        declared = int(head.split("content-length:")[1].split("\r\n")[0])
        assert declared == len(body.encode()), "declared length must match the bytes on the wire"
        assert json.loads(body)["params"]["name"] == "Función ⏳"


# ── discovery payload shape ─────────────────────────────────────────────────

class TestDiscoveryPayload:
    def test_items_are_flat_beneath_one_root(self):
        item = types.SimpleNamespace(
            name="test_a", nodeid="t.py::test_a", fspath="/repo/t.py", location=("t.py", 4, "test_a"),
        )
        payload = bridge.discovery_payload([item], "/repo")
        assert payload["tests"]["type_"] == "folder"
        assert [c["id_"] for c in payload["tests"]["children"]] == ["t.py::test_a"]

    def test_a_plain_pytest_item_carries_no_bdd_fields(self):
        item = types.SimpleNamespace(
            name="test_a", nodeid="t.py::test_a", fspath="/repo/t.py", location=("t.py", 4, "test_a"),
        )
        node = bridge.discovery_item(item, "/repo")
        assert "feature_path" not in node
        assert node["lineno"] == 5, "pytest reports 0-based; the wire contract is 1-based"

    def test_a_missing_location_does_not_crash(self):
        item = types.SimpleNamespace(name="a", nodeid="a", fspath="", location=None)
        assert bridge.discovery_item(item, "/repo")["lineno"] == 0


# ── symlinked project roots ─────────────────────────────────────────────────

FEATURE = """\
Feature: Symlink
  Scenario: Works through a link
    Given a linked step
"""

CONFTEST = """\
from pytest_bdd import given

@given("a linked step")
def linked_step():
    pass
"""

TESTFILE = """\
from pytest_bdd import scenarios
scenarios("sym.feature")
"""


class _Capture:
    def __init__(self):
        self.items = []

    def pytest_collection_finish(self, session):
        self.items.extend(session.items)


def test_feature_path_is_relative_even_when_the_root_is_a_symlink(pytester, tmp_path):
    """A workspace reached through a symlink must not produce a '../' feature path.

    relpath compares the strings it is given, so a resolved feature filename against
    an unresolved rootdir yields '../real/features/x.feature'. The host then builds
    folder nodes called '..' and resolves URIs outside the workspace.
    """
    pytester.makeconftest(CONFTEST)
    pytester.makefile(".feature", sym=FEATURE)
    pytester.makepyfile(test_sym=TESTFILE)

    link = tmp_path / "linked-root"
    link.symlink_to(pytester.path, target_is_directory=True)

    capture = _Capture()
    pytester.inline_run("--collect-only", "--rootdir", str(link), plugins=[capture])

    bdd = [i for i in capture.items if hasattr(i, "_bdd_feature_path")]
    assert bdd, "expected at least one pytest-bdd item"

    for item in bdd:
        path = item._bdd_feature_path
        assert not path.startswith(".."), (
            f"feature_path escaped the workspace: {path!r} — the rootdir was reached "
            "through a symlink and the feature filename was not"
        )
        assert path == "sym.feature", f"expected a plain relative path, got {path!r}"
