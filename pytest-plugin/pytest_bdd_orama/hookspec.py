import pytest


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
