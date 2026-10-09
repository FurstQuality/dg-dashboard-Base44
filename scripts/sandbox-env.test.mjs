import { test } from "node:test";
import assert from "node:assert/strict";
import { sandboxEnvironment } from "./sandbox-env.mjs";
const source = "SUPABASE_URL=https://live.supabase.co\nSTRIPE_SECRET_KEY=live-secret";
const draft =
  "SUPABASE_URL=https://draft.supabase.co\nVITE_SUPABASE_URL=https://draft.supabase.co\nSUPABASE_PUBLISHABLE_KEY=draft-public\nVITE_SUPABASE_PUBLISHABLE_KEY=draft-public";
test("isolates app credentials while preserving OS essentials", () => {
  const env = sandboxEnvironment(source, draft, {
    PATH: "runtime",
    GITHUB_TOKEN: "live-token",
    STRIPE_SECRET_KEY: "live-key",
    VITE_OTHER: "live-value",
  });
  assert.equal(env.PATH, "runtime");
  assert.equal(env.SUPABASE_URL, "https://draft.supabase.co");
  assert.equal(env.STRIPE_SECRET_KEY, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.VITE_OTHER, undefined);
  assert.equal(env.VITE_DGD_ENVIRONMENT, "sandbox");
});
test("refuses live project even when server URL differs from browser", () => {
  assert.throws(
    () => sandboxEnvironment(source, draft.replaceAll("draft.supabase.co", "live.supabase.co"), {}),
    /live Supabase/,
  );
  assert.throws(
    () =>
      sandboxEnvironment(
        source,
        draft.replace("VITE_SUPABASE_URL=https://draft", "VITE_SUPABASE_URL=https://live"),
        {},
      ),
    /same Supabase/,
  );
});
test("checks inherited production target and missing settings", () => {
  assert.throws(() => sandboxEnvironment("", draft, {}), /production SUPABASE_URL/);
  assert.throws(() => sandboxEnvironment(source, "", {}), /SUPABASE_URL/);
  assert.throws(
    () => sandboxEnvironment(source, draft, { SUPABASE_URL: "https://draft.supabase.co" }),
    /live Supabase/,
  );
});
test("removes management and migration credentials even from sandbox file", () => {
  const env = sandboxEnvironment(
    source,
    draft +
      "\nGITHUB_TOKEN=test-token\nDATABASE_URL=postgres://example\nSUPABASE_MANAGEMENT_TOKEN=test-management",
    {},
  );
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.SUPABASE_MANAGEMENT_TOKEN, undefined);
});

test("rejects live payment keys and privileged browser keys", () => {
  assert.throws(
    () => sandboxEnvironment(source, draft + "\nSTRIPE_SECRET_KEY=sk_live_fixture", {}),
    /Stripe test/,
  );
  assert.throws(
    () => sandboxEnvironment(source, draft + "\nSTRIPE_SECRET_KEY=rk_live_fixture", {}),
    /Stripe test/,
  );
  assert.throws(
    () => sandboxEnvironment(source, draft.replaceAll("draft-public", "sb_secret_fixture"), {}),
    /secret key/,
  );
});

test("isolates connection vaults and sets the studio origin and payment redirect", () => {
  const env = sandboxEnvironment(
    source,
    draft +
      "\nADMIN_CONNECTIONS_DIRECTORY=C:/live-vault\nADMIN_CONNECTIONS_ENCRYPTION_KEY=live-key\nBASE44_API_KEY=live-token",
    {},
  );
  assert.equal(env.ADMIN_CONNECTIONS_DIRECTORY, undefined);
  assert.equal(env.ADMIN_CONNECTIONS_ENCRYPTION_KEY, undefined);
  assert.equal(env.BASE44_API_KEY, undefined);
  assert.equal(env.APP_ORIGIN, "http://127.0.0.1:5190");
  assert.equal(env.VITE_DGD_STUDIO_ORIGIN, "http://127.0.0.1:5180");
});
