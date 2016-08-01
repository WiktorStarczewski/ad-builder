# ad-builder

Usage:

  - General: adBuilder.build([what], options)

Examples:

  - adBuilder.build(['swoop'], {iterations: 100})
  - adBuilder.build(['beacon'], {keepResources: 1000000}) guarantees no ship will be queued if queueing it would make your res (of any type) go below 1m - instead withdrawal will be made
  - adBuilder.iterations() shows which iteration you're on currently
  - adBuilder.names() lists all the ships available
