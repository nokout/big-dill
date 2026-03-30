"""
Auto-discover all feature files under playground/features/.

pytest-bdd's scenarios() collects every .feature file under the given path
(relative to this file's directory) and generates a test function for each
scenario.  Step definitions are resolved from conftest.py.
"""
from pytest_bdd import scenarios

scenarios("../features")
