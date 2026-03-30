"""
Test infrastructure for pytest-bdd-orama plugin tests.

Adds the plugin source to sys.path so that pytester-spawned sessions can import
pytest_bdd_orama without requiring a full editable install.  This mirrors what
`pip install -e .` would do, and keeps CI simple.
"""
import pathlib
import sys

# pytest-plugin/ (parent of this file's directory) must be on sys.path
# so that `pytest_plugins = ["pytest_bdd_orama.hooks"]` works in pytester conftest files.
PLUGIN_DIR = pathlib.Path(__file__).parent.parent
if str(PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(PLUGIN_DIR))
