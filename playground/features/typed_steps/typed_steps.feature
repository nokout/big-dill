Feature: Typed step parameters
  Demonstrates StepEnum-typed parameters. In VS Code, typing a state offers a
  pick-list of valid values, hover shows the type, and --bdd-lint flags any
  value that is not a member of the AustralianState enum.

  The text written here is the enum VALUE (e.g. "Victoria") — that is what the
  completion pick-list inserts and what the step matches at runtime.

  Scenario: Visit a valid state capital
    Given the capital of New South Wales is visited

  Scenario: Visit several valid state capitals
    Given the capital of Victoria is visited
    And the capital of Queensland is visited
    And the capital of Tasmania is visited
