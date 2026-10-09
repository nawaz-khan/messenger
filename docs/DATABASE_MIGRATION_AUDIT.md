# DATABASE MIGRATION AUDIT

**Project:** campus-messenger
**Audit type:** Read-only migration-state audit performed **before** deploying to the NEW remote Supabase project
**Audit date:** 2026-09-29
**Target remote project ref:** `wvcfihmgbofypwfxdkry` (from `.env.local`)

> Constraints honored: no `supabase db push`, no `supabase db reset`, no `supabase migration repair`, and no other destructive/state-changing command was executed. No migration, config, or application file was modified, and no table was created. The only file written is this audit document. Phase 8 was not implemented.

## 0. Evidence collected (commands run)

| # | Check | Method | Result |
|---|-------|--------|--------|
| 1 | Version control | `git status` / `git diff` / `git log` | **Not a git repository** → no diff/history available |
| 2 | `supabase/` contents | recursive listing | `.temp/`, `config.toml`, `migrations/` (no `seed.sql`) |
| 3 | `supabase/config.toml` | direct read | Present — default `supabase init` template |
| 4 | CLI on `PATH` | `Get-Command supabase` | Not found |
| 5 | CLI via npx | `npx --no-install supabase --version` | **2.118.0** |
| 6 | CLI logged in? | `~/.supabase/access-token` | **Absent → not logged in** (only `traces/`, `telemetry.json`) |
| 7 | Linked project? | `supabase/.temp/project-ref` | **Absent → not linked** (only `cli-latest`) |
| 8 | Docker / local DB | `docker version` | **Docker not installed → no local Supabase stack exists** |
| 9 | Migrations | directory listing + byte sizes | 6 files, **all non-empty** |

`package.json` was inspected: it contains **no** Supabase CLI dependency or migration scripts (`dev`, `build`, `start`, `lint` only). The CLI is invoked ad hoc via `npx`.

---

## A. Migration inventory

Directory `supabase/migrations/` contains **6 files**, in this exact chronological (lexicographic timestamp) order:

| # | Filename | Size | Empty? |
|---|----------|------|--------|
| 1 | `20260927213000_create_profiles.sql` | 1709 B | Non-empty |
| 2 | `20260928001700_create_conversations_and_messages.sql` | 5412 B | Non-empty |
| 3 | `20260928001701_phase_4_fixes.sql` | 3778 B | Non-empty |
| 4 | `20260928010000_enable_realtime.sql` | 846 B | Non-empty |
| 5 | `20260928020000_create_message_media.sql` | 1690 B | Non-empty |
| 6 | `20260928030000_create_notifications_and_search.sql` | 2216 B | Non-empty |

**No migration file is empty** (verified by byte size).

### A.1 — `20260927213000_create_profiles.sql`
- **Tables:** `public.profiles` (id PK → `auth.users` CASCADE, `username` UNIQUE, `username_normalized` GENERATED STORED UNIQUE, `display_name`, `avatar_url`, `course`, `semester`, `batch`, `bio`, `created_at`, `updated_at`; CHECK length 3–20; CHECK format `^[a-zA-Z0-9_]+$`)
- **Functions:** `public.handle_updated_at()`
- **RLS:** enabled; SELECT (public), INSERT own (`auth.uid() = id`), UPDATE own (`auth.uid() = id`)
- **Indexes:** `idx_profiles_username_normalized`
- **Triggers:** `update_profiles_updated_at` (BEFORE UPDATE)
- **Realtime:** none

### A.2 — `20260928001700_create_conversations_and_messages.sql`
- **Tables:** `public.conversations`, `public.conversation_members`, `public.messages`
  - `conversations`: `type` CHECK(direct|group), `direct_participant_hash` UNIQUE + type-consistency CHECK, `created_by` FK
  - `conversation_members`: PK(conversation_id,user_id), `role` CHECK(owner|moderator|member), `last_read_message_id` FK → messages SET NULL
  - `messages`: `reply_to` self-FK, `edited_at`, `deleted_at`, `deleted_by`, content CHECK
- **Functions:** `public.get_or_create_direct_conversation(uuid)` — `SECURITY DEFINER` (not yet `search_path`-hardened)
- **RLS:** enabled on all three; policies — conversations SELECT (membership sub-query), conversation_members SELECT, messages SELECT, messages INSERT (sender + membership), messages UPDATE (sender only)
- **Indexes:** `idx_conversation_members_user_id`, `idx_messages_conversation_id_created_at` (DESC)
- **Triggers:** `update_conversations_updated_at`, `update_messages_updated_at`
- **Realtime:** none

