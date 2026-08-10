# pi-subagents

A focused Pi extension for child-agent delegation, with a compact cockpit footer.

This fork deliberately does **not** try to be a workflow framework. It keeps the useful subagent runtime from `pi-subagents` v0.26, carries the local runtime fixes we rely on, and adds the small UI surface we liked from `pi-flows`.

## What it provides

- `subagent` tool for single child runs
- top-level parallel child runs
- foreground and background execution
- fresh or forked parent context
- nested fanout with a bounded depth
- per-agent model, thinking, skills, tools, and fallback models
- status, interrupt, and resume controls
- optional worktree isolation
- structured/file output support
- custom user/project agents and saved chains
- compact foreground/background TUI rendering
- cockpit footer with:
  - provider and model
  - Git branch
  - files changed in the current parent session
  - insertion/deletion counts
  - context-window usage
  - live `SUB N` indicator while children are active

Example footer:

```text
openai-codex · GPT-5.6 Luna │ ⎇ main │ 3 files +84 -12 │ ▓▓░░░░░░░░ 19.3% │ SUB 2
```

## What it intentionally does not provide

- flow YAML
- flow authoring/edit mode
- flow dashboards or workflow registries
- flow code nodes
- autonomous flow mode
- packaged workflow prompt shortcuts
- project-local skill materialization
- startup-time project mutation

In particular, merely starting Pi with this extension must **not** create `.pi`, `.agents`, skills, settings, or any other files in the working tree.

Runtime state belongs in Pi-owned/session/temp locations. Project-local files are written only when the user explicitly requests a mutating project action such as creating or updating a project agent/chain, or when a delegated worker is explicitly asked to edit the project.

## Install locally

The intended Asgard setup is a Pi local package:

```bash
pi install /home/bex/projects/pi-subagents
```

Pi reads the package manifest directly. No installer script, cloned extension directory, or generated project skill is required.

## Basic use

Ask naturally:

```text
Use reviewer to inspect this diff.
```

```text
Ask oracle for a second opinion on this plan.
```

```text
Run two fresh reviewers in parallel, one for correctness and one for tests.
```

```text
Have worker do this in the background.
```

Or call the tool directly:

```text
subagent({ agent: "delegate", task: "Investigate this failure and report back." })
```

Parallel:

```text
subagent({
  context: "fresh",
  tasks: [
    { agent: "reviewer", task: "Review correctness and regressions." },
    { agent: "reviewer", task: "Review tests and missing edge cases." }
  ],
  concurrency: 2
})
```

Background:

```text
subagent({
  agent: "worker",
  task: "Implement the approved change and validate it.",
  async: true
})
```

Inspect or control a run:

```text
subagent({ action: "status", id: "<run-id>" })
subagent({ action: "interrupt", id: "<run-id>" })
subagent({ action: "resume", id: "<run-id>", message: "Continue with this clarification." })
```

## Built-in agents

| Agent | Job |
| --- | --- |
| `delegate` | lightweight general child |
| `scout` | local codebase reconnaissance |
| `researcher` | external/docs research |
| `planner` | implementation planning |
| `worker` | implementation |
| `reviewer` | review and small fixes |
| `context-builder` | deeper handoff/context assembly |
| `oracle` | high-context second opinion |

Built-ins inherit the parent model unless overridden. `planner`, `worker`, and `oracle` default to forked context when a launch does not explicitly choose a context mode.

## Custom agents

User agents live under:

```text
~/.pi/agent/agents/
```

Project agents are discovered from existing project configuration under:

```text
.pi/agents/
.agents/
```

Runtime knobs belong in the Pi user settings under `subagents.runtime`. For example:

```json
{
  "subagents": {
    "runtime": {
      "childTimeoutMs": 360000,
      "maxSubagentDepth": 2
    }
  }
}
```

The legacy `~/.pi/agent/extensions/subagent/config.json` is still read as a fallback so an old installation can be migrated without silently losing settings. The extension never creates either file on startup.

Project settings may override built-ins without copying their files:

```json
{
  "subagents": {
    "agentOverrides": {
      "reviewer": {
        "model": "openai-codex/gpt-5.6-luna",
        "thinking": "high"
      }
    }
  }
}
```

Creating/updating/deleting project agents or chains through the `subagent` management actions is an **explicit mutation** and may create the corresponding project `.pi` directory. Discovery and ordinary execution do not.

## Runtime hygiene

The extension has a hard design rule:

> Loading or using the delegation runtime must not mutate the parent project merely to configure itself.

Important consequences:

- the packaged `pi-subagents` skill stays inside this package
- no `session_start` handler materializes resources into the cwd
- async bookkeeping is stored under Pi/temp runtime locations
- child session files are stored under Pi session/runtime locations
- a stray ancestor `.pi` outside a Git project cannot redirect project-agent writes from an unrelated cwd
- legacy ancestor `.agents` remains supported as an explicit non-Git project marker

## Development

This branch is based on upstream `pi-subagents` v0.26.0 rather than current upstream because later releases grew a much broader orchestration/runtime surface that is outside this fork's purpose.

Local fixes retained from the previous Asgard installation:

- dynamic fanout pairing is enforced at runtime rather than through provider-hostile schema shapes
- machine-local `config.json` is ignored
- `~/.agents` discovery is non-recursive at the user root
- child wall-clock timeouts are supported

Additional fork changes include Pi 0.84 compatibility, the cockpit footer, project-root hygiene fixes, and removal of bundled workflow prompt shortcuts.

Validation:

```bash
npm run typecheck
npm run test:all
npm pack --dry-run
```

The integration suite launches real child-process fixtures and exercises foreground/background execution, nested fanout, context forking, worktrees, cancellation, result watching, TUI rendering, and related runtime paths.

## Provenance

Based on [`pi-subagents` v0.26.0](https://github.com/nicobailon/pi-subagents) by Nico Bailon. The upstream package declares the MIT license. This fork carries local changes and is marked private to avoid accidental publication under the upstream npm package name.
