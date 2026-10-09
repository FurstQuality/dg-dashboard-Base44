# Admin operations console

Open `/admin/operations` from **Admin → Connectors & platform operations**. The existing super-admin role is required in the UI and is verified independently for every server action.

## Credentials and activation

Keep the running app on its existing Supabase project until an independently owned destination has been selected, migrated and verified. See [Independent connections](./independent-connections.md) for the ownership transition. Setting an API URL or token alone does not transfer a database or disconnect Lovable.

1. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the app server's environment. Existing browser `VITE_SUPABASE_*` values still refer to the same project.
2. For provider management reads, configure a project-scoped `SUPABASE_MANAGEMENT_TOKEN`. Grant only the read permissions used by the desired tools: database, functions, Edge secret metadata, backups, and security advisors. A service-role key is not a management token.
3. Configure `GITHUB_REPOSITORY=furst93/chain-linked` and a fine-grained `GITHUB_TOKEN` scoped to that repository with metadata and contents read access. Set `GITHUB_BRANCH` if different from the remote default. Populate `DEPLOY_COMMIT_SHA` from the deployment, not a guessed value.
4. Configure existing connector variables listed in `.env.example`. Their values must be entered into the deployment environment, never a public `VITE_` variable, project notes, chat, or source control. Restart/redeploy after environment changes.
5. Apply **only** `supabase/migrations/20261008174842_admin_project_settings.sql` after reviewing it against the existing database. This adds a private, super-admin-only notes table and an audited, revision-checked save function. It has not been applied by this task because the connected project denied schema access. Do not blindly push unrelated local migrations.
6. In the console, run supported connection checks. Configuration presence does not prove the provider is usable. Finish a real Google sign-in separately to validate consent and the callback configuration.

Supabase Edge Function secrets and this TanStack app server are separate runtimes. Listing an Edge secret does not prove the app server has the corresponding environment variable. Values/digests from the Edge secret listing are removed on the server before returning the result.

## Delivered scope and remaining parity

| Area | Implemented | Still requires provider setup or further development |
| --- | --- | --- |
| Connectors | Catalog, runtime readiness, setup destinations; database, management, Google authorization, GitHub and Stripe API checks | Direct migration of Calendar, Firecrawl, AI, email and SMS away from Lovable's gateways; new connector authorization flows |
| Database | Public table inventory, row estimates and size; provider-enforced read-only SQL | In-app row editing, migrations and query writes use the Supabase console |
| Users | Paginated auth users and login-provider metadata | Account creation, disabling and deletion use Supabase |
| Storage | Bucket inventory and policy metadata | File browser, uploads and bucket writes use Supabase |
| Secrets | App environment presence; Edge secret names/timestamps with values hidden | Entry/rotation in the provider console; an in-app secret form needs separate approval |
| Jobs/functions/logs | Cron job metadata and recent job runs; deployed function metadata | Full logs, deployments, job editing and schedules use Supabase |
| Backups/usage | Backup metadata and PostgreSQL statistics | Restore and billing/usage charts use the hosting/provider console; no Lovable credits are inferred |
| AI | Latest saved assistant-message metadata without conversation contents | Request-level model, tokens, cost, latency, failure telemetry; historical Lovable run data is not in these rows |
| Payments | Existing plans, subscriptions and billing-event tools; Stripe API check | Live checkout/webhook verification and account setup; Shopify is not installed |
| Security | Provider database-advisor findings, private security notes | Application/dependency scanning and import of ignored Lovable findings; no false all-clear banner |
| Search/domains | Search Console, sitemap and PageSpeed links; configured public URL | Search OAuth, traffic reports, content audit, DNS and hosting management |
| Knowledge | Private reference notes with revision conflict detection and audit | Notes do not automatically alter model prompts |
| Agent integrations | Connection inventory and explicit availability guidance | In-app MCP authorization and tool-execution service |
| Git | Remote branch head versus explicitly configured deployment SHA; clone URL | Lovable unpublished work cannot be read through GitHub; no Git writes are performed |

## Verification limits

Local verification on 2026-10-08: 104 test files / 916 tests pass, production build passes, and browser fixtures cover all operations sections, connector filtering, missing-credential errors, SQL results, notes saves, and 1440px/390px layouts. Anonymous access redirects to sign-in with the original operations destination intact. The mobile admin menu was changed to a compact selector after the browser check exposed overlapping controls.

Unit coverage checks fail-closed super-admin authorization, credential redaction, provider errors and SQL `read_only` requests. Browser fixtures are isolated from production authentication and provider writes. Live cloud calls and notes persistence need authorized credentials and the applied migration; a mocked UI result is not proof of a live connection.

Official API references: [Supabase management query](https://supabase.com/docs/reference/api/v1-run-a-query), [secret metadata](https://supabase.com/docs/reference/api/v1-list-all-secrets), [security advisors](https://supabase.com/docs/reference/api/v1-get-security-advisors), [backups](https://supabase.com/docs/reference/api/v1-list-all-backups).
