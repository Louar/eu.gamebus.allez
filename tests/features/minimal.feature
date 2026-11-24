Feature: Portable minimal workout paths on a static Pages site

  Scenario: A planner prescription survives sharing and starting
    Given I edit the minimal planner to prescribe 17 squats
    When I copy the minimal workout link and start from the planner
    Then the workout URL contains the edited prescription and settings
    When I reload the shared workout path
    Then I can preview 17 squats before enabling the camera

  Scenario: A deep link opens and reloads at its original non-file URL
    Given I open a minimal timed squat link as a new visitor
    Then I can preview the timed squat before enabling the camera
    When I reload the shared workout path
    Then I can preview the timed squat before enabling the camera

  Scenario: An omitted prescription generates a shareable workout
    Given I open minimal workouts without a prescription
    Then I get a shareable circuit with three exercises
    When I reload the shared workout path
    Then the generated circuit remains available for practice

  Scenario: A malformed prescription does not silently start a random workout
    Given I visit a minimal workout path with invalid encoding
    Then I can return from the link error to the minimal planner

  Scenario Outline: A timed exercise fills the screen with readable controls
    Given my screen is <width> by <height> and I prefer reduced motion
    And I open a minimal timed squat link as a new visitor
    When I enable the workout camera and start the countdown
    Then the immersive timed workout HUD fits the viewport

    Examples:
      | width | height |
      | 390   | 844    |
      | 844   | 390    |

  Scenario: Sound can be changed during a workout
    Given I open a minimal timed squat link as a new visitor
    When I enable the workout camera and start the countdown
    Then I can toggle workout sound without interrupting the exercise

  Scenario: Pages returns its error document instead of rewriting missing paths to 200
    Then a missing static asset returns the Pages 404 document
