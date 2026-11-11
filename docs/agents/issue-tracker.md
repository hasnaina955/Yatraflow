# Issue tracker

**GitHub Issues** in `hasnaina955/Yatraflow`, driven with the `gh` CLI.

- Remote: `https://github.com/hasnaina955/Yatraflow.git`
- Create: `gh issue create --title "..." --body "..." --label "priority: P2"`
- List: `gh issue list --state open --limit 500`
- View: `gh issue view <n> --json title,body,labels,comments`

**PRs are not a request surface.** External PRs do not enter the triage
queue. Flip `prsAsRequests: true` below if that ever changes.

```yaml
tracker: github
repo: hasnaina955/Yatraflow
cli: gh
prsAsRequests: false
```

## Repo conventions that override skill defaults

- Every open issue carries exactly **one** `priority: P0`–`P3` label
  (see `AGENTS.md` §6). Triage state labels sit alongside it, never a
  second priority label.
- A diagnosis posted on an issue is an invitation — claim the work in the
  same breath (`AGENTS.md` §2.4).
- A PR merged into `test` closes the issues its body names with a closing
  keyword. A PR merged into `main` closes them through GitHub's own keywords.
  Close an issue by hand only when the workflow does not close it (`AGENTS.md` §12).