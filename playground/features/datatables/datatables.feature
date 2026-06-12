@featureone
Feature: Datatable examples
  Demonstrates step-level datatables. Unquoted values, quoted strings, and numerics
  should each appear with distinct colors when the extension is active.

  @thisone
  Scenario: Configure system from table
    Given the system is configured with
      | key     | value   |
      | timeout | "30s"   |
      | retries | 3       |
      | mode    | "batch" |

  Scenario: Validate multiple records
    Given the following records exist
      | id | name    | active |
      | 1  | "Alice" | true   |
      | 2  | "Bob"   | false  |
