---
name: "OKF: Triage"
description: "Report an OKF bundle's health and what needs attention (read-only)"
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read
category: "Knowledge"
tags: ["okf", "knowledge", "lifecycle", "read-only"]
---

Run the `okf-triage` workflow: establish the bundle root, read `okfctl status`, `check`,
and `refs`, and report health grouped by the action each finding calls for. Read-only —
recommend the next workflow, do not run it.

Argument, if given, is the bundle root.
