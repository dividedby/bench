---
title: Token-bucket RateLimiter adapter with injectable clock
labels: ready-for-agent
---

Provide the default in-process `RateLimiter` adapter as a token bucket. It must support
independent `mint` and `resolve` budgets over a rolling window and expose a refill time
so callers can compute `Retry-After`. Must accept an injectable clock for tests.
