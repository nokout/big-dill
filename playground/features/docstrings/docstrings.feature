Feature: Docstring data blocks
  Demonstrates JSON and YAML docstring arguments in step definitions.
  The triple-quote block is passed to the step as a typed data payload.

  Scenario: Configure service from JSON
    Given the service is configured with the following JSON:
      """json
      {
        "host": "localhost",
        "port": 8080,
        "retries": 3,
        "tls": false
      }
      """
    When the service starts
    Then the service is running

  Scenario: Load dataset from YAML
    Given the pipeline is seeded with the following YAML:
      """yaml
      dataset: sales_2024
      filters:
        region: APAC
        currency: AUD
      columns:
        - revenue
        - units_sold
      """
    When the pipeline runs
    Then the pipeline completes successfully
