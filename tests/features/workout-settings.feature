Feature: Workout settings

  Scenario: Sound is controlled from settings before and during practice
    Given a workout with two available cameras
    Then I can enable sound in the preview settings
    When I enter practice with the selected settings
    Then I can toggle sound from the live settings

  Scenario: Changing models preserves workout progress
    Given a workout with two available cameras
    Then I can select a camera and model from the preview settings
    When I enter practice with the selected settings
    Then changing the model pauses the workout without discarding progress

  Scenario: Camera and model can be selected before and during practice
    Given a workout with two available cameras
    Then I can select a camera and model from the preview settings
    When I enter practice with the selected settings
    Then I can change settings without leaving practice

  Scenario: Settings remain usable on a narrow screen
    Given my screen is 320 by 640 and I prefer reduced motion
    And a workout with two available cameras
    Then I can select a camera and model from the preview settings
    When I enter practice with the selected settings
    Then I can change settings without leaving practice