### A.3 — `20260928001701_phase_4_fixes.sql`
- **Tables:** none created. **Alters** `messages`: `sender_id` DROP NOT NULL; FK re-created `ON DELETE SET NULL`; adds `messages_content_length_check` (`<= 5000`)
- **Functions:** creates `public.is_member_of(uuid)` (`SECURITY DEFINER SET search_path = public`); re-creates `get_or_create_direct_conversation` with `SET search_path = public`
- **RLS:** DROPs + re-CREATEs 4 policies to use `is_member_of` (conversations/conversation_members/messages SELECT, messages INSERT now allowing `sender_id IS NULL`); ADDs `"Users can update their conversations"` UPDATE policy
- **Indexes:** none
- **Triggers:** none
- **Realtime:** none

### A.4 — `20260928010000_enable_realtime.sql`
- **Tables:** none
- **Functions:** none
- **RLS:** none
- **Indexes:** none
- **Triggers:** none
- **Realtime:** adds `public.messages` and `public.conversations` to the `supabase_realtime` publication, guarded by `IF NOT EXISTS` (idempotent `DO` block) — this is the Phase 5 realtime enablement

### A.5 — `20260928020000_create_message_media.sql`
- **Tables:** `public.message_media` (PK, `message_id`/`uploader_id`/`conversation_id` FKs CASCADE, `drive_file_id`, `media_type` CHECK(IMAGE|GIF|VIDEO), `mime_type`, `original_filename`, `file_size`, `preview_drive_file_id`, `status` CHECK default `UPLOADED`)
- **Functions:** none
- **RLS:** enabled; SELECT (`is_member_of(conversation_id)`), INSERT (`uploader_id = auth.uid() AND is_member_of(...)`)
- **Indexes:** none
- **Triggers:** none
- **Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE public.message_media;` → **not** wrapped in an idempotency guard (unlike A.4/A.6)
- **Also alters** `messages`: adds `has_media boolean NOT NULL DEFAULT false`; DROPs + re-CREATEs `messages_content_check` to permit media-only messages

### A.6 — `20260928030000_create_notifications_and_search.sql`
- **Tables:** `public.notifications` (`user_id` FK CASCADE, `type` CHECK(`new_message`), `reference_id` uuid, `read_at`, `created_at`)
- **Functions:** `public.handle_new_message_notification()` — `SECURITY DEFINER`; fans out one notification per non-sender conversation member
- **RLS:** enabled; SELECT / UPDATE / DELETE bound to `auth.uid() = user_id`; **no INSERT policy** (clients cannot insert notifications)
- **Indexes:** `idx_notifications_user_id_read_at`; `idx_profiles_username_search` on `profiles(username_normalized text_pattern_ops)` (Phase 7 prefix search)
- **Triggers:** `on_new_message_created` (AFTER INSERT ON `messages`)
- **Realtime:** adds `public.notifications` to `supabase_realtime` (idempotent `DO` block)

---

## B. Migration dependency / order analysis

Execution order is determined by lexical filename sort, which here equals timestamp order:

```
1. 20260927213000_create_profiles.sql
2. 20260928001700_create_conversations_and_messages.sql
3. 20260928001701_phase_4_fixes.sql
4. 20260928010000_enable_realtime.sql
5. 20260928020000_create_message_media.sql
6. 20260928030000_create_notifications_and_search.sql
```

| Migration | Depends on | Why | Order OK? |
|-----------|-----------|-----|-----------|
| 1 profiles | — | root table | ✅ |
| 2 conversations/messages | 1 | FKs `→ profiles` | ✅ |
| 3 phase_4_fixes | 2 | alters `messages`, drops/re-adds `messages_sender_id_fkey` (a name auto-created by migration 2); re-creates `get_or_create_direct_conversation` | ✅ |
| 4 enable_realtime | 2 | `messages`, `conversations` must exist | ✅ |
| 5 message_media | 2, 3 | `messages` exists; uses `is_member_of` (created in 3) | ✅ |
| 6 notifications/search | 1, 2, 3 | `profiles`, `messages`, `conversation_members`; trigger after INSERT on `messages` | ✅ |

**Notes:**
- Lexical ordering of the two closely-spaced timestamps is correct: `...001700` → `...001701` → `...0010000`. The `phase_4_fixes` file therefore lands **after** the base schema and **before** the realtime file — matching the documented Phase 4-fix intent ("corrective migration on top of the initial deployment").
- Unlike many Supabase projects, **there is no baseline/`init` migration and no drop of the earlier duplicate** — the removed empty file was never deployed (see section C).
- No migration references an object created later than itself. **No ordering or dependency defects found.**
- `message_media` has **no index** on `conversation_id` or `message_id` despite RLS policies filtering on `conversation_id`, and `notifications` has no index on `reference_id`. These are performance observations only (documented in section D), not correctness blockers.

---

## C. Unexpected changes / discrepancies

### C.1 — Is `20260928001700_create_conversations_and_messages.sql` required, or was it supposed to be removed?

**Verdict: it is REQUIRED. It must NOT be removed.** The "supposed to be removed" instruction refers to a **different, differently-named file**.

Evidence from the project's own documentation:

| Document | Statement |
|----------|-----------|
| `docs/PHASE_4_AUDIT.md` (F-6) | "`20260927185211_create_conversations_and_messages.sql` successfully removed." |
| `docs/PHASE_4_FIXES.md` (F-6) | "Successfully removed the empty **0-byte** migration file (`20260927185211_create_conversations_and_messages.sql`)." |
| `docs/PHASE_4_IMPLEMENTATION.md` | "Created the following tables in **`20260928001700_create_conversations_and_messages.sql`**." |

Interpretation:
- The file documented as removed was `20260927185211_...` — an **empty 0-byte duplicate** from an earlier attempt. It is **not present** in `supabase/migrations/` today.
- The file on disk, `20260928001700_create_conversations_and_messages.sql`, is the **real Phase 4 schema migration** (5412 bytes) that creates `conversations`, `conversation_members`, and `messages`. Removing it would destroy every downstream dependency (migrations 3–6 and the whole messaging feature).

**Conclusion:** This is a naming/timestamp collision between two *different* files, not a leftover duplicate. Nothing that should have been deleted is still present. Migration #2 stays.

### C.2 — What changed in `20260928030000_create_notifications_and_search.sql` vs. the intended Phase 7 implementation?

Compared against `docs/PHASE_7_IMPLEMENTATION.md`:

| Aspect | Documented Phase 7 intent | As implemented | Drift |
|--------|---------------------------|----------------|-------|
| `notifications` columns | id, user_id FK, type, reference_id, read_at, created_at | identical | **None** |
| `type` CHECK | `IN ('new_message')` | identical | **None** |
| Indexes | `(user_id, read_at)` for unread counts | `idx_notifications_user_id_read_at` | **None** |
| Username search index | `profiles(username_normalized text_pattern_ops)` | `idx_profiles_username_search` — identical | **None** |
| Trigger fn | `handle_new_message_notification`, `SECURITY DEFINER`, notify other members, exclude sender | identical (iterates `conversation_members WHERE user_id != NEW.sender_id`) | **None** |
| RLS | no INSERT policy; SELECT/UPDATE/DELETE bound to `auth.uid() = user_id` | identical | **None** |
| Realtime | `notifications` added to `supabase_realtime` | added, inside an idempotent `IF NOT EXISTS` `DO` block | Cosmetic only |

**Non-behavioral differences (the only deltas found):**
1. **Inline comments / section headers** (`-- conversation_id or similar`, section titles) — no schema effect.
2. **Idempotent publication add:** the realtime `ALTER PUBLICATION` is guarded by `IF NOT EXISTS`, unlike the unguarded equivalent in migration #5. Identical behavior on a clean DB.
3. **Trigger timestamp semantics:** the trigger inserts `created_at = NEW.created_at` (the message's timestamp) rather than `now()`. These are equal in practice because `messages.created_at` defaults to `now()`, so all notifications for a message share that message's timestamp. Minor nuance, not a defect, and not contradicted by the Phase 7 doc.
4. **Scope bundling:** the filename folds two Phase 7 deliverables (notifications **and** prefix search) into one migration — consistent with the Phase 7 document, which covers both.

**Conclusion:** The migration **faithfully implements** the documented Phase 7 design. **No schema or behavioral drift** beyond the idempotency guard and comment text.

### C.3 — Other environment/infrastructure observations (not migration defects)

| Observation | Detail | Impact |
|-------------|--------|--------|
| Not a git repository | `git status`/`git diff`/`git log` all fail; no history, no diff to inspect | **No rollback/audit baseline via git.** Consider `git init` + a commit before pushing. |
| `supabase/config.toml` is newly present | Pristine `supabase init` default template (`project_id = "campus-messenger"`); it was absent at the previous audit checkpoint | Harmless; required for link/push. No project-specific auth/URL settings — fine, since only migrations are deployed. |
| `[db.seed] sql_paths = ["./seed.sql"]` but `supabase/seed.sql` is missing | Config references a non-existent seed file | **Not** a `db push` concern (seed runs only on `db reset`/`db seed`). Would break `db reset`; currently moot (no local DB/Docker). |
| `.temp/cli-latest` present | Marker written by CLI execution (e.g. `supabase init`) | Informational. |
| Migration #5 realtime add is not idempotent | Plain `ALTER PUBLICATION ... ADD TABLE` (others are guarded) | Zero impact on a fresh remote; the CLI never re-runs an applied migration. |
| Migration timestamps are in the future (2026-09) | Matches the project's audit date/environment | Not an issue; only ordering matters, and it is correct. |

### C.4 — File modification timestamps (evidence of what changed, in lieu of git history)

Because there is no git repository, filesystem modification times are the only change evidence available:

| Migration file | Last modified | Note |
|----------------|---------------|------|
| `20260927213000_create_profiles.sql` | 27-09-2026 21:30 | Phase 2 |
| `20260928001700_create_conversations_and_messages.sql` | 28-09-2026 00:17 | Phase 4 base |
| `20260928001701_phase_4_fixes.sql` | 28-09-2026 00:50 | Phase 4 fixes |
| `20260928010000_enable_realtime.sql` | 28-09-2026 01:03 | Phase 5 |
| `20260928020000_create_message_media.sql` | 28-09-2026 01:52 | Phase 6 |
| `20260928030000_create_notifications_and_search.sql` | **29-09-2026 10:40** | Phase 7 — written/edited **most recently**, after all others |

Only migration #6 was touched on the audit day. This is consistent with it being the newest phase's deliverable and with the §C.2 comparison showing it still matches the documented Phase 7 intent. No other file changed after its phase's completion.

---

## D. Local vs. remote migration state

### D.1 — Did `npx supabase migration up` affect anything?

**Answer: NEITHER the local database NOR the remote database.**

Evidence:

1. **`supabase migration up` is a LOCAL-only operation by design.** It applies pending migrations to the local Postgres started by `supabase start`; remote deployment is done exclusively by `supabase db push` on a linked project. It therefore cannot write to the remote.
2. **Local:** Docker is **not installed** (`docker` is not recognized as a command), so `supabase start` cannot run and **no local Supabase database exists** to target. The command would fail on the missing local stack.
3. **Remote:** `supabase/.temp/project-ref` **is absent** → project is **not linked**; `~/.supabase/access-token` **is absent** → CLI is **not authenticated**. A remote operation is impossible.
4. Corroboration: the remote project was probed read-only and returns **`404 PGRST205 — Could not find the table 'public.profiles'`** — the remote has **zero** application tables.

**Net effect: no database anywhere has these migrations applied yet.**

### D.2 — Current local migration ledger
- **Local DB:** does not exist — no `supabase start` has succeeded (no Docker), no local Postgres container, no local `supabase_migrations.schema_migrations` table.
- **Local applied count: 0 of 6.**

### D.3 — Current remote migration ledger
- **Target:** `wvcfihmgbofypwfxdkry` (`https://wvcfihmgbofypwfxdkry.supabase.co`), reachable (`/auth/v1/health` → `200`), **not linked** to this repo.
- **Application tables on remote: none** (`profiles` → `PGRST205`).
- **Remote applied count: 0 of 6.** The remote is a blank slate.

