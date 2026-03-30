"""pytest hooks for the pytest-bdd-orama test runner plugin."""

import os

import pytest

from .hookspec import BddOramaHookSpec


def pytest_configure(config):
    config.pluginmanager.add_hookspecs(BddOramaHookSpec)


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
        custom_name = config.hook.pytest_bdd_orama_test_name(
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
    """Call pytest_bdd_orama_custom_status and surface the result on the report."""
    outcome = yield
    report = outcome.get_result()

    custom = item.config.hook.pytest_bdd_orama_custom_status(report=report, config=item.config)
    if custom is not None:
        report.vscode_custom_status = custom
