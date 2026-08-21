---
name: "OKF: Review"
description: "Work the stale and drifted backlog, recording what each review found"
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Edit, Glob, Grep, WebFetch
category: "Knowledge"
tags: ["okf", "knowledge", "lifecycle"]
---

Run the `okf-review` workflow: build the backlog from `okfctl status --stale --drifted`,
check each concept against its sources, preview the batch, then record `--confirm`,
`--outdated`, or neither where the concept cannot be verified.

Argument, if given, narrows the backlog to a concept or directory.
