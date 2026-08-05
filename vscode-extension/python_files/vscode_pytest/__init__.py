# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
# Adapted from microsoft/vscode-python (commit 5c2c3948e1c8c8a1dfe848104773477e70d0b83b).
#
# Big Dill modifications (marked with BIG-DILL):
#   1. TestItem TypedDict: added optional feature_path and scenario_name fields.
#   2. TestOutcome: added optional custom_status field.
#   3. create_test_node(): populates feature_path/scenario_name from _bdd_* item attrs.
#   4. create_test_outcome(): accepts and stores custom_status.
#   5. pytest_report_teststatus(): reads vscode_custom_status from report.

from __future__ import annotations

import atexit
import contextlib
import json
import os
import pathlib
import sys
import traceback
from typing import (
    TYPE_CHECKING,
    Any,
    Dict,
    Generator,
    Literal,
    Protocol,
    TypedDict,
    cast,
)

import pytest

if TYPE_CHECKING:
    from pluggy import Result
    from typing_extensions import NotRequired

USES_PYTEST_DESCRIBE = False

with contextlib.suppress(ImportError):
    from pytest_describe.plugin import DescribeBlock

    USES_PYTEST_DESCRIBE = True


class HasPathOrFspath(Protocol):
    """Protocol defining objects that have either a path or fspath attribute."""

    path: pathlib.Path | None = None
    fspath: Any | None = None


class TestData(TypedDict):
    """A general class that all test objects inherit from."""

    name: str
    path: pathlib.Path
    type_: Literal["class", "function", "file", "folder", "test", "error"]
    id_: str


class TestItem(TestData):
    """A class defining test items."""

    lineno: str
    runID: str
    # BIG-DILL: feature-file path (relative to rootdir) and display name
    feature_path: NotRequired[str]
    scenario_name: NotRequired[str]
    # BIG-DILL: scenario-level tags (e.g. ["auth", "smoke"])
    scenario_tags: NotRequired[list[str]]
    # BIG-DILL: feature-level tags (from the Feature: declaration line)
    feature_tags: NotRequired[list[str]]
    # BIG-DILL: feature display name (from the Feature: declaration line)
    feature_name: NotRequired[str]


class TestNode(TestData):
    """A general class that handles all test data which contains children."""

    children: list[TestNode | TestItem | None]
    lineno: NotRequired[str]


class VSCodePytestError(Exception):
    """A custom exception class for pytest errors."""

    def __init__(self, message):
        super().__init__(message)


ERRORS = []
IS_DISCOVERY = False
map_id_to_path = {}
collected_tests_so_far = set()
TEST_RUN_PIPE = os.getenv("TEST_RUN_PIPE")
PROJECT_ROOT_PATH = os.getenv("PROJECT_ROOT_PATH")
SYMLINK_PATH = None
INCLUDE_BRANCHES = False

_path_cache: dict[int, pathlib.Path] = {}
_path_to_str_cache: dict[pathlib.Path, str] = {}
_CACHED_CWD: pathlib.Path | None = None


def get_test_root_path() -> pathlib.Path:
    if PROJECT_ROOT_PATH:
        return pathlib.Path(PROJECT_ROOT_PATH)
    return pathlib.Path.cwd()


def pytest_load_initial_conftests(early_config, parser, args):  # noqa: ARG001
    has_pytest_cov = early_config.pluginmanager.hasplugin(
        "pytest_cov"
    ) or early_config.pluginmanager.hasplugin("pytest_cov.plugin")
    has_cov_arg = any("--cov" in arg for arg in args)
    if has_cov_arg and not has_pytest_cov:
        raise VSCodePytestError(
            "\n \nERROR: pytest-cov is not installed, please install this before running pytest with coverage as pytest-cov is required. \n"
        )
    if "--cov-branch" in args:
        global INCLUDE_BRANCHES
        INCLUDE_BRANCHES = True

    global TEST_RUN_PIPE
    TEST_RUN_PIPE = os.getenv("TEST_RUN_PIPE")
    error_string = (
        "PYTEST ERROR: TEST_RUN_PIPE is not set at the time of pytest starting. "
        "Please confirm this environment variable is not being changed or removed "
        "as it is required for successful test discovery and execution."
        f"TEST_RUN_PIPE = {TEST_RUN_PIPE}\n"
    )
    if not TEST_RUN_PIPE:
        print(error_string, file=sys.stderr)
    if "--collect-only" in args:
        global IS_DISCOVERY
        IS_DISCOVERY = True

    for arg in args:
        if "--rootdir=" in arg:
            rootdir = pathlib.Path(arg.split("--rootdir=")[1])
            if not rootdir.exists():
                raise VSCodePytestError(
                    f"The path set in the argument --rootdir={rootdir} does not exist."
                )
            is_symlink = False
            if rootdir.is_symlink():
                is_symlink = True
            elif rootdir.resolve() != rootdir:
                is_symlink = has_symlink_parent(rootdir)
            if is_symlink:
                global SYMLINK_PATH
                SYMLINK_PATH = rootdir


