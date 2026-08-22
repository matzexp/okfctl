---
type: Note
title: Retry budgets are shared across a service
description: Captured from a session; placement undecided.
status: draft
generated: { by: claude-code/2.1, at: 2026-02-03T16:40:00Z }
---

# Retry budgets are shared across a service

A retry budget is scoped to the caller service, so a noisy client can exhaust
it for every other caller.
