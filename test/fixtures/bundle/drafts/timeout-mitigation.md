---
type: Runbook
title: Mitigate gateway timeout defaults
description: Refined from a dumps-area capture; not yet placed in the corpus.
status: draft
generated: { by: okf-refine/1.0, at: 2026-08-21T10:00:00Z }
sources:
  - id: gateway-timeout
    title: Gateway timeout defaults are per-route
    resource: dumps/gateway-timeout
---

# Mitigate gateway timeout defaults

Set the per-route timeout explicitly rather than relying on the listener default.