def pytest_internalerror(excrepr, excinfo):  # noqa: ARG001
    ERRORS.append(excinfo.exconly() + "\n Check Python Logs for more details.")


def pytest_exception_interact(node, call, report):
    if IS_DISCOVERY:
        if call.excinfo and call.excinfo.typename != "AssertionError":
            if report.outcome == "skipped" and "SkipTest" in str(call):
                return
            ERRORS.append(call.excinfo.exconly() + "\n Check Python Logs for more details.")
        else:
            ERRORS.append(report.longreprtext + "\n Check Python Logs for more details.")
    else:
        report_value = "error"
        if call.excinfo.typename == "AssertionError":
            report_value = "failure"
        node_id = get_absolute_test_id(node.nodeid, get_node_path(node))
        if node_id not in collected_tests_so_far:
            collected_tests_so_far.add(node_id)
            item_result = create_test_outcome(
                node_id,
                report_value,
                "Test failed with exception",
                report.longreprtext,
            )
            collected_test = TestRunResultDict()
            collected_test[node_id] = item_result
            cwd = pathlib.Path.cwd()
            send_execution_message(
                os.fsdecode(cwd),
                "success",
                collected_test or None,
            )


def has_symlink_parent(current_path):
    curr_path = pathlib.Path(current_path)
    for parent in curr_path.parents:
        if parent.is_symlink():
            return True
    return False


def get_absolute_test_id(test_id: str, test_path: pathlib.Path) -> str:
    split_id = test_id.split("::")[1:]
    return "::".join([str(test_path), *split_id])


def pytest_keyboard_interrupt(excinfo):
    ERRORS.append(excinfo.exconly() + "\n Check Python Logs for more details.")


class TestOutcome(Dict):
    """A class that handles outcome for a single test."""
    test: str
    outcome: Literal["success", "failure", "skipped", "error"]
    message: str | None
    traceback: str | None
    subtest: str | None
    # BIG-DILL: custom pytest status string (e.g. "waiting", "knownError")
    custom_status: str | None


def create_test_outcome(
    testid: str,
    outcome: str,
    message: str | None,
    traceback: str | None,
    subtype: str | None = None,  # noqa: ARG001
    # BIG-DILL: optional custom status from pytest_report_customstatus
    custom_status: str | None = None,
) -> TestOutcome:
    return TestOutcome(
        test=testid,
        outcome=outcome,
        message=message,
        traceback=traceback,
        subtest=None,
        custom_status=custom_status,  # BIG-DILL
    )


class TestRunResultDict(Dict[str, Dict[str, TestOutcome]]):
    outcome: str
    tests: dict[str, TestOutcome]


@pytest.hookimpl(hookwrapper=True, trylast=True)
def pytest_report_teststatus(report, config):  # noqa: ARG001
    cwd = pathlib.Path.cwd()
    if SYMLINK_PATH:
        cwd = SYMLINK_PATH

    if report.when == "call" or (report.when == "setup" and report.skipped):
        traceback = None
        message = None
        report_value = "skipped"
        if report.passed:
            report_value = "success"
        elif report.failed:
            report_value = "failure"
            message = report.longreprtext

        # BIG-DILL: read custom status attached by the pytest-big-dill plugin
        custom_status: str | None = getattr(report, "vscode_custom_status", None)

        try:
            node_path = map_id_to_path[report.nodeid]
        except KeyError:
            node_path = cwd
        absolute_node_id = get_absolute_test_id(report.nodeid, node_path)
        if absolute_node_id not in collected_tests_so_far:
            collected_tests_so_far.add(absolute_node_id)
            item_result = create_test_outcome(
                absolute_node_id,
                report_value,
                message,
                traceback,
                custom_status=custom_status,  # BIG-DILL
            )
            collected_test = TestRunResultDict()
            collected_test[absolute_node_id] = item_result
            send_execution_message(
                os.fsdecode(cwd),
                "success",
                collected_test or None,
            )
    yield


