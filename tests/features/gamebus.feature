Feature: Launch and record workouts from GameBus

  Scenario: An embedded page overrides a link with a random workout
    Given a GameBus page opens a conflicting Allez link with random workout settings
    Then setup offers 3 distinct exercises for 2 rounds without rest
    When I enter practice in the embed
    Then the practice link preserves the generated circuit and GameBus preferences

  Scenario: A random task workout does not need input collections
    Given a GameBus task supplies a random workout definition without input collections
    Then setup offers 3 distinct exercises for 2 rounds without rest

  Scenario: A task without configuration still uses collection settings
    Given a GameBus task has null configuration and supplies collection settings
    Then setup offers 3 distinct exercises for 2 rounds without rest

  Scenario: A task definition overrides collection settings and is included in every activity write
    Given a GameBus task opens a conflicting Allez link with two timed exercises
    When I enter practice in the embed
    Then GameBus has received no workout activity
    When I start the embedded workout
    Then GameBus receives an incomplete activity with no steps
    When I complete both timed exercises before GameBus acknowledges the create
    Then GameBus receives each completed step on the acknowledged activity
    And the final activity marks the round and workout complete