### D.4 — Drift summary

| Location | Tables | Applied migrations | Drift |
|----------|--------|--------------------|-------|
| Local | none | 0 / 6 | n/a (no local DB exists) |
| Remote (`wvcfihmgbofypwfxdkry`) | none | 0 / 6 | none vs. an empty baseline |
| Repository | 6 migration files, all non-empty | — | source of truth |

**There is no drift, because neither database has been materialized.** A `db push` will apply all six migrations, in order, to a clean project — the lowest-risk scenario.

---

## E. Remote project currently linked

**No remote project is currently linked to this repository.**

- `supabase/.temp/project-ref` → **absent** (`supabase/.temp/` contains only `cli-latest`).
- The CLI is also **not authenticated** (`~/.supabase/access-token` absent), so `supabase link` will require `supabase login` first.
- The intended target, per `.env.local`, is:

```
project ref : wvcfihmgbofypwfxdkry
API URL     : https://wvcfihmgbofypwfxdkry.supabase.co
```

---

## F. Whether the database is safe to push

### Safety assessment of the migration set

| Criterion | Finding | Safe? |
|-----------|---------|-------|
| Destructive statements (`DROP TABLE`, `TRUNCATE`, `DELETE`) | None present; only `DROP CONSTRAINT`/`DROP POLICY` immediately re-created within the same migration | ✅ |
| All files non-empty | 6 / 6 non-empty | ✅ |
| Dependency order | Correct (see §B) | ✅ |
| Remote is clean (no conflicting objects) | 0 tables, 0 applied migrations | ✅ |
| RLS present on every new table | `profiles`, `conversations`, `conversation_members`, `messages`, `message_media`, `notifications` all `ENABLE ROW LEVEL SECURITY` | ✅ |
| `SECURITY DEFINER` functions hardened | `is_member_of` + `get_or_create_direct_conversation` have `SET search_path = public`; `handle_new_message_notification` is `SECURITY DEFINER` **without** an explicit `search_path` (minor hardening gap, not a push blocker) | ⚠️ minor |
| Realtime publication changes | Additive; migrations #4 and #6 are idempotent, #5 is not (irrelevant for a one-time push) | ✅ |
| Uncommitted local edits to migrations | None observed; no git repo exists, but all six files are internally consistent with the Phase 4/5/6/7 documentation | ✅ |