ERROR_MESSAGE_CONST = {
    2: "Pytest was unable to start or run any tests due to issues with test discovery or test collection.",
    3: "Pytest was interrupted by the user, for example by pressing Ctrl+C during test execution.",
    4: "Pytest encountered an internal error or exception during test execution.",
    5: "Pytest was unable to find any tests to run.",
}


@pytest.hookimpl(hookwrapper=True, trylast=True)
def pytest_runtest_protocol(item, nextitem):  # noqa: ARG001
    map_id_to_path[item.nodeid] = get_node_path(item)
    skipped = check_skipped_wrapper(item)
    if skipped:
        absolute_node_id = get_absolute_test_id(item.nodeid, get_node_path(item))
        report_value = "skipped"
        cwd = pathlib.Path.cwd()
        if absolute_node_id not in collected_tests_so_far:
            collected_tests_so_far.add(absolute_node_id)
            item_result = create_test_outcome(
                absolute_node_id,
                report_value,
                None,
                None,
            )
            collected_test = TestRunResultDict()
            collected_test[absolute_node_id] = item_result
            send_execution_message(
                os.fsdecode(cwd),
                "success",
                collected_test or None,
            )
    yield


def check_skipped_wrapper(item):
    if item.own_markers and check_skipped_condition(item):
        return True
    parent = item.parent
    while isinstance(parent, pytest.Class):
        if parent.own_markers and check_skipped_condition(parent):
            return True
        parent = parent.parent
    return False


def check_skipped_condition(item):
    for marker in item.own_markers:
        skip_condition = False
        if marker.name == "skipif":
            skip_condition = any(marker.args)
        if marker.name == "skip" or skip_condition:
            return True
    return False


class FileCoverageInfo(TypedDict):
    lines_covered: list[int]
    lines_missed: list[int]
    executed_branches: int
    total_branches: int


def pytest_sessionfinish(session, exitstatus):
    test_root_path = get_test_root_path()
    if SYMLINK_PATH:
        test_root_path = pathlib.Path(SYMLINK_PATH)

    if IS_DISCOVERY:
        if not (exitstatus == 0 or exitstatus == 1 or exitstatus == 5):
            error_node: TestNode = {
                "name": "",
                "path": test_root_path,
                "type_": "error",
                "children": [],
                "id_": "",
            }
            send_discovery_message(os.fsdecode(test_root_path), error_node)
        try:
            session_node: TestNode | None = build_test_tree(session)
            if not session_node:
                raise VSCodePytestError(
                    "Something went wrong following pytest finish, no session node was created"
                )
            send_discovery_message(os.fsdecode(test_root_path), session_node)
        except Exception as e:
            ERRORS.append(
                f"Error Occurred, traceback: {(traceback.format_exc() if e.__traceback__ else '')}"
            )
            error_node: TestNode = {
                "name": "",
                "path": test_root_path,
                "type_": "error",
                "children": [],
                "id_": "",
            }
            send_discovery_message(os.fsdecode(test_root_path), error_node)
    else:
        if exitstatus == 0 or exitstatus == 1:
            exitstatus_bool = "success"
        else:
            ERRORS.append(
                f"Pytest exited with error status: {exitstatus}, {ERROR_MESSAGE_CONST[exitstatus]}"
            )
            exitstatus_bool = "error"
            send_execution_message(
                os.fsdecode(test_root_path),
                exitstatus_bool,
                None,
            )


