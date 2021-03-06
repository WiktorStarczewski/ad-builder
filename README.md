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
  - adBuilder.updateFleet({'glimmer':80, 'swoop': 400, 'blink': 600, 'infinite': 50, 'beacon': 3}, {precision: 7}) - will update an existing fleet build job with new target ships

Roadmap:

  - before withdrawing, check if theres a trade up covering (at least partially) that amount, if so, trade and then withdraw the remainder
