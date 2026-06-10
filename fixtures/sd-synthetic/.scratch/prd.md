# PRD — Per-caller rate limiting for linksnip

## Problem Statement
A single Caller can currently mint and resolve Links without bound. A misbehaving or
abusive Caller can exhaust service capacity and degrade resolve latency for everyone.

## Solution
Enforce a per-Caller request budget. Each Caller gets a configurable allowance of
requests per rolling window; once exceeded, further requests are rejected with HTTP 429
and a `Retry-After` header until the window refills. Minting and resolving have
independent budgets so that read traffic can be more generous than write traffic.

## User Stories
1. As a service operator, I want each Caller capped at a configurable mint rate, so that one Caller cannot exhaust write capacity.
2. As a service operator, I want a separate, more generous resolve rate, so that read-heavy Callers are not punished like writers.
3. As a Caller, I want a `Retry-After` header on a 429, so that I can back off correctly.
4. As a service operator, I want limits configurable without a code change, so that I can tune them per environment.
5. As a service operator, I want rate-limit decisions to not require a database round-trip, so that they add negligible latency.
6. As a service operator, I want the limiter to be swappable for a shared/distributed backend later, so that multi-instance deployment is possible without rewriting callers.

## Implementation Decisions
- Introduce a `RateLimiter` seam with a `check(callerId, action): Decision` contract; the default adapter is an in-process token bucket.
- The HTTP layer consults the limiter before dispatching to domain logic; domain logic stays unaware of limiting.
- Budgets (`mint`, `resolve`) and window are read from configuration at startup.
- A 429 response carries `Retry-After` in seconds derived from the bucket refill time.

## Testing Decisions
- The token-bucket limiter is unit-tested with an injectable clock (no real time).
- The HTTP layer is tested against a fake `RateLimiter` to assert 429 + `Retry-After` shaping.
- Config parsing is tested for defaults and overrides.
