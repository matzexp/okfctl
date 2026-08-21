---
name: "OKF: Promote"
description: "Move a concept from draft to stable, recording who verified it"
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob
category: "Knowledge"
tags: ["okf", "knowledge", "lifecycle"]
---

Run the `okf-promote` workflow: resolve the concept, read it, establish the verifying
actor, preview, promote with a freshness horizon, and refresh the index.

Argument, if given, is the concept to promote.
