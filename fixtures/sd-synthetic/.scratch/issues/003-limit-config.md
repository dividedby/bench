---
title: Rate-limit configuration (budgets + window) read at startup
labels: ready-for-agent
---

Read `mint` budget, `resolve` budget, and window length from configuration at startup,
with sensible defaults and per-environment overrides. No code change should be required
to retune limits.
