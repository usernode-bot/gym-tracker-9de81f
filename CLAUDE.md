# Gym Tracker — notes for Claude Code

This app runs on **Usernode Social Vibecoding**. If you're Claude Code
editing this repo, read the platform conventions before making
changes:

**Platform conventions (authoritative, always current):**
https://social-vibecoding.usernodelabs.org/claude.md

Fetch that URL at the start of each session — it's the single source
of truth for platform-wide behavior (auth model, `USERNODE_ENV`,
public/private tables, "don't `git push`", etc.). The hosted copy is
updated in place when platform rules change, so fetching it gives you
today's rules, not a stale snapshot.

When running inside Usernode's dev-chat, those same conventions are
already injected into your system prompt, so the fetch is a no-op in
that path — but it's the right reflex when someone runs Claude Code
against this repo locally or from another harness.

If a rule below this line conflicts with the hosted conventions, the
hosted conventions win. This file is **app-specific** — write down
things about *this* app that belong in the repo: product intent,
data-model quirks, style preferences, opt-in policies (e.g. which
tables you've marked private), etc.

---

## About Gym Tracker

A personal workout log. Users start a timestamped **workout session**,
add **exercises** to it (from their own most-recently-used list, or by
creating a new one), and log **sets** per exercise — either reps ×
weight or time × effort. Exercise entries and individual sets can
carry optional notes. Each exercise card shows a "Last time" panel
(the sets from that exercise's most recent earlier session), and a
client-side count-up rest stopwatch sits at the bottom of the session
view. All workout data is strictly private per user.

## App-specific conventions

- **All four workout tables are `staging:private`**: `exercises`,
  `workout_sessions`, `session_exercises`, `sets`. Every row is
  per-user content; staging gets schema only. Staging demo data is
  seeded idempotently on boot under fake `user_id = 900001` (ids
  900001+), surfaced read-only via `?demo=1` on GET routes.
- **Weight is unit-agnostic** — a bare NUMERIC, displayed as entered.
  No kg/lb column or conversion.
- **Sets are one of two shapes** (`set_type`): `'reps'` populates
  `reps` + `weight`; `'time'` populates `duration_seconds` + optional
  free-text `effort`. The other type's columns are NULL — keep that
  convention when editing.
- **Exercises are per-user** (no shared catalog), deduped
  case-insensitively via a unique index on `(user_id, lower(name))`.
  `POST /api/exercises` is create-or-get, never a duplicate error.
- **Ownership checks join up to `workout_sessions.user_id`** and
  return 404 (not 403) for other users' rows.
- The legacy `presses` table from the scaffold demo is unused — don't
  recreate it, but don't `DROP` it either (prod data is left alone).
- The rest stopwatch is deliberately client-side only (no schema, no
  API) and counts **up**; a countdown timer is future work.
- **JSON import/export** (`GET /api/export`, `POST /api/import`):
  format `gym-tracker-export` version 1 — portable, no DB ids,
  exercises referenced by name. Import is additive and all-or-nothing
  (whole file validated before any write, single transaction);
  duplicate sessions are skipped by exact `started_at` match so
  re-importing an export is idempotent. Imported entry/set
  `created_at` default to the session's `started_at` (not `NOW()`) so
  bulk-importing history doesn't pollute the exercise picker's
  most-recently-used ordering.