### Preconditions that are NOT yet met (operational, not safety)

These do **not** make the push unsafe, but they must be satisfied before `db push` can run:

1. **CLI authentication** — not logged in (`access-token` absent).
2. **Project link** — not linked (`project-ref` absent).
3. *(Optional)* **No git baseline** — recommend `git init` + commit before pushing so the schema state is recoverable.

### Residual risks / recommendations

1. **No automated rollback.** A `db push` against a blank project has no down-migration path. Mitigation: `supabase db dump` a schema backup immediately **after** the push, and keep it.
2. **`handle_new_message_notification` lacks `SET search_path`.** Unlike the Phase 4 functions, the Phase 7 trigger function is `SECURITY DEFINER` without a pinned `search_path`. This is a hardening inconsistency (not a push blocker). Do **not** fix it in this task; if desired, address it in a *new* migration later — never by editing an existing one.
3. **`db push` will also apply any future local migrations.** Confirm `supabase/migrations/` contains exactly the six audited files at push time.
4. **Missing `supabase/seed.sql`** referenced by `config.toml` — only affects `db reset`, irrelevant to `db push`. Flagged for later cleanup.
5. **`message_media` has no index on `conversation_id`** and `notifications` none on `reference_id`. Performance-only; add via a future migration if profiling shows a need.

### Safety conclusion

The migration set is **structurally sound, correctly ordered, non-destructive, RLS-complete, and targeted at a blank remote project**. Nothing in the repository makes the push dangerous. The only outstanding items are operational (log in, link). Therefore:

---

## G. Exact next command (DO NOT EXECUTE)

The immediate next command is **login** (the CLI is not authenticated):

```bash
npx supabase login
```

Full ordered sequence, **none of which is executed by this audit**:

```bash
# 1. Authenticate (interactive — opens a browser to generate an access token)
npx supabase login

# 2. Link this repo to the NEW remote project
npx supabase link --project-ref wvcfihmgbofypwfxdkry

# 3. (Recommended) capture a pre-push baseline
#    (run only after linking; read-only)
npx supabase migration list

# 4. The push itself — NOT executed; awaiting explicit approval
# npx supabase db push
```

> Note: the Docker-less environment means local preview (`supabase start` / `supabase db reset`) is unavailable, so the push cannot be rehearsed locally. The remote is blank, which mitigates this.

---

SAFE TO PUSH

*(Subject to the two operational preconditions in §F: `supabase login` and `supabase link --project-ref wvcfihmgbofypwfxdkry`. The migrations themselves are safe and correct for a clean remote project.)*
