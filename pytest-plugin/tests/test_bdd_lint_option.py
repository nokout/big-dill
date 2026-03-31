import textwrap


def test_bdd_lint_passes_valid_feature_file(testdir):
    testdir.makefile(".feature", states="""
Feature: States
  Scenario: Valid state
    Given the state is NSW
""")
    testdir.makepyfile(conftest=textwrap.dedent("""
        from pytest_bdd import given
        from pytest_bdd_orama.step_types import StepEnum

        class AustralianState(StepEnum):
            NSW = "NSW"
            VIC = "Victoria"

        @given("the state is {state:AustralianState}")
        def step(state): pass
    """))
    result = testdir.runpytest("--bdd-lint", "-v")
    assert result.ret == 0


def test_bdd_lint_fails_on_invalid_parameter(testdir):
    testdir.makefile(".feature", states="""
Feature: States
  Scenario: Invalid state
    Given the state is Narnia
""")
    testdir.makepyfile(conftest=textwrap.dedent("""
        from pytest_bdd import given
        from pytest_bdd_orama.step_types import StepEnum

        class AustralianState(StepEnum):
            NSW = "NSW"

        @given("the state is {state:AustralianState}")
        def step(state): pass
    """))
    result = testdir.runpytest("--bdd-lint")
    assert result.ret != 0
    result.stdout.fnmatch_lines(["*Narnia*"])


def test_bdd_lint_scenario_hook_fires(testdir):
    testdir.makefile(".feature", checks="""
Feature: Hook test
  Scenario: Too many steps
    Given step 1
    And step 2
    And step 3
""")
    testdir.makepyfile(conftest=textwrap.dedent("""
        from pytest_bdd import given
        from pytest_bdd_orama.lint_types import LintDiagnostic

        @given("step 1")
        def s1(): pass
        @given("step 2")
        def s2(): pass
        @given("step 3")
        def s3(): pass

        def pytest_bdd_orama_lint_scenario(scenario):
            if len(scenario.steps) > 2:
                return [LintDiagnostic(message="Too many steps")]
            return []
    """))
    result = testdir.runpytest("--bdd-lint")
    assert result.ret != 0
    result.stdout.fnmatch_lines(["*Too many steps*"])


def test_bdd_lint_outline_hook_fires_for_duplicates(testdir):
    testdir.makefile(".feature", outlines="""
Feature: Outline linting
  Scenario Outline: State check
    Given the state is <state>
    Examples:
      | state |
      | NSW   |
      | NSW   |
""")
    testdir.makepyfile(conftest=textwrap.dedent("""
        from pytest_bdd import given
        from pytest_bdd_orama.lint_types import LintDiagnostic

        @given("the state is {state}")
        def step(state): pass

        def pytest_bdd_orama_lint_outline(scenario, examples):
            all_rows = [tuple(r.values()) for block in examples for r in block.rows]
            if len(all_rows) != len(set(all_rows)):
                return [LintDiagnostic(message="Duplicate example rows detected")]
            return []
    """))
    result = testdir.runpytest("--bdd-lint")
    assert result.ret != 0
    result.stdout.fnmatch_lines(["*Duplicate example rows*"])
