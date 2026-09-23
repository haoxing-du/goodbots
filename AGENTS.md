# Working in this repo

- **Commit and push after each change.** When a requested change is done and
  typechecks (`npm run typecheck`), commit it with a descriptive message and
  push to `origin main`. One commit per change; don't batch unrelated work.
- Local dev: `npx convex dev` + `npx vite`. See `SETUP.md`.
- `design/` holds local design mockups and is git-ignored; don't commit it.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