def construct_nested_folders(
    file_nodes_dict: dict[str, TestNode],
    session_node: TestNode,
    session_children_dict: dict[str, TestNode],
) -> dict[str, TestNode]:
    created_files_folders_dict: dict[str, TestNode] = {}
    for file_node in file_nodes_dict.values():
        root_folder_node: TestNode
        try:
            root_folder_node = build_nested_folders(
                file_node, created_files_folders_dict, session_node
            )
        except ValueError:
            file_path_str: str = str(file_node["path"])
            session_path_str: str = str(session_node["path"])
            common_parent = os.path.commonpath([file_path_str, session_path_str])
            common_parent_path = pathlib.Path(common_parent)
            session_node["path"] = common_parent_path
            session_node["id_"] = common_parent
            session_node["name"] = common_parent_path.name
            root_folder_node = build_nested_folders(
                file_node, created_files_folders_dict, session_node
            )
        root_id = root_folder_node.get("id_")
        if root_id and root_id not in session_children_dict:
            session_children_dict[root_id] = root_folder_node
    return session_children_dict


def process_parameterized_test(
    test_case: pytest.Item,
    test_node: TestItem,
    function_nodes_dict: dict[str, TestNode],
    file_nodes_dict: dict[str, TestNode],
) -> TestNode:
    function_name: str = ""
    parent_part, parameterized_section = test_node["name"].split("[", 1)
    test_node["name"] = "[" + parameterized_section
    first_split = test_case.nodeid.rsplit("::", 1)
    second_split = first_split[0].rsplit(".py", 1)
    class_and_method = second_split[1] + "::"
    parent_id = cached_fsdecode(get_node_path(test_case)) + class_and_method + parent_part
    try:
        function_name = test_case.originalname  # type: ignore
    except AttributeError:
        ERRORS.append(
            f"unable to find original name for {test_case.name} with parameterization detected."
        )
        raise VSCodePytestError(
            "Unable to find original name for parameterized test case"
        ) from None
    function_test_node = function_nodes_dict.get(parent_id)
    if function_test_node is None:
        function_test_node = create_parameterized_function_node(
            function_name, get_node_path(test_case), parent_id
        )
        function_nodes_dict[parent_id] = function_test_node
    if test_node not in function_test_node["children"]:
        function_test_node["children"].append(test_node)
    if isinstance(test_case.parent, pytest.File):
        parent_path = get_node_path(test_case.parent)
        parent_path_key = cached_fsdecode(parent_path)
        parent_test_case = file_nodes_dict.get(parent_path_key)
        if parent_test_case is None:
            parent_test_case = create_file_node(parent_path)
            file_nodes_dict[parent_path_key] = parent_test_case
        if function_test_node not in parent_test_case["children"]:
            parent_test_case["children"].append(function_test_node)
    return function_test_node


