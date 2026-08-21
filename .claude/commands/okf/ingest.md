---
name: "OKF: Ingest"
description: "Capture new knowledge into an OKF bundle as a conformant concept"
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Write, Edit, Glob, Grep
category: "Knowledge"
tags: ["okf", "knowledge", "lifecycle"]
---

Run the `okf-ingest` workflow: match the bundle's existing types and placement, preview
with `okfctl new --dry-run`, create the concept as a draft, write the body by hand, then
verify with `check`, `refs`, and `index`.

Arguments, if given, describe the knowledge to capture.
