@offline
Feature: Prepared workouts work without a network connection

  Scenario: The install manifest and real icons respect the production base
    Given a fresh PWA visitor using "movenet"
    Then the install manifest and icons are local and installable

  Scenario Outline: Each prepared provider really runs after an offline cold navigation
    Given a fresh PWA visitor using "<model>"
    When I prepare the selected provider for offline use
    Then offline preparation reports complete assets and progress
    When I disconnect and open a previously unseen workout link
    Then the unseen workout survives an offline reload
    And the real "<model>" detector infers locally while offline
    And a previously unseen root workout query can start offline

    Examples:
      | model     |
      | mediapipe |
      | movenet   |

  Scenario Outline: Changing the selected provider preserves readiness across reloads
    Given a fresh PWA visitor using "<initial>"
    When I change the selected provider to "<model>"
    And I prepare the selected provider for offline use
    Then the selected provider remains ready after online and offline reloads

    Examples:
      | initial   | model     |
      | mediapipe | movenet   |
      | movenet   | mediapipe |

  Scenario Outline: The production preview supports offline preparation
    Given a fresh preview PWA visitor using "<model>"
    When I prepare the selected provider for offline use
    Then offline preparation reports complete assets and progress
    And the selected provider remains ready after online and offline reloads

    Examples:
      | model     |
      | mediapipe |
      | movenet   |

  Scenario: An interrupted model download cannot advertise readiness
    Given a fresh PWA visitor using "movenet"
    When a model shard download is interrupted during preparation
    Then the incomplete provider is not ready offline
    When I retry preparation with the network restored
    Then offline preparation reports complete assets and progress

  Scenario: Evicted model data revokes readiness and can be downloaded again
    Given a fresh PWA visitor using "movenet"
    When I prepare the selected provider for offline use
    Then offline preparation reports complete assets and progress
    When a cached model shard is evicted and I disconnect
    Then the evicted provider loses its offline readiness
    When I retry preparation with the network restored
    Then offline preparation reports complete assets and progress
    And only the evicted shard was downloaded on retry

  Scenario: A changed catalog digest cannot reuse the old shard at the same URL
    Given a fresh PWA visitor using "movenet"
    When I prepare the selected provider for offline use
    And the catalog changes the expected hash of one shard
    Then the unchanged server response fails integrity verification
    When the server supplies the changed shard
    Then only that verified shard is replaced and served offline

  Scenario: Insufficient storage offers Retry without claiming readiness
    Given a fresh PWA visitor using "movenet"
    When storage capacity is exhausted during preparation
    Then the storage failure keeps readiness incomplete and offers Retry
    When storage capacity is restored and I retry
    Then offline preparation reports complete assets and progress

  Scenario Outline: Unprepared models are explained in the selected language
    Given a fresh PWA visitor using "movenet"
    When I disconnect without preparing a provider in "<language>"
    Then the offline options explain the uncached model in "<language>"

    Examples:
      | language |
      | en       |
      | nl       |

  Scenario Outline: An uncached selection offers the already prepared provider
    Given a fresh PWA visitor using "movenet"
    When I prepare the selected provider for offline use
    And I select an uncached provider offline in "<language>"
    Then the cached alternative is explained in "<language>"

    Examples:
      | language |
      | en       |
      | nl       |

  Scenario: An installed update waits instead of replacing an active workout
    Given a fresh update PWA visitor using "movenet"
    When I prepare the selected provider for offline use
    Then offline preparation reports complete assets and progress
    When an old document stays open with a legacy cached model asset
    When a new service worker is installed during an active workout
    Then the update waits without reloading or replacing the active worker
    And the workout finishes with its original repetition count and timer
    When I finish reviewing and explicitly apply the update
    Then the new build controls the page without claiming old models are ready
    When I prepare the selected provider for offline use
    Then offline preparation reports complete assets and progress
    And the UI-only update downloaded no model data
    And the old document can still read its original model asset offline
    When I disconnect and open a previously unseen workout link
    Then the real "movenet" detector infers locally while offline
