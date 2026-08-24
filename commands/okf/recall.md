---
name: "OKF: Recall"
description: "Search an OKF bundle's knowledge base for what it already knows"
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob, Grep
category: "Knowledge"
tags: ["okf", "knowledge", "lifecycle"]
---

Run the `okf-recall` workflow: search the registered knowledge base with `okfctl search`,
and read each result's area and trust tier before acting on it — a stable, human-reviewed
corpus hit is citable as fact; a dumps- or drafts-area hit, or one marked unverified, is a
lead to check, not a fact to repeat.

Arguments, if given, name what to search for.
