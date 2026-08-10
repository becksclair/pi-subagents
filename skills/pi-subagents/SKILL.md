---
name: pi-subagents
description: Delegate focused work to Pi child agents. Use for second opinions, codebase scouting, implementation handoffs, review, parallel independent tasks, or background work that benefits from a separate child context.
---

# Pi Subagents

Use the `subagent` tool when a separate child agent materially improves the work. Keep the parent session in control of scope, user decisions, and final synthesis.

## Core rules

- Delegate a concrete job, not the whole conversation.
- Prefer one child when one role is enough.
- Use parallel children only for genuinely independent angles or tasks.
- Use `context: "fresh"` when independent judgment matters; use `context: "fork"` when the child needs parent-session history.
- Ordinary children must not recursively orchestrate more children. Nested fanout is only for agents explicitly configured with the `subagent` tool and remains depth-bounded.
- Do not invent agent names. Use `action: "list"` when available agents are unknown or may be project-specific.
- Do not create/update/delete project agents or chains unless the user actually requested that mutation.
- Starting or using the extension must not create project `.pi` state merely for configuration.

## Built-in roles

- `delegate`: lightweight general child
- `scout`: local codebase reconnaissance
- `researcher`: external/docs research
- `planner`: implementation planning
- `worker`: implementation
- `reviewer`: code review and small fixes
- `context-builder`: deeper context/handoff assembly
- `oracle`: high-context second opinion and drift check

Built-ins normally inherit the parent model. Per-run and persistent overrides may change model, thinking, tools, skills, or context behavior.

## Single child

```text
subagent({
  agent: "reviewer",
  task: "Review the current diff for correctness and regressions. Return only actionable findings with file references.",
  context: "fresh"
})
```

For an inherited second opinion:

```text
subagent({
  agent: "oracle",
  task: "Challenge the current plan and identify any decision drift or hidden assumptions.",
  context: "fork"
})
```

## Parallel children

Use distinct tasks and avoid concurrent writes to the same files.

```text
subagent({
  context: "fresh",
  tasks: [
    { agent: "reviewer", task: "Review correctness and regressions." },
    { agent: "reviewer", task: "Review tests and edge cases." }
  ],
  concurrency: 2
})
```

For implementation, prefer one writer and parallel read-only reviewers rather than multiple writers fighting over one worktree.

## Background execution

Use `async: true` for work that should not block the parent session:

```text
subagent({
  agent: "worker",
  task: "Implement the approved change, run focused validation, and report changed files and remaining risks.",
  async: true
})
```

Do not busy-poll. Continue useful parent work and inspect status when needed.

## Status and control

```text
subagent({ action: "status", id: "<run-id>" })
subagent({ action: "interrupt", id: "<run-id>" })
subagent({ action: "resume", id: "<run-id>", message: "Continue with this clarification." })
```

`interrupt` is for genuinely blocked or misdirected work, not routine impatience.

Use `action: "doctor"` for a read-only runtime/setup diagnostic.

## Chains

Chains are available when ordered handoffs are genuinely useful. Keep them small and understandable.

```text
subagent({
  chain: [
    { agent: "scout", task: "Map the relevant code and risks." },
    { agent: "planner", task: "Turn this evidence into an implementation plan: {previous}" }
  ],
  context: "fresh"
})
```

Use `{previous}` for simple handoff text. Use named outputs or structured output only when a later step truly needs machine-readable data. Do not build elaborate workflow graphs when two explicit calls are clearer.

## Agent management

Discovery is read-only. User/project agent creation is opt-in and explicit.

Useful actions:

```text
subagent({ action: "list" })
subagent({ action: "get", agent: "reviewer" })
```

Only when requested:

```text
subagent({
  action: "create",
  config: {
    name: "security-reviewer",
    scope: "project",
    description: "Focused security reviewer",
    systemPrompt: "Inspect security-sensitive code and return evidence-backed findings."
  }
})
```

Project mutations may create `.pi/agents` or `.pi/chains`. That is expected only for the explicit management action itself, never as extension startup bookkeeping.

## Prompt quality

Give children compact contracts containing:

- the concrete goal
- relevant files, plans, or evidence
- true hard constraints
- how to validate
- the expected result shape
- when to stop or escalate

Avoid narrating every mechanical step. Let the specialist choose an efficient path inside the boundaries you actually care about.
