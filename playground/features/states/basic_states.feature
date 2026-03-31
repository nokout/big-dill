Feature: Basic test states
  
  @passes
  Scenario: A passing scenario
    Given a step that passes
  @fails
  Scenario: A failing scenario
    Given a step that fails
    
  @skipped
  Scenario: A skipped scenario
    Given a step that is skipped
 
  @waits
  Scenario: A waiting scenario
    Given a step that is waiting
    

  @bad
  Scenario: Something bad happens
    Given a step that causes something bad
  
  @knownError
  Scenario: A known error scenario
    Given a step that raises a known error
