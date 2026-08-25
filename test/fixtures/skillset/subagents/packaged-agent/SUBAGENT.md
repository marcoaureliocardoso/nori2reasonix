---
name: packaged-agent
tools: Read, Grep, Glob, Bash
maxTurns: 12
model: inherit
skills:
  - brainstorming
  - root-cause-analysis
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: "{{skills_dir}}/command-driven-operations/scripts/command-guard-launcher.sh"
          args:
            - pre
          timeout: 7
  PreCompact:
    - hooks:
        - type: command
          command: "{{skills_dir}}/context-continuity/scripts/compact-hook-launcher.sh"
          args:
            - pre
          timeout: 5
---

You are a packaged agent.
