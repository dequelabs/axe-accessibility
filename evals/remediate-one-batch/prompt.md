---
description: Every issue from one scan goes to remediate in a single batched call, each instance separately.
max_turns: 20
allowed_tools: [Read, Glob, Grep, Skill]
---

Scan http://localhost:3000/checkout for accessibility issues and get Axe's fix guidance for every issue it finds. Don't edit any files; just tell me what to change.
