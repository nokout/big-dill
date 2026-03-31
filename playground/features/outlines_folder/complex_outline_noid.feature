Feature: Complex outline

  Scenario Outline: Process complex data
    When processed with <input_a>, <input_b>, <input_c>
    Then result is <expected>

    Examples:
      | input_a | input_b | input_c | expected |
      | alpha   | 100     | true    | success  |
      | beta    | 200     | false   | failure  |
      | gamma   | 300     | true    | success  |

  Scenario: things and stuff