def build_test_tree(session: pytest.Session) -> TestNode:
    session_node = create_session_node(session)
    session_children_dict: dict[str, TestNode] = {}
    file_nodes_dict: dict[str, TestNode] = {}
    class_nodes_dict: dict[str, TestNode] = {}
    function_nodes_dict: dict[str, TestNode] = {}

    if SYMLINK_PATH:
        session_node["path"] = SYMLINK_PATH
        session_node["id_"] = os.fspath(SYMLINK_PATH)

    for test_case in session.items:
        test_node = create_test_node(test_case)

        # BIG-DILL: pytest-bdd items with feature_path bypass the Python-file tree and
        # are handled entirely on the TypeScript side using the feature_path/scenario_name
        # fields.  We still need them in the payload so we insert them as children of a
        # stub file node keyed on the feature_path rather than the Python module path.
        if hasattr(test_case, "_bdd_feature_path"):
            # Use feature_path as the "file" key so all scenarios from the same feature
            # file end up under the same parent node.
            feature_path = test_case._bdd_feature_path
            parent_path_key = feature_path
            parent_test_case = file_nodes_dict.get(parent_path_key)
            if parent_test_case is None:
                feature_abs = pathlib.Path(str(session_node["path"])) / feature_path
                parent_test_case = create_file_node(feature_abs)
                # Override name to the feature filename without extension so the
                # TypeScript tree builder can use it as the feature-file leaf label.
                parent_test_case["name"] = pathlib.Path(feature_path).stem
                file_nodes_dict[parent_path_key] = parent_test_case
            parent_test_case["children"].append(test_node)
            continue

        if hasattr(test_case, "callspec"):
            test_node = process_parameterized_test(
                test_case, test_node, function_nodes_dict, file_nodes_dict
            )
        if isinstance(test_case.parent, pytest.Class) or (
            USES_PYTEST_DESCRIBE and isinstance(test_case.parent, DescribeBlock)
        ):
            case_iter = test_case.parent
            node_child_iter = test_node
            test_class_node: TestNode | None = None
            while isinstance(case_iter, pytest.Class) or (
                USES_PYTEST_DESCRIBE and isinstance(case_iter, DescribeBlock)
            ):
                test_class_node = class_nodes_dict.get(case_iter.nodeid)
                if test_class_node is None:
                    test_class_node = create_class_node(case_iter)
                    class_nodes_dict[case_iter.nodeid] = test_class_node
                if node_child_iter not in test_class_node["children"]:
                    test_class_node["children"].append(node_child_iter)
                node_child_iter = test_class_node
                case_iter = case_iter.parent
            if case_iter:
                parent_module = case_iter
            else:
                ERRORS.append(f"Test class {case_iter} has no parent")
                break
            parent_path = get_node_path(parent_module)
            parent_path_key = cached_fsdecode(parent_path)
            test_file_node = file_nodes_dict.get(parent_path_key)
            if test_file_node is None:
                test_file_node = create_file_node(parent_path)
                file_nodes_dict[parent_path_key] = test_file_node
            if test_class_node is not None and test_class_node not in test_file_node["children"]:
                test_file_node["children"].append(test_class_node)
        elif not hasattr(test_case, "callspec"):
            if test_case.parent is None:
                ERRORS.append(f"Test case {test_case.name} has no parent")
                continue
            parent_path = get_node_path(
                cast(
                    "pytest.Session | pytest.Item | pytest.File | pytest.Class | pytest.Module | HasPathOrFspath",
                    test_case.parent,
                )
            )
            parent_path_key = cached_fsdecode(parent_path)
            parent_test_case = file_nodes_dict.get(parent_path_key)
            if parent_test_case is None:
                parent_test_case = create_file_node(parent_path)
                file_nodes_dict[parent_path_key] = parent_test_case
            parent_test_case["children"].append(test_node)

    session_children_dict = construct_nested_folders(
        file_nodes_dict, session_node, session_children_dict
    )
    session_node["children"] = list(session_children_dict.values())
    return session_node


def build_nested_folders(
    file_node: TestNode,
    created_files_folders_dict: dict[str, TestNode],
    session_node: TestNode,
) -> TestNode:
    session_node_path = session_node["path"]
    is_relative = False
    try:
        is_relative = file_node["path"].is_relative_to(session_node_path)
    except AttributeError:
        is_relative = file_node["path"].relative_to(session_node_path)
    if not is_relative:
        raise ValueError("session and file not relative to each other, fixing now....")

    prev_folder_node = file_node
    iterator_path = file_node["path"].parent
    counter = 0
    max_iter = 100
    while iterator_path != session_node_path:
        curr_folder_name = iterator_path.name
        iterator_path_key = cached_fsdecode(iterator_path)
        curr_folder_node = created_files_folders_dict.get(iterator_path_key)
        if curr_folder_node is None:
            curr_folder_node = create_folder_node(curr_folder_name, iterator_path)
            created_files_folders_dict[iterator_path_key] = curr_folder_node
        if prev_folder_node not in curr_folder_node["children"]:
            curr_folder_node["children"].append(prev_folder_node)
        iterator_path = iterator_path.parent
        prev_folder_node = curr_folder_node
        counter += 1
        if counter > max_iter:
            raise ValueError(
                "[vscode-pytest]: Infinite loop in build_nested_folders",
                iterator_path,
                session_node_path,
            )
    return prev_folder_node


