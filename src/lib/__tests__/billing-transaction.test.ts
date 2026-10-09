import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
const state = (patch: Record<string, unknown> = {}) => ({ user_id: first, tier_key: "pro", status: "active",
  provider_customer_id: "cus_one", provider_subscription_id: "sub_one", interval: "month",
  current_period_end: new Date(Date.now() + 86_400_000).toISOString(), ...patch });
const apply = (event: string, patch = {}, age = 20, provider = "stripe") => db.query<{ result: string }>(
  "SELECT public.apply_billing_webhook($1,$2,'test.event',$3,$4) AS result",
  [provider, event, new Date(Date.now() - age * 1000).toISOString(), JSON.stringify(state(patch))],
).then((result) => result.rows[0].result);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    INSERT INTO auth.users VALUES ('${first}'), ('${second}');`);
  const base = readFileSync("supabase/migrations/20260727124149_55c564f1-753a-4b70-8f9a-916df4596505.sql", "utf8");
  await db.exec(base.slice(0, base.indexOf("-- HELPER FUNCTIONS")));
  await db.exec(readFileSync("supabase/migrations/20261009181152_billing_webhook_transaction_safety.sql", "utf8"));
  await db.exec("INSERT INTO public.subscription_tiers(key,name) VALUES ('pro','Pro');");
}, 30_000);
beforeEach(async () => { await db.exec("RESET ROLE; TRUNCATE public.billing_webhook_receipts, public.subscriptions, public.billing_events;"); });
afterAll(async () => { await db?.close(); });

describe("atomic payment storage (PostgreSQL)", () => {
  it("allows the service role and applies a repeated delivery exactly once", async () => {
    await db.exec("SET ROLE service_role");
    expect(await apply("evt_1")).toBe("applied");
    expect(await apply("evt_1", { status: "expired" })).toBe("duplicate");
    expect((await db.query("SELECT status FROM public.subscriptions")).rows).toEqual([{ status: "active" }]);
    expect((await db.query("SELECT count(*)::int AS n FROM public.billing_events")).rows).toEqual([{ n: 1 }]);
  });
  it("does not roll an entitlement back when an older event arrives", async () => {
    await apply("new");
    expect(await apply("old", { status: "expired" }, 100)).toBe("stale");
    expect((await db.query("SELECT status FROM public.subscriptions")).rows[0]).toEqual({ status: "active" });
  });
  it("rolls the subscription and receipt back if audit storage fails, then permits retry", async () => {
    await db.exec(`CREATE FUNCTION public.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
      CREATE TRIGGER fail_audit BEFORE INSERT ON public.billing_events FOR EACH ROW EXECUTE FUNCTION public.fail_audit();`);
    await expect(apply("retry")).rejects.toThrow("audit unavailable");
    expect((await db.query("SELECT count(*)::int AS n FROM public.subscriptions")).rows[0]).toEqual({ n: 0 });
    expect((await db.query("SELECT count(*)::int AS n FROM public.billing_webhook_receipts")).rows[0]).toEqual({ n: 0 });
    await db.exec("DROP TRIGGER fail_audit ON public.billing_events; DROP FUNCTION public.fail_audit();");
    expect(await apply("retry")).toBe("applied");
  });
  it("prevents one purchase or customer from being assigned to a second user", async () => {
    await apply("one");
    await expect(apply("two", { user_id: second })).rejects.toThrow("billing_owner_conflict");
    await expect(apply("three", { user_id: second, provider_subscription_id: "sub_other" })).rejects.toThrow("billing_owner_conflict");
  });
  it("does not replace an active subscription from another provider", async () => {
    await apply("one");
    await expect(apply("two", { provider_subscription_id: "apple_purchase" }, 10, "apple")).rejects.toThrow("billing_subscription_conflict");
  });
  it("does not let a previous subscription's cancellation cancel the current one", async () => {
    await apply("one");
    expect(await apply("old_cancel", { provider_subscription_id: "sub_previous", status: "canceled" }, 10)).toBe("superseded");
    expect((await db.query("SELECT provider_subscription_id FROM public.subscriptions")).rows[0]).toEqual({ provider_subscription_id: "sub_one" });
  });
  it("rejects indefinite paid access from missing period data and preserves existing metadata", async () => {
    await expect(apply("missing", { current_period_end: null })).rejects.toThrow("invalid_billing_state");
    await apply("one");
    await db.exec(`UPDATE public.subscriptions SET metadata = '{"preserved":true}'`);
    await apply("two", {}, 10);
    expect((await db.query("SELECT metadata FROM public.subscriptions")).rows[0]).toEqual({ metadata: { preserved: true } });
  });
  for (const role of ["anon", "authenticated"]) it(`rejects direct billing mutations and webhook RPCs by ${role}`, async () => {
    await db.exec(`SET ROLE ${role}`);
    await expect(apply("attack")).rejects.toThrow("permission denied");
    await expect(db.query("SELECT public.billing_webhook_security_version()" )).rejects.toThrow("permission denied");
    await expect(db.exec(`INSERT INTO public.subscriptions(user_id,tier_key) VALUES ('${first}','pro')`)).rejects.toThrow();
    await expect(db.query("SELECT * FROM public.billing_webhook_receipts")).rejects.toThrow("permission denied");
  });
});
