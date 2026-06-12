Feature: Backtick docstring data blocks
  Demonstrates triple-backtick (```) docstrings with embedded syntax
  highlighting. JSON, YAML, and Python content each get their language's
  colouring inside the fence. Compare with docstrings.feature, which uses
  the triple-quote (""") delimiter.

  Scenario: Configure service from backtick JSON
    Given the service is configured with the following JSON:
      ```json
      {
        "host": "localhost",
        "port": 8080,
        "retries": 3,
        "tls": false
      }
      ```
    When the service starts
    Then the service is running

  Scenario: Load dataset from backtick YAML
    Given the pipeline is seeded with the following YAML:
      ```yaml
      dataset: sales_2024
      filters:
        region: APAC
        currency: AUD
      columns:
        - revenue
        - units_sold
      ```
    When the pipeline runs
    Then the pipeline completes successfully

  Scenario: Provide a Python transformation
    Given the transformation script is provided as:
      ```python
      def transform(row):
          return {k: v.upper() for k, v in row.items()}
      ```
    When the pipeline runs
    Then the pipeline completes successfully
