"""pytest hooks for the Big Dill test runner plugin."""

import os
from pathlib import Path

import pytest

from .hookspec import BigDillHookSpec
from .lint_runner import interpolate_scenario, validate_step_params
from .lint_types import LintDiagnostic
from .step_registry import collect_step_definitions, collect_step_type_classes


def pytest_configure(config):
    config.pluginmanager.add_hookspecs(BigDillHookSpec)


def pytest_addoption(parser):
    parser.addoption(
        "--bdd-lint",
        nargs="?",
        const="__all__",
        default=None,
        metavar="FILE",
        help="Lint .feature files for parameter errors and scenario rule violations.",
    )


def pytest_collection_modifyitems(session, config, items):
    """Attach BDD metadata to pytest-bdd items and resolve custom display names."""
    for item in items:
        # pytest-bdd 8.x stores the ScenarioTemplate on the test function as __scenario__
        obj = getattr(item, "_obj", None)
        scenario = getattr(obj, "__scenario__", None)

        if scenario is None:
            continue  # not a pytest-bdd item

        feature_path = os.path.relpath(scenario.feature.filename, str(config.rootdir))
        item._bdd_feature_path = feature_path
        item._bdd_scenario_name = scenario.name  # default: plain scenario name

        # pytest-bdd 8.x stores example row values under the '_pytest_bdd_example'
        # key inside callspec.params, not at the top level.
        raw_params = item.callspec.params if hasattr(item, "callspec") else {}
        example_params = raw_params.get('_pytest_bdd_example', {})

        # Call the user-defined hook — first non-None result wins (firstresult=True)
        custom_name = config.hook.pytest_big_dill_test_name(
            scenario_name=scenario.name,
            example_params=example_params,
            feature_name=scenario.feature.name,
            feature_path=feature_path,
        )
        if custom_name is not None:
            item.name = custom_name
            item._bdd_scenario_name = custom_name
            # item.nodeid is intentionally left unchanged — used for execution tracking


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Call pytest_big_dill_custom_status and surface the result on the report."""
    outcome = yield
    report = outcome.get_result()

    custom = item.config.hook.pytest_big_dill_custom_status(report=report, config=item.config)
    if custom is not None:
        report.vscode_custom_status = custom


def pytest_sessionfinish(session, exitstatus):
    opt = session.config.getoption("--bdd-lint", default=None)
    if opt is None:
        return

    step_defs = collect_step_definitions(session)
    step_types = collect_step_type_classes()

    # Determine which feature files to lint
    if opt == "__all__":
        # First try to discover from collected BDD items
        from_items = {
            Path(session.config.rootdir) / item._bdd_feature_path
            for item in session.items
            if hasattr(item, '_bdd_feature_path')
        }
        if from_items:
            feature_files = list(from_items)
        else:
            # Fall back: scan rootdir for all .feature files
            rootdir = Path(session.config.rootdir)
            feature_files = list(rootdir.rglob("*.feature"))
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
    else:
        # Ensure a clean lint always exits 0, even if no tests were collected
        if session.exitstatus == 5:  # pytest.ExitCode.NO_TESTS_COLLECTED
            session.exitstatus = 0


class _ExamplesRowsAdapter:
    """Wrap a pytest-bdd Examples object to expose a .rows attribute.

    ``.rows`` returns a list of dicts mapping column names to string values,
    compatible with ``interpolate_scenario`` and user lint hooks.
    """

    def __init__(self, examples_obj):
        self._obj = examples_obj
        # strict=False: pytest-bdd guarantees rectangular tables, and a lint pass
        # should still produce diagnostics for a malformed feature rather than raise.
        self.rows = [
            dict(zip(examples_obj.example_params, row, strict=False))
            for row in examples_obj.examples
        ]

    def __getattr__(self, name):
        return getattr(self._obj, name)


def _lint_feature_file(
    path: Path,
    step_defs: list[dict],
    step_types: dict,
    config,
) -> list[LintDiagnostic]:
    """Parse and lint a single .feature file, returning all diagnostics."""
    try:
        from pytest_bdd.parser import FeatureParser
        feature = FeatureParser(basedir=str(path.parent), filename=path.name).parse()
    except Exception as exc:
        return [LintDiagnostic(message=f"Failed to parse {path}: {exc}")]

    diagnostics: list[LintDiagnostic] = []

    # feature.scenarios is an OrderedDict in pytest-bdd 8.x
    scenarios = feature.scenarios.values() if isinstance(feature.scenarios, dict) else feature.scenarios

    for scenario in scenarios:
        has_examples = bool(getattr(scenario, 'examples', None))

        # Parameter validation: every step in every scenario
        for step in scenario.steps:
            step_text = step.name
            line = getattr(step, 'line_number', None)
            for step_def in step_defs:
                diags = validate_step_params(step_text, step_def, step_types, line_number=line)
                diagnostics.extend(diags)

        if has_examples:
            # Wrap examples to provide .rows (list of dicts) for hook consumers
            wrapped_examples = [_ExamplesRowsAdapter(ex) for ex in scenario.examples]

            # 1. Outline-level checks (duplicates, large sets, etc.)
            for result_list in config.hook.pytest_big_dill_lint_outline(
                scenario=scenario, examples=wrapped_examples
            ):
                if result_list:
                    diagnostics.extend(result_list)

            # 2. Scenario-level checks applied to each interpolated row
            for examples_block in scenario.examples:
                for row in examples_block.as_contexts():
                    interpolated = interpolate_scenario(scenario, row)
                    for result_list in config.hook.pytest_big_dill_lint_scenario(
                        scenario=interpolated
                    ):
                        if result_list:
                            diagnostics.extend(result_list)
        else:
            for result_list in config.hook.pytest_big_dill_lint_scenario(scenario=scenario):
                if result_list:
                    diagnostics.extend(result_list)

    return diagnostics


def _emit_lint_results(
    diagnostics: list[tuple[str, LintDiagnostic]],
    config,
) -> None:
    """Route lint diagnostics to stdout (CLI) or IPC (VS Code)."""
    if os.environ.get('TEST_RUN_PIPE'):
        _emit_ipc(diagnostics)
    else:
        _emit_stdout(diagnostics)


def _emit_stdout(diagnostics: list[tuple[str, LintDiagnostic]]) -> None:
    if not diagnostics:
        print("Big Dill lint: no issues found")
        return
    for path, d in diagnostics:
        loc = f"{path}:{d.line}" if d.line else path
        print(f"{d.severity.upper()}: {loc}: {d.message}")


def _emit_ipc(diagnostics: list[tuple[str, LintDiagnostic]]) -> None:
    """Send lint diagnostics to VS Code via the existing IPC pipe."""
    try:
        from vscode_pytest import send_message
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
    send_message(payload)


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
