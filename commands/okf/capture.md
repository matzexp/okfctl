---
name: "OKF: Capture"
description: "Capture what this session established into an OKF bundle's dumps area"
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob, Grep
category: "Knowledge"
tags: ["okf", "knowledge", "lifecycle"]
---

Run the `okf-capture` workflow: decide whether this session produced durable knowledge,
and if it did, summarize it and write it into the dumps area with `okfctl capture`,
recording yourself as the producer. If it did not, say so in one line and stop.

Arguments, if given, name what to capture.