def create_test_node(test_case: pytest.Item) -> TestItem:
    test_case_loc: str = (
        str(test_case.location[1] + 1) if (test_case.location[1] is not None) else ""
    )
    absolute_test_id = get_absolute_test_id(test_case.nodeid, get_node_path(test_case))
    node: TestItem = {
        "name": test_case.name,
        "path": get_node_path(test_case),
        "lineno": test_case_loc,
        "type_": "test",
        "id_": absolute_test_id,
        "runID": absolute_test_id,
    }
    # BIG-DILL: attach feature-file metadata for pytest-bdd items
    if hasattr(test_case, "_bdd_feature_path"):
        node["feature_path"] = test_case._bdd_feature_path
        node["scenario_name"] = test_case._bdd_scenario_name
        # Override lineno with the scenario's line in the .feature file so that
        # VS Code places the gutter icon at the Scenario/Scenario Outline keyword,
        # not at the Python test file location (which is what test_case.location gives).
        obj = getattr(test_case, "_obj", None)
        scenario = getattr(obj, "__scenario__", None)
        if scenario is not None:
            if hasattr(scenario, "line_number"):
                node["lineno"] = str(scenario.line_number)
            # Collect scenario-level tags, then union with the matching Examples
            # block tags (if this is a parameterised outline item).
            all_tags: set[str] = set(getattr(scenario, "tags", set()))
            raw_params = getattr(test_case, "callspec", None)
            example_row = raw_params.params.get("_pytest_bdd_example", {}) if raw_params else {}
            if example_row:
                for examples_block in getattr(scenario, "examples", []):
                    param_names = getattr(examples_block, "example_params", [])
                    for row in getattr(examples_block, "examples", []):
                        if dict(zip(param_names, row)) == example_row:
                            all_tags |= set(getattr(examples_block, "tags", set()))
                            break
            if all_tags:
                node["scenario_tags"] = sorted(all_tags)
            feature = getattr(scenario, "feature", None)
            if feature is not None:
                if getattr(feature, "tags", None):
                    node["feature_tags"] = sorted(feature.tags)
                if getattr(feature, "name", None):
                    node["feature_name"] = feature.name
    return node


def create_session_node(session: pytest.Session) -> TestNode:
    node_path = pathlib.Path(PROJECT_ROOT_PATH) if PROJECT_ROOT_PATH else get_node_path(session)
    return {
        "name": node_path.name,
        "path": node_path,
        "type_": "folder",
        "children": [],
        "id_": os.fspath(node_path),
    }


def create_class_node(class_module: pytest.Class) -> TestNode:
    class_line = ""
    try:
        if hasattr(class_module, "obj"):
            import inspect
            _, lineno = inspect.getsourcelines(class_module.obj)
            class_line = str(lineno)
    except (OSError, TypeError):
        pass
    return {
        "name": class_module.name,
        "path": get_node_path(class_module),
        "type_": "class",
        "children": [],
        "id_": get_absolute_test_id(class_module.nodeid, get_node_path(class_module)),
        "lineno": class_line,
    }


def create_parameterized_function_node(
    function_name: str, test_path: pathlib.Path, function_id: str
) -> TestNode:
    return {
        "name": function_name,
        "path": test_path,
        "type_": "function",
        "children": [],
        "id_": function_id,
    }


def create_file_node(calculated_node_path: pathlib.Path) -> TestNode:
    return {
        "name": calculated_node_path.name,
        "path": calculated_node_path,
        "type_": "file",
        "id_": os.fspath(calculated_node_path),
        "children": [],
    }


def create_folder_node(folder_name: str, path_iterator: pathlib.Path) -> TestNode:
    return {
        "name": folder_name,
        "path": path_iterator,
        "type_": "folder",
        "id_": os.fspath(path_iterator),
        "children": [],
    }


class DiscoveryPayloadDict(TypedDict):
    cwd: str
    status: Literal["success", "error"]
    tests: TestNode | None
    error: list[str] | None


class ExecutionPayloadDict(Dict):
    cwd: str
    status: Literal["success", "error"]
    result: TestRunResultDict | None
    not_found: list[str] | None
    error: str | None


class CoveragePayloadDict(Dict):
    coverage: bool
    cwd: str
    result: dict[str, FileCoverageInfo] | None
    error: str | None


def cached_fsdecode(path: pathlib.Path) -> str:
    if path not in _path_to_str_cache:
        _path_to_str_cache[path] = os.fspath(path)
    return _path_to_str_cache[path]


