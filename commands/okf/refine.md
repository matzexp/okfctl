---
name: "OKF: Refine"
description: "Turn raw dumps into typed, titled entries in the drafts area"
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob, Grep
category: "Knowledge"
tags: ["okf", "knowledge", "lifecycle"]
---

Run the `okf-refine` workflow: read the dumps inbox, decide type/title and whether each
dump is one entry, several (split), or overlaps another (consolidate), then write each with
`okfctl refine`, citing its source(s) rather than claiming first-hand authorship. Default to
confirming each entry before writing; run fully automatically only if asked to.

Arguments, if given, narrow which dumps to refine.
