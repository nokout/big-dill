@auth
Feature: Sign-in flow
  Demonstrates Background, Rule, And/But step keywords, feature/scenario tags,
  and a parameterised step. Hover over any step to see its docstring summary
  and tags; press F12 to jump to the Python implementation.

  Background:
    Given the application is installed

  Rule: Registered users can sign in

    @happy-path
    Scenario: Registered user reaches the dashboard
      Given a registered user named Alice
      When they sign in
      Then they see the dashboard
      And a welcome banner is shown
      But no error is displayed

    @smoke
    Scenario: A second user signs in cleanly
      Given a registered user named Bob
      When they sign in
      Then they see the dashboard
