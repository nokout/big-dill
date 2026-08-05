Feature: Lint violation examples
  Each scenario below intentionally triggers one built-in linter rule.
  Open this file in VS Code and check the Problems panel.

  #
  # ^ empty comment above triggers: empty-comment

  Scenario Outline: Duplicate rows
    Given value is <x>
    Examples:
      | x |
      | 1 |
      | 1 |


  Scenario Outline: Duplicate rows
    Given value is <x>
    Examples:
      | id | x |
      | 1  | a |
      | 1  | b |



  Scenario Outline: Oversized table
    Given item <n>
    Examples:
      | n  |
      |  1 |
      |  2 |
      |  3 |
      |  4 |
      |  5 |
      |  6 |
      |  7 |
      |  8 |
      |  9 |
      | 10 |
      | 11 |
      | 12 |
      | 13 |
      | 14 |
      | 15 |
      | 16 |
      | 17 |
      | 18 |
      | 19 |
      | 20 |
      | 21 |

  Scenario Outline: Missing examples block
    Given value is <x>

  Scenario Outline: Empty examples body
    Given value is <x>
    Examples:
      | x |
 
  Scenario Outline: Empty examples body
    Given value is <x>
    Examples:
      | x   |
      | abc |

  Scenario: Interpolation without outline
    Given value is <x>

  # Note: unused-example-column stays quiet here — while an outline has an
  # undefined reference, that error owns the typo; 'x' is re-evaluated once
  # the reference is fixed.
  Scenario Outline: Undefined example column
    Given value is <missing>
    Examples:
      | x |
      | 1 |

  Scenario Outline: Unused example column
    Given value is <a>
    Examples:
      | a | unused |
      | 1 | 2      |

  # The repeated "Duplicate rows" and "Empty examples body" scenarios above
  # also trigger duplicate-scenario-name.
  Scenario Outline: Duplicate examples column
    Given value is <x>
    Examples:
      | x | x |
      | 1 | 2 |

  Scenario: Empty scenario

  Scenario Outline: Single example row
    Given value is <x>
    Examples:
      | x |
      | 1 |

  # The lowercase outline name below triggers the custom Python lint hook
  # (pytest_big_dill_lint_outline in conftest.py). Run: pytest --bdd-lint
  Scenario Outline: lowercase name violates the custom outline rule
    Given value is <x>
    Examples:
      | x |
      | 1 |
