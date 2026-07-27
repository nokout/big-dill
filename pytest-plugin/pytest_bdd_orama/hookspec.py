import pytest

from .lint_types import LintDiagnostic


class BddOramaHookSpec:
    @pytest.hookspec(firstresult=True)
    def pytest_bdd_orama_test_name(
        self,
        scenario_name: str,
        example_params: dict,
        feature_name: str,
        feature_path: str,
    ) -> "str | None":
        """Return a custom display name for the test item, or None to use the default.

        Args:
            scenario_name:  Original scenario/outline name from the .feature file.
            example_params: Dict of example row values (empty for non-outline scenarios).
            feature_name:   Feature title as written in the .feature file.
            feature_path:   Path to the .feature file, relative to the pytest rootdir.

        Returns:
            A string to use as the test label in the VSCode test tree, or None to keep
            the default name (scenario_name, or the full parameterised name for outlines).
        """

    @pytest.hookspec(firstresult=True)
    def pytest_bdd_orama_custom_status(
        self,
        report: object,
        config: object,
    ) -> "str | None":
        """Return a custom status string for a test report, or None to use the default outcome.

        Called after each test phase. Inspect report.longrepr, report.when, etc. to decide
        whether to assign a custom status string (e.g. "waiting", "knownError").

        Args:
            report: The pytest TestReport for the completed test phase.
            config: The pytest Config object.

        Returns:
            A status string that the extension will look up in outcomeMapping, or None to
            leave the outcome unchanged.
        """

    @pytest.hookspec
    def pytest_bdd_orama_lint_scenario(
        self,
        scenario,
    ) -> "list[LintDiagnostic]":
        """Lint a single scenario and return diagnostics.

        Called for every plain ``Scenario``, and also for each interpolated row
        of a ``Scenario Outline`` (after placeholder substitution).

        Args:
            scenario: A pytest-bdd ``ScenarioTemplate`` (for plain scenarios) or an
                      ``InterpolatedScenario`` (for each outline row).  Both expose:
                      - ``scenario.name``        -- scenario display name
                      - ``scenario.steps``       -- list of steps, each with ``.keyword`` and ``.text``
                      - ``scenario.tags``        -- list of tag strings (no ``@`` prefix)
                      - ``scenario.line_number`` -- line in the .feature file

        Returns:
            A list of LintDiagnostic objects (return an empty list for no issues).
        """

    @pytest.hookspec
    def pytest_bdd_orama_lint_outline(
        self,
        scenario,
        examples,
    ) -> "list[LintDiagnostic]":
        """Lint a Scenario Outline including its full examples table.

        Called once per ``Scenario Outline``, before the per-row lint_scenario
        calls.  Use this for checks requiring the full table: duplicate rows,
        oversized example sets, cross-row constraints, etc.

        Args:
            scenario:  The pytest-bdd ``ScenarioTemplate`` object.
            examples:  List of pytest-bdd ``Examples`` objects, each with
                       ``rows`` (list of dicts mapping column name → value)
                       and ``line_number``.

        Returns:
            A list of LintDiagnostic objects (return an empty list for no issues).
        """

    @pytest.hookspec(firstresult=True)
    def pytest_bdd_orama_transform_docstring(
        self,
        docstring: str,
        media_type: "str | None",
    ) -> "object | None":
        """Transform a step docstring argument before it reaches the step function.

        Called when a step receives a Gherkin docstring argument. Return a non-None
        value to replace the raw string with a parsed Python object.

        Args:
            docstring:  The raw docstring content as a string.
            media_type: Optional content type identifier from the Gherkin source, or None.

        Returns:
            A non-None Python object to use in place of the raw string, or None to
            leave the docstring unchanged.
        """
