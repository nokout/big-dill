# pytest-plugin/tests/test_lint_types.py
from pytest_bdd_orama.lint_types import LintDiagnostic, InterpolatedScenario, InterpolatedStep


def test_lint_diagnostic_defaults():
    d = LintDiagnostic(message="bad value")
    assert d.severity == "error"
    assert d.line is None


def test_lint_diagnostic_custom_fields():
    d = LintDiagnostic(message="watch out", severity="warning", line=10)
    assert d.severity == "warning"
    assert d.line == 10


def test_interpolated_step_defaults():
    step = InterpolatedStep(keyword="Given", text="I have NSW apples")
    assert step.keyword == "Given"
    assert step.text == "I have NSW apples"
    assert step.line_number is None


def test_interpolated_scenario_fields():
    steps = [InterpolatedStep(keyword="Given", text="state is NSW")]
    s = InterpolatedScenario(name="Test", steps=steps, tags=["smoke"], line_number=5)
    assert s.name == "Test"
    assert len(s.steps) == 1
    assert s.tags == ["smoke"]
    assert s.line_number == 5


def test_lint_hookspecs_registered(pytestconfig):
    """The plugin registers the lint hookspecs without errors."""
    pm = pytestconfig.pluginmanager
    assert pm.has_plugin("pytest-bdd-orama"), "pytest-bdd-orama plugin not loaded"
    hook = pm.hook
    assert hasattr(hook, "pytest_bdd_orama_lint_scenario"), \
        "pytest_bdd_orama_lint_scenario hookspec missing"
    assert hasattr(hook, "pytest_bdd_orama_lint_outline"), \
        "pytest_bdd_orama_lint_outline hookspec missing"
