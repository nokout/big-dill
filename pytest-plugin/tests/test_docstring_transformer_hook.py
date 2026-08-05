"""Integration tests for the pytest_big_dill_transform_docstring hookspec."""


def test_hookspec_is_registered(pytester):
    """The hookspec must be importable and present on BigDillHookSpec."""
    pytester.makepyfile(test_hookspec_present="""
from pytest_big_dill.hookspec import BigDillHookSpec

def test_hookspec_present():
    spec = BigDillHookSpec()
    assert hasattr(spec, 'pytest_big_dill_transform_docstring')
""")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)


def test_transform_docstring_hookspec_has_firstresult():
    """The hookspec must be marked firstresult=True."""
    from pytest_big_dill.hookspec import BigDillHookSpec
    spec_method = BigDillHookSpec.pytest_big_dill_transform_docstring
    # pluggy stores hookspec options in a 'pytest_spec' dict on the function
    pytest_spec = getattr(spec_method, 'pytest_spec', {})
    assert pytest_spec.get('firstresult') is True
    assert pytest_spec.get('historic', False) is False


def test_transform_docstring_hook_returns_none_by_default(pytester):
    """No registered transformer means the hook returns None."""
    # pytest_big_dill is auto-loaded via the pytest11 entry point — do NOT add
    # pytest_plugins here as that would double-register and cause a hookspec conflict.
    pytester.makepyfile(test_hook="""\
def test_default_returns_none(pytestconfig):
    result = pytestconfig.hook.pytest_big_dill_transform_docstring(
        docstring="key: value",
        media_type="yaml",
    )
    assert result is None
""")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)


def test_registered_transformer_is_called(pytester):
    """A registered transformer plugin receives the docstring and media_type."""
    # pytest_big_dill is auto-loaded via the pytest11 entry point.
    pytester.makepyfile(conftest="""\
import pytest

_calls = []

class RecordingTransformer:
    @pytest.hookimpl
    def pytest_big_dill_transform_docstring(self, docstring, media_type):
        _calls.append((docstring, media_type))
        return None

def pytest_configure(config):
    config.pluginmanager.register(RecordingTransformer(), "recording_transformer")
""")
    pytester.makepyfile(test_called="""\
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import conftest as _c

def test_transformer_called(pytestconfig):
    pytestconfig.hook.pytest_big_dill_transform_docstring(
        docstring="hello: world",
        media_type="yaml",
    )
    assert len(_c._calls) == 1
    assert _c._calls[0] == ("hello: world", "yaml")
""")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)


def test_transformer_return_value_replaces_docstring(pytester):
    """Returning a non-None value from the hook replaces the raw docstring."""
    # pytest_big_dill is auto-loaded via the pytest11 entry point.
    pytester.makepyfile(conftest="""\
import pytest

class DictTransformer:
    @pytest.hookimpl
    def pytest_big_dill_transform_docstring(self, docstring, media_type):
        if media_type == "json":
            import json
            return json.loads(docstring)
        return None

def pytest_configure(config):
    config.pluginmanager.register(DictTransformer(), "dict_transformer")
""")
    pytester.makepyfile(test_replace="""\
def test_returns_parsed_value(pytestconfig):
    result = pytestconfig.hook.pytest_big_dill_transform_docstring(
        docstring='{"key": 42}',
        media_type="json",
    )
    assert result == {"key": 42}
""")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)


def test_transformer_media_type_none_is_passed(pytester):
    """media_type=None is correctly forwarded to the transformer."""
    # pytest_big_dill is auto-loaded via the pytest11 entry point.
    pytester.makepyfile(conftest="""\
import pytest

_received_media_type = []

class NullMediaTransformer:
    @pytest.hookimpl
    def pytest_big_dill_transform_docstring(self, docstring, media_type):
        _received_media_type.append(media_type)
        return None

def pytest_configure(config):
    config.pluginmanager.register(NullMediaTransformer(), "null_media")
""")
    pytester.makepyfile(test_none="""\
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import conftest as _c

def test_none_media_type(pytestconfig):
    pytestconfig.hook.pytest_big_dill_transform_docstring(
        docstring="plain text",
        media_type=None,
    )
    assert _c._received_media_type == [None]
""")
    result = pytester.runpytest("-v")
    result.assert_outcomes(passed=1)
