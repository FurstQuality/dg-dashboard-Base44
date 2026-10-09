# Rogers Lakewood alternate-item incident

Course: a7067be0-3faf-40a9-9a6e-e3f90fcd53dd. Investigation performed October 9, 2026. No live database writes were performed.

The current device recovery records refer to Main (27 Hole Layout), b5b97235-5af2-4e99-9c2d-f0f4406c5fcd. Earlier edits in the supplied conversation were on Blue Tees, 299cabbe-d369-4313-9642-08e07571f1e9. The latter still has 18 mapped rows in the temporary negative range and 27 blank positive rows. These are distinct layouts and must not be merged by hole number.

Seven course-specific local draft/checkpoint records were copied to .migration-check.local/rogers-incident-0229-draft-*.json without changing browser storage. They contain one alternate tee and basket on Main hole 1, and no complete alternate setup on holes 2–4. Read-only public API records were archived in rogers-incident-current-0229.json; published layout snapshots visible through that API returned zero rows. Public tee reads are restricted to authenticated users by the repository policies, so an empty anonymous tee response is not proof of deletion. No missing coordinates were reconstructed or guessed.

The connected Supabase account denied access to project ypeebzwggcsyfvafpifa and lists three unrelated projects. The user said they will reconnect the owning account. Owner-authorized reads and backup/history inspection remain necessary before recovery can be completed. The older guarded recovery SQL repairs interrupted numbering only; it does not recreate alternate pins.

Confirmed prevention gaps addressed in code:

- Course-only offline drafts could be offered on another layout. Drafts are now keyed by course and layout; legacy drafts are matched using persisted hole IDs.
- Restoring an older draft could omit currently saved alternates. Restoration now rejects missing saved holes, tees, or baskets before replacing state.
- A missing loaded pin was previously sufficient for deletion. Saves now require an explicit remove action before deleting loaded pin IDs, and fail before database writes on unexplained omissions.
- Editor entry could choose a different layout based on play activity. The last successfully loaded editor layout is remembered and its name is shown in the header.
- First and recent local checkpoints are retained independently of the editable pending draft.

Verification: 993 unit tests passed; isolated browser checks passed for wrong-layout drafts, pin-dropping restoration rejection without writes, archival of dismissed legacy drafts, deliberate pin deletion, failed-save retries, hole counts, and negative-number recovery guards. These are prevention checks, not proof of recovered live assets.
