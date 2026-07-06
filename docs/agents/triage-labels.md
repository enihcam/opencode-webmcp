# Triage Labels

The five canonical triage roles and their GitHub label strings:

| Role | Label | Purpose |
|---|---|---|
| Needs evaluation | `needs-triage` | New issues land here. Maintainer needs to evaluate and route. |
| Needs info | `needs-info` | Waiting on reporter to provide missing information. |
| Ready for agent | `ready-for-agent` | Fully specified, AFK-ready. An agent can pick this up with no human context. |
| Ready for human | `ready-for-human` | Needs human judgement or implementation. |
| Won't fix | `wontfix` | Out of scope, declined, or will not be actioned. |

## State machine

```
[new issue] → needs-triage
                   ↓
          ┌─── needs-info ←── (re-opened)
          ↓
   ready-for-agent  →  (agent picks up)
   ready-for-human  →  (human picks up)
   wontfix          →  (closed, out-of-scope.md)
```

## Adding new labels

Create them via `gh`:

```bash
gh label create "needs-triage" --color "#e4e669" --description "Needs maintainer evaluation"
gh label create "needs-info" --color "#fbca04" --description "Waiting on reporter"
gh label create "ready-for-agent" --color "#0e8a16" --description "Fully specified, AI-ready"
gh label create "ready-for-human" --color "#0052cc" --description "Needs human judgement"
gh label create "wontfix" --color "#ffffff" --description "Will not be actioned"
```
