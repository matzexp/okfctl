---
type: Note
title: Gateway timeout defaults are per-route
description: Captured from a session; placement undecided.
status: draft
generated: { by: claude-code/2.1, at: 2026-08-20T09:14:00Z }
sources:
  - id: origin
    title: ~/work/payments-api
    resource: git@example.com:acme/payments-api.git@8f2c1a9
---

# Gateway timeout defaults are per-route

The edge gateway applies its timeout per route, not per listener. Raising the
listener timeout does nothing on its own.
