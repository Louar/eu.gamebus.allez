Feature: Focused session planner

  Scenario: Numeric fields show their units inside the input
    Given I open the focused session planner
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