def get_node_path(
    node: pytest.Session
    | pytest.Item
    | pytest.File
    | pytest.Class
    | pytest.Module
    | HasPathOrFspath,
) -> pathlib.Path:
    cache_key = id(node)
    if cache_key in _path_cache:
        return _path_cache[cache_key]

    node_path = getattr(node, "path", None)
    if node_path is None:
        fspath = getattr(node, "fspath", None)
        node_path = pathlib.Path(fspath) if fspath is not None else None

    if not node_path:
        raise VSCodePytestError(
            f"Unable to find path for node: {node}"
        )

    if SYMLINK_PATH and not isinstance(node, pytest.Session):
        try:
            symlink_str: str = str(SYMLINK_PATH)
            node_path_str: str = str(node_path)
            common_path = os.path.commonpath([symlink_str, node_path_str])
            if common_path == os.fsdecode(SYMLINK_PATH):
                result = node_path
            else:
                global _CACHED_CWD
                if _CACHED_CWD is None:
                    _CACHED_CWD = pathlib.Path.cwd()
                rel_path = node_path.relative_to(_CACHED_CWD)
                result = pathlib.Path(SYMLINK_PATH, rel_path)
        except Exception as e:
            raise VSCodePytestError(
                f"Error occurred while calculating symlink equivalent from node path: {e}"
            ) from e
    else:
        result = node_path

    _path_cache[cache_key] = result
    return result


__writer = None


def _close_writer():
    global __writer
    if __writer:
        try:
            __writer.close()
        except Exception:
            pass
        __writer = None


atexit.register(_close_writer)


def _open_pipe(pipe_path: str):
    """Return a file-like object connected to the IPC pipe/socket."""
    import socket as _socket
    import sys as _sys

    if _sys.platform == "win32":
        return open(pipe_path, "wb")  # noqa: SIM115, PTH123

    # On Linux/macOS the extension creates a Unix domain socket.
    sock = _socket.socket(_socket.AF_UNIX, _socket.SOCK_STREAM)
    sock.connect(pipe_path)
    return sock.makefile("wb")


def send_execution_message(
    cwd: str, status: Literal["success", "error"], tests: TestRunResultDict | None
):
    payload: ExecutionPayloadDict = ExecutionPayloadDict(
        cwd=cwd, status=status, result=tests, not_found=None, error=None
    )
    if ERRORS:
        payload["error"] = ERRORS
    send_message(payload)


def send_discovery_message(cwd: str, session_node: TestNode) -> None:
    payload: DiscoveryPayloadDict = {
        "cwd": cwd,
        "status": "success" if not ERRORS else "error",
        "tests": session_node,
        "error": [],
    }
    if ERRORS is not None:
        payload["error"] = ERRORS
    send_message(payload, cls_encoder=PathEncoder)


class PathEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, pathlib.Path):
            return os.fspath(o)
        return super().default(o)


def send_message(
    payload: ExecutionPayloadDict | DiscoveryPayloadDict | CoveragePayloadDict,
    cls_encoder=None,
):
    if not TEST_RUN_PIPE:
        error_msg = (
            "PYTEST ERROR: TEST_RUN_PIPE is not set at the time of pytest starting. "
            f"TEST_RUN_PIPE = {TEST_RUN_PIPE}\n"
        )
        print(error_msg, file=sys.stderr)
        raise VSCodePytestError(error_msg)

    global __writer

    if __writer is None:
        try:
            __writer = _open_pipe(TEST_RUN_PIPE)
        except Exception as error:
            error_msg = f"Error attempting to connect to extension named pipe {TEST_RUN_PIPE}: {error}"
            print(error_msg, file=sys.stderr)
            __writer = None
            raise VSCodePytestError(error_msg) from error

    rpc = {
        "jsonrpc": "2.0",
        "params": payload,
    }
    data = json.dumps(rpc, cls=cls_encoder)
    try:
        if __writer:
            request = (
                f"""content-length: {len(data)}\r\ncontent-type: application/json\r\n\r\n{data}"""
            )
            size = 4096
            encoded = request.encode("utf-8")
            bytes_written = 0
            while bytes_written < len(encoded):
                segment = encoded[bytes_written : bytes_written + size]
                bytes_written += __writer.write(segment)
                __writer.flush()
    except Exception as error:
        print(
            f"Plugin error while sending data: {error}\ndata: {data}",
            file=sys.stderr,
        )
