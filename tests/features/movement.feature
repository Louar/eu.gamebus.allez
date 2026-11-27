Feature: Credit only observed, prescribed movement

  Scenario: Excellent plank form is highlighted live and in the summary
    Given my circuit prescribes 5 seconds of "plank"
    When I start the workout after practice
    Then the form quality indicator includes "Not scored"
    When I hold "plank" for 2 seconds
    Then the form quality indicator includes "Excellent form"
    When 5 seconds pass
    Then I see the summary with 1 result
    And the form quality indicator includes "Excellent form"

  Scenario Outline: Reduced-motion guidance leaves the live counter unobstructed
    Given my screen is <width> by <height> and I prefer reduced motion
    And my circuit prescribes 3 reps of "squat"
    When I start the workout after practice
    Then I can see the squat key poses without obscuring my counter

    Examples:
      | width | height |
      |   390 |    844 |
      |   844 |    390 |

  Scenario Outline: A complete cycle earns exactly one repetition
    Given my circuit prescribes 3 reps of "<exercise>"
    When I start the workout after practice
    And I perform 1 cycle of "<exercise>"
    Then the counter reads "1 / 3"

    Examples:
      | exercise       |
      | squat          |
      | jumping-jack   |
      | front-jack     |
      | push-up        |
      | sit-up         |
      | burpee         |
      | bicycle-crunch |
      | heel-tap       |
      | forward-lunge  |
      | reverse-lunge  |
      | glute-bridge   |
      | pogo-jump      |
      | squat-jump     |
      | dead-bug       |

  Scenario Outline: A similar movement does not earn the prescribed rep
    Given my circuit prescribes 3 reps of "<prescribed>"
    When I start the workout after practice
    And I perform 2 cycles of "<different>"
    Then the counter reads "0 / 3"

    Examples:
      | prescribed    | different      |
      | forward-lunge | reverse-lunge  |
      | reverse-lunge | forward-lunge  |
      | squat-jump    | pogo-jump      |
      | dead-bug      | bicycle-crunch |

  Scenario Outline: A verified hold must be uninterrupted
    Given my circuit prescribes 3 seconds held in "<exercise>"
    When I start the workout after practice
    And I hold "<exercise>" for 2 seconds
    Then the counter reads "1 / 3"
    When the camera loses my pose
    Then I see feedback "Tracking lost"
    And the counter reads "0 / 3"
    When I hold "<exercise>" for 4 seconds
    Then I see the summary with 1 result

    Examples:
      | exercise   |
      | plank      |
      | squat-hold |

  Scenario: Jumping-jacks and a stationary squat do not count as squats
    Given my circuit prescribes 10 reps of "squat"
    When I start the workout after practice
    And I perform 3 cycles of "jumping-jack"
    Then the counter reads "0 / 10"
    And I see feedback "Waiting for a squat"
    When I hold "squat-hold" for 2 seconds
    Then the counter reads "0 / 10"

  Scenario: Lateral jumping-jacks do not count as front-jacks
    Given my circuit prescribes 10 reps of "front-jack"
    When I start the workout after practice
    And I perform 3 cycles of "jumping-jack"
    Then the counter reads "0 / 10"

  Scenario Outline: Incomplete burpees earn nothing
    Given my circuit prescribes 3 reps of "burpee"
    When I start the workout after practice
    And I do a burpee without the "<phase>"
    Then the counter reads "0 / 3"

    Examples:
      | phase   |
      | push-up |
      | jump    |

  Scenario: Occlusion invalidates a half-finished rep
    Given my circuit prescribes 3 reps of "squat"
    When I start the workout after practice
    And I start a squat without returning to standing
    And the camera loses my pose
    Then I see feedback "Tracking lost"
    When I return to standing
    Then the counter reads "0 / 3"
