---
title: HTTP layer consults RateLimiter and shapes 429 + Retry-After
labels: ready-for-agent
---

Before dispatching mint/resolve handlers, the HTTP layer asks the `RateLimiter` for a
decision keyed by Caller and action. On denial it returns HTTP 429 with a `Retry-After`
header in seconds. Domain logic must remain unaware of limiting.
