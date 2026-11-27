Feature: Focused session planner

  Scenario Outline: Random workouts draw unique exercises before allowing nonadjacent repeats
    Given I request a random circuit of <steps> steps for two rounds
    Then the planner shows <steps> steps drawing from the whole catalog before repeating

    Examples:
      | steps |
      | 16    |
      | 17    |
      | 25    |

  Scenario: Random workouts reject more than 25 steps
    Given I request a random circuit of 26 steps for two rounds
    Then the planner warns that the workout link is invalid

  Scenario: The bare planner starts with a predictable circuit
    Given I open the focused session planner
    Then the planner lists squat, plank and jumping-jack for one round with 15 seconds of rest

  Scenario: Exercise picker preserves groups and supports keyboard search
    Given I open the focused session planner
    Then I can search the ordered exercise categories and choose a result with the keyboard

  Scenario: Exercise picker searches localized labels
    Given I open the focused session planner
    When I switch setup to Dutch
    Then I can search the Dutch exercise picker for opdrukken

  Scenario: A steps-only URL recipe uses the default rounds and rest
    Given I open a planner URL prescribing only 2 random exercises
    Then the planner offers two distinct exercises for one round with 15 seconds of rest

  Scenario: Numeric fields show their units inside the input
    Given I open a planner with repetitions, a hold, a break and an interval
    Then planner inputs show time and repetition suffixes

  Scenario: Mobile keeps the start action visible
    Given I open the focused session planner
    Then the mobile start action stays visible while scrolling the planner

  Scenario: The homepage keeps the essentials without studio chrome
    Given I open the focused session planner
    Then only the planner and language controls are shown

  Scenario: Keyboard reordering survives starting a workout
    Given I open the focused session planner
    When I move the first planner step down with the keyboard
    Then starting the workout preserves the reordered steps

  Scenario: Drag handles reorder steps on a narrow screen
    Given I open the focused session planner
    When I drag the first planner step below the second on a narrow screen
    Then starting the workout preserves the reordered steps
