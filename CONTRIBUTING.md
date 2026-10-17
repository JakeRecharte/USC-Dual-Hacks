# Contributing

How Claude works in this repo. One rule: **every change gets its own branch, and the
branch merges into `main` when the feature is done.**

## The loop

Whenever you're asked to change something:

**1. Branch off `main` before the first edit.**

    git switch main && git pull
    git switch -c feat/routine-scoring

Naming: `feat/`, `fix/`, `docs/` or `chore/` + a short kebab-case topic.
`feat/transfer-to-human`, `fix/stale-timestamp`, `docs/data-contract`.

**2. Commit to the branch as you go.** One commit per coherent step, tests in the same
commit. Run `npm test` in `server/` first.

Message: one line, present tense, what the change achieves. No trailing period.

    Route stale cleared records to the priority queue
    Docs: pin the log_call payload

End the message with the attribution trailer the harness gives for the session's model.

**3. Merge when the feature is complete.**

    git switch main && git pull
    git merge feat/routine-scoring
    git push
    git branch -d feat/routine-scoring

A merge commit, not a squash. If `main` moved while you worked, merge it into the branch
first and resolve the conflicts there, not on `main`.

## Limits

- Push and merge only when asked. Commit freely on your own branch.
- Never `push --force`, `reset --hard`, or rebase/amend anything already pushed.
- Never commit `.env`, API keys or real phone numbers.
