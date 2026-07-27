Feature: Integration fixture

  Scenario: A plain scenario
    Given a step that passes

  Scenario Outline: References a column that does not exist
    Given value is <missing>
    Examples:
      | present |
      | 1       |
