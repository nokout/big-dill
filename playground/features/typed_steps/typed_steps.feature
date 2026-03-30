Feature: Typed step parameters
  Demonstrates StepEnum-typed parameters — VS Code completions and
  --bdd-lint validation will use the AustralianState type metadata.

  Scenario: Visit a valid state capital
    Given the capital of NSW is visited

  Scenario: Visit another valid state
    Given the capital of Victoria is visited
