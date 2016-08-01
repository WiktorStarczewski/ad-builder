# ad-builder

Usage:

  - General: adBuilder.build([what], options)
  - Build-to-fleet: adBuilder.buildFleet({what}, options)

Examples:

  - adBuilder.build(['swoop'], {iterations: 100})
  - adBuilder.build(['beacon'], {keepResources: 1000000}) guarantees no ship will be queued if queueing it would make your res (of any type) go below 1m - instead withdrawal will be made
  - adBuilder.iterations() shows which iteration you're on currently
  - adBuilder.names() lists all the ships available
  - adBuilder.buildFleet({'glimmer':60, 'swoop': 250, 'blink': 250, 'infinite': 50, 'beacon': 3}, {precision: 7}) - will build UP TO the stated fleet

Roadmap:

  - TBD
