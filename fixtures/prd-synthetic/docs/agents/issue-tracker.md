# Issue tracker

This repo uses a **local-markdown** issue tracker. Do **not** call `gh` or any
external service.

- Issues live as markdown files under `.scratch/issues/`, one file per issue,
  named `NNN-slug.md` where `NNN` is a zero-padded number.
- A PRD lives at `.scratch/prd.md`.
- "Publishing" an issue means writing/updating its markdown file under
  `.scratch/issues/`.
- "Applying a label" means adding a `labels:` line to the issue file's frontmatter.
