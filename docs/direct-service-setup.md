# Direct AI and transactional email

The same DG Dashboard source runs locally and in Base44. Ace chat and guest caddy questions support OpenAI directly. Event invitations and kiosk signup invitations support Resend directly. Neither direct path needs a Lovable credential.

## Configure the app server

Keep private keys in the app host’s server settings. For this checkout, use the ignored local environment file. For Base44, configure the private runtime bindings for [DG Dashboard in Mike’s Workspace](https://app.base44.com/apps/6ac96e8c9295eff8becd8869/editor/preview). The server entry reads the names below on each request. Supabase Edge Function secrets configure a separate runtime and do not supply these values to the Base44 or local app server. Never place API keys in a `VITE_` setting, Git, a public configuration file or chat.

| Feature | Required server settings | Optional setting |
| --- | --- | --- |
| Ace AI | `OPENAI_API_KEY` | `OPENAI_MODEL` (default `gpt-4.1-mini`, a Chat Completions model) |
| Transactional email | `RESEND_API_KEY`, `EMAIL_FROM` | — |
| Public links | `PUBLIC_APP_URL`, the published HTTPS app origin | — |

Create the OpenAI key in your own project. Verify the domain you control in Resend, then choose a sender such as `DG Dashboard <mail@your-verified-domain>`. Do not assume a sender previously delegated to Lovable is verified in Resend. Restart the local server after changing local environment values; use the host’s normal private-settings deployment process for the hosted app.

`PUBLIC_APP_URL` must be an HTTPS origin with no username, path, query or fragment. Explicit local development also permits HTTP loopback. Invitations never infer this address from request headers or fall back to the old site's domain. If it is missing, event invitation creation stops before inserting new invitations; kiosk check-in can still succeed with email reported unsent.

Open **Admin → Operations → Connectors**. Ace and email show the provider selected by the running server and any missing setting names. **Credentials present** means configuration presence only; it does not establish account access, billing, domain verification, delivery or a successful API request. No email or paid AI call is triggered by this status page.

Direct credentials take priority. A partially configured direct email service remains blocked until `EMAIL_FROM` is set. Failed direct requests never switch providers automatically. Existing local installations that only have `LOVABLE_API_KEY` retain their legacy provider until their direct settings are supplied. The Base44 server does not import that legacy key.

## Verify before public release

1. After the database and Auth migration, sign in with a test account and ask Ace a course question. Confirm the response and conversation history in the preview. Free-tier local answers still skip AI calls; the existing beta access policy is unchanged.
2. With an event test account and guest allowance, confirm that a guest caddy answer uses the same configured provider. Automated tests mock provider requests and do not prove your account’s access or guest behavior against the deployed database.
3. When ready to send a real test email, send an invitation to an address you control. Check both the app’s result and Resend’s delivery log. A successful API result confirms acceptance, not inbox delivery. Event/kiosk invitation IDs are reused as idempotency keys; retry with the same identifier after an uncertain timeout.
4. Configure Supabase Auth SMTP and callback origins separately for sign-in, reset and confirmation emails. Direct transactional delivery does not reconfigure Auth or replace the signed legacy Auth webhook.

Ace requests have a 30-second timeout, output-token bound and `store: false` on direct OpenAI calls. That flag disables Chat Completions storage for distillation/evals; it is not a zero-retention guarantee. Email requests have a 20-second timeout. Provider error bodies and raw network exceptions are not returned to players or stored in their conversations.

## Calendar, source imports and SMS

The Base44 build supports direct Google Calendar, Firecrawl and Twilio connections. Configure these settings privately on the app server; Supabase Edge secrets configure a separate runtime.

| Feature | Required server settings | Alternative |
| --- | --- | --- |
| Google Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `APP_USER_CONNECTION_KEY_SECRET` | — |
| Course/event/source imports | `FIRECRAWL_API_KEY`, your direct Firecrawl key | — |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_FROM_NUMBER` | `TWILIO_MESSAGING_SERVICE_SID` can replace the sender number |

Enable the Google Calendar API, create a web OAuth client, and register the exact app URL ending in `/google-calendar-callback`. Use that same full URL as `GOOGLE_REDIRECT_URI`. The callback must have the same origin as the app window that starts the connection; register separate origins for previews you intend to test. Google sign-in uses Supabase's callback and remains a separate configuration. During Google consent testing, add your test account to the OAuth application's test users.

`APP_USER_CONNECTION_KEY_SECRET` must be a base64-encoded 32-byte encryption key. Keep the key stable across deployments and preserve any existing key; replacing it prevents reading existing encrypted connections. Calendar authorization codes are exchanged on the server using a one-use state and PKCE. Access and refresh tokens stay in the existing service-role-only encrypted `app_user_connections` store. The browser receives a success result, never Google tokens. Existing gateway Calendar users reconnect through Google to use the direct provider; original gateway credentials are preserved until deliberately removed.

Use a Twilio API key SID as `TWILIO_API_KEY` and its API secret as `TWILIO_API_SECRET`, along with the parent account SID. SMS delivery requires a returned message SID before the app reports acceptance. Provider acceptance is not confirmation of handset delivery. Verify with a test recipient you control when authorized to send a real message.

Admin → Operations → Connectors shows the selected provider and missing configuration names. These cards report setting presence only. A Messaging Service satisfies the SMS sender requirement. Partial direct credentials block requests instead of switching to a legacy gateway. Import transport uses direct Firecrawl keys throughout; legacy `lovc_` connection keys remain supported on installations that explicitly configure the legacy gateway. Raw fetched sources are archived before parsing, including direct public HTML, and Google event fields retain observation provenance.

Source commits do not configure provider accounts, publish the app, or complete its separate database/Auth/Storage migration. Verify calendar consent, reconnect/disconnect, multi-page pull, event push, and source imports in the actual Base44 preview after synchronization. Google revocation must succeed before direct credentials are removed locally.

References: [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OAuth best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices), [Firecrawl scrape](https://docs.firecrawl.dev/api-reference/endpoint/scrape), [Firecrawl search](https://docs.firecrawl.dev/api-reference/endpoint/search), [Twilio message creation](https://www.twilio.com/docs/messaging/api/message-resource).

References: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email), [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
