---
type: Metric
title: Gross margin
description: Gross profit as a share of revenue.
status: stable
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-08-10T12:00:00Z }
verified:
  - { by: process:finance-nightly, at: 2026-05-01T02:00:00Z }
stale_after: 2026-07-01
sources:
  - id: margin-policy
    resource: https://wiki.acme/finance/gross-margin
    title: Gross margin policy
---

# Definition

Gross profit divided by revenue.[^margin-polcy]

The label above was renamed in frontmatter and not in the body, which is the join
break `okfctl refs` exists to catch.

[^margin-polcy]: Gross margin policy
