"""IPC bridge between pytest and a host such as the Big Dill VS Code extension.

The host creates a named pipe (Windows) or Unix domain socket, passes its path in
``TEST_RUN_PIPE``, and reads content-length framed JSON-RPC from it. This module
is the writing half, plus the discovery and execution payloads themselves.

Wire format, one frame per message::

    content-length: <N>\\r\\n
    content-type: application/json\\r\\n
    \\r\\n
    {"jsonrpc": "2.0", "params": <payload>}

``N`` counts characters rather than bytes. That is only safe because
``json.dumps`` escapes non-ASCII by default, making the two equal — do not pass
``ensure_ascii=False`` without changing the reader to match, or a single accented
character in a scenario name will desynchronise the stream.
"""

from __future__ import annotations

import atexit
import json
import os
import sys
from typing import Any

TEST_RUN_PIPE_ENV = "TEST_RUN_PIPE"

_writer: Any = None
_errors: list[str] = []


def pipe_path() -> str | None:
    """Path of the host's pipe, or None when running outside a host."""
    return os.environ.get(TEST_RUN_PIPE_ENV) or None


def record_error(message: str) -> None:
    """Note an error to be reported with the next payload."""
    _errors.append(message)


def collected_errors() -> list[str]:
    return list(_errors)


def _open_pipe(path: str):
    """Connect to the host's pipe.

    Windows named pipes behave as files; everywhere else the host creates a Unix
    domain socket, which has to be connected rather than opened.
    """
    if sys.platform == "win32":
        return open(path, "wb")  # noqa: SIM115, PTH123

    import socket

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(path)
    return sock.makefile("wb")


def _close_writer() -> None:
    global _writer
    if _writer is not None:
        try:
            _writer.close()
        except Exception:  # noqa: BLE001 - closing must never raise at exit
            pass
        _writer = None


atexit.register(_close_writer)


def send_message(payload: dict) -> None:
    """Send one payload to the host. A no-op when no pipe is configured.

    Failures are reported on stderr and swallowed: a broken pipe should not fail
    the user's test run, and the host treats a missing payload as an error
    already.
    """
    path = pipe_path()
    if not path:
        return

    global _writer
    if _writer is None:
        try:
            _writer = _open_pipe(path)
        except Exception as error:  # noqa: BLE001 - reported, not raised
            print(f"big-dill: cannot connect to {path}: {error}", file=sys.stderr)
            return

    # ensure_ascii keeps character count equal to byte count — see module docstring.
    data = json.dumps({"jsonrpc": "2.0", "params": payload}, ensure_ascii=True)
    frame = (
        f"content-length: {len(data)}\r\n"
        f"content-type: application/json\r\n"
        f"\r\n"
        f"{data}"
    ).encode()

    try:
        written = 0
        while written < len(frame):
            written += _writer.write(frame[written : written + 4096])
        _writer.flush()
    except Exception as error:  # noqa: BLE001 - reported, not raised
        print(f"big-dill: failed sending payload: {error}", file=sys.stderr)


# ── Payload construction ────────────────────────────────────────────────────


def _line_of(item) -> int:
    """1-based line of a test item, or 0 when pytest does not report one."""
    location = getattr(item, "location", None)
    if location and len(location) > 1 and isinstance(location[1], int):
        # pytest reports a 0-based line here; the wire contract is 1-based.
        return location[1] + 1
    return 0


def discovery_item(item, rootdir: str) -> dict:
    """One collected test as a wire item.

    BDD metadata is attached during collection by the plugin's
    ``pytest_collection_modifyitems``; plain pytest items simply lack it and the
    host renders them under a file hierarchy instead.
    """
    node: dict[str, Any] = {
        "path": str(getattr(item, "fspath", "") or ""),
        "name": item.name,
        "type_": "test",
        "id_": item.nodeid,
        "lineno": _line_of(item),
        "runID": item.nodeid,
    }

    feature_path = getattr(item, "_bdd_feature_path", None)
    if feature_path is not None:
        node["feature_path"] = feature_path
        # A BDD item is displayed against its .feature file, so its line must come
        # from there rather than from the Python test function.
        bdd_line = getattr(item, "_bdd_line_number", None)
        if isinstance(bdd_line, int):
            node["lineno"] = bdd_line
        node["scenario_name"] = getattr(item, "_bdd_scenario_name", item.name)
        scenario_tags = getattr(item, "_bdd_scenario_tags", None)
        if scenario_tags:
            node["scenario_tags"] = list(scenario_tags)
        feature_tags = getattr(item, "_bdd_feature_tags", None)
        if feature_tags:
            node["feature_tags"] = list(feature_tags)
        feature_name = getattr(item, "_bdd_feature_name", None)
        if feature_name:
            node["feature_name"] = feature_name

    return node


def discovery_payload(items, rootdir: str) -> dict:
    """The full discovery payload.

    Items are emitted flat beneath a single root. The host derives the folder
    hierarchy from each item's ``feature_path``, so nesting them here would be
    redundant — and would have to agree with that derivation.
    """
    return {
        "cwd": rootdir,
        "status": "error" if _errors else "success",
        "tests": {
            "path": rootdir,
            "name": os.path.basename(rootdir.rstrip(os.sep)) or rootdir,
            "type_": "folder",
            "id_": rootdir,
            "children": [discovery_item(item, rootdir) for item in items],
        },
        "error": list(_errors),
    }


def execution_payload(results: dict[str, dict], rootdir: str, not_found: list[str] | None = None) -> dict:
    """The full execution payload."""
    payload: dict[str, Any] = {
        "cwd": rootdir,
        "status": "error" if _errors else "success",
        "result": results,
        "error": "\n".join(_errors),
    }
    if not_found:
        payload["notFound"] = not_found
    return payload


def outcome_of(report) -> str:
    """Map a pytest report onto the wire's outcome vocabulary.

    xfail and xpass are deliberately not special-cased: an expected failure is
    reported by pytest as skipped, and an unexpected pass as failed, which is
    what a reader should see.
    """
    if report.outcome == "passed":
        return "success"
    if report.outcome == "skipped":
        return "skipped"
    return "failure" if report.when == "call" else "error"


def result_entry(report) -> dict:
    """One test's result. ``custom_status`` is attached by the plugin's hooks."""
    entry: dict[str, Any] = {
        "test": report.nodeid,
        "outcome": outcome_of(report),
    }

    if report.longrepr is not None:
        text = str(report.longrepr)
        entry["message"] = text
        entry["traceback"] = text

    custom = getattr(report, "vscode_custom_status", None)
    if custom is not None:
        entry["custom_status"] = custom

    return entry


def record_report(results: dict[str, dict], report) -> None:
    """Fold one phase report into the accumulated results.

    pytest emits setup, call and teardown reports per test. The call phase is
    what a reader wants when it happened; a setup failure means the test never
    ran and is an error; a setup skip is how skipif and fixtures signal skipped.
    Teardown only overwrites when it failed and nothing worse was recorded, so a
    passing test with a broken fixture teardown still surfaces.
    """
    nodeid = report.nodeid
    existing = results.get(nodeid)

    if report.when == "call":
        results[nodeid] = result_entry(report)
        return

    if report.failed:
        # A call result already describes the test better than a teardown error.
        if existing is None or existing.get("outcome") == "success":
            results[nodeid] = result_entry(report)
        return

    if report.when == "setup" and report.skipped and existing is None:
        results[nodeid] = result_entry(report)
