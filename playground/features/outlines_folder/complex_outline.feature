@thingsandjunk
Feature: Complex outline id

  Scenario Outline: Process complex data for my stuff
    Given a record with id <id>
    When processed with <input_a>, <input_b>, <input_c>
    Then result is <expected>
    Then result is 
    Given the capital of state is visited

    @alpha_examples
    Examples:
      | id  | input_a | input_b | input_c | expected |
      | E01 | alpha   | 100     | true    | success  |

    @other_examples
    Examples:
      | id  | input_a | input_b | input_c | expected |
      | E02 | beta    | 200     | false   | failure  |
      | E03 | gamma   | 300     | true    | success  |
