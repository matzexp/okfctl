---
name: "OKF: Deprecate"
description: "Retire a concept and find what still points at it"
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob, Grep
category: "Knowledge"
tags: ["okf", "knowledge", "lifecycle"]
---

Run the `okf-deprecate` workflow: confirm the target and the reason, deprecate, then find
every live concept still linking to the retired one and report them.

Argument, if given, is the concept to deprecate.
