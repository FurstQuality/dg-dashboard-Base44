import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const sqlFile = (path) => readFile(new URL(path, root), "utf8");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ids = {
  owner: id(1),
  player: id(2),
  course: id(10),
  foreignCourse: id(11),
  layout: id(20),
  otherLayout: id(21),
  hole: id(30),
  otherHole: id(31),
  tee: id(40),
  basket: id(50),
  legacy: id(60),
  slot: id(70),
  event: id(80),
  round: id(81),
  league: id(82),
  night: id(83),
};

test("publication SQL against disposable Postgres", async (t) => {
  const db = new PGlite();
  try {
    // 0035 supplies the real canonical tables, permissions, and original RPC.
    // latest_layout_version is installed after its referenced table exists.
    const fixture = await sqlFile("scripts/course-builder-db/fixture.sql");
    const split = fixture.indexOf("CREATE FUNCTION public.latest_layout_version");
    await db.exec(fixture.slice(0, split));
    await db.exec(await sqlFile("drizzle/migrations/0035_layout_studio_model.sql"));
    await db.exec(fixture.slice(split));
    const authz = await sqlFile("drizzle/migrations/0060_event_capabilities_enforce.sql");
    await db.exec(
      authz.slice(
        authz.indexOf("CREATE OR REPLACE FUNCTION public.event_has_capability"),
        authz.indexOf("DROP POLICY"),
      ),
    );
    await db.exec(
      "INSERT INTO event_role_capabilities VALUES ('co_td','event.manage_course_ops'),('course_lead','event.manage_course_ops'),('scoring','event.manage_scoring')",
    );
    await db.query("INSERT INTO courses VALUES ($1,$2),($3,$2)", [
      ids.course,
      ids.owner,
      ids.foreignCourse,
    ]);
    await db.query(
      "INSERT INTO course_layouts (id,course_id,name,created_by,status) VALUES ($1,$2,'Main',$3,'draft'),($4,$2,'Other',$3,'draft')",
      [ids.layout, ids.course, ids.owner, ids.otherLayout],
    );
    await db.query("INSERT INTO course_holes(id,course_id,label) VALUES ($1,$2,'1'),($3,$2,'2')", [
      ids.hole,
      ids.course,
      ids.otherHole,
    ]);
    await db.query(
      "INSERT INTO course_tees(id,course_id,course_hole_id,name,latitude,longitude) VALUES ($1,$2,$3,'Blue',41,-87)",
      [ids.tee, ids.course, ids.hole],
    );
    await db.query(
      "INSERT INTO course_baskets(id,course_id,course_hole_id,name,latitude,longitude) VALUES ($1,$2,$3,'A',41.001,-87.001)",
      [ids.basket, ids.course, ids.hole],
    );
    await db.query(
      "INSERT INTO holes(id,layout_id,physical_hole_key,number,par,par_confirmed,tee_lat,tee_lng,basket_lat,basket_lng,flight_path,distance_ft) VALUES ($1,$2,$3,1,3,true,41,-87,41.001,-87.001,'[[41.001,-87]]',888)",
      [ids.legacy, ids.layout, ids.hole],
    );
    await db.query(
      "INSERT INTO layout_slots(id,layout_id,position,display_label,course_hole_id,tee_id,basket_id,par,legacy_hole_id,rules) VALUES ($1,$2,1,'1',$3,$4,$5,3,$6,'[{\"note\":\"selected\"}]')",
      [ids.slot, ids.layout, ids.hole, ids.tee, ids.basket, ids.legacy],
    );
    const route = {
      version: 1,
      bends: [],
      routes: {
        "main-basket": {
          nodes: ["point:shared"],
          points: { "point:shared": [41.001, -87] },
          scoring: { par: 5, distanceOverride: 777 },
        },
      },
      trunk: {
        nodes: ["point:shared"],
        points: { "point:shared": [41.001, -87] },
        scoring: { par: 3, distanceOverride: 888 },
      },
    };
    await db.query(
      "INSERT INTO hole_tees(hole_id,name,latitude,longitude,flight_path) VALUES ($1,'Red',41.0001,-87,$2)",
      [ids.legacy, JSON.stringify(route)],
    );
    await db.query(
      "INSERT INTO hole_baskets(hole_id,name,latitude,longitude,split_point) VALUES ($1,'B',41.0011,-87.001,$2)",
      [
        ids.legacy,
        JSON.stringify({ version: 1, split: [41.001, -87], main_basket_ids: ["main-basket"] }),
      ],
    );
    await db.query(
      "INSERT INTO layout_versions(layout_id,version,snapshot,summary) VALUES ($1,1,'[{\"historical\":true}]','Old source')",
      [ids.layout],
    );
    await db.query("INSERT INTO course_event_overlays VALUES ($1,$2,NULL),($3,NULL,$4)", [
      id(90),
      ids.event,
      id(91),
      ids.night,
    ]);
    for (const [n, type, layer, layout, overlay] of [
      [100, "tree", "base", ids.otherLayout, null],
      [101, "ob_line", "layout", ids.layout, null],
      [102, "mando", "layout", ids.otherLayout, null],
      [103, "hazard", "base", null, null],
      [104, "ob_area", "event", ids.layout, id(90)],
      [105, "mando", "event", ids.layout, id(91)],
    ]) {
      await db.query(
        "INSERT INTO course_features(id,course_id,layout_id,type,layer,geometry,event_overlay_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id(n), ids.course, layout, type, layer, '{"points":[[41,-87]]}', overlay],
      );
    }
    await db.query("INSERT INTO fixture_event_owners VALUES ($1,$2),($3,$2)", [
      ids.event,
      ids.owner,
      ids.league,
    ]);
    await db.query(
      'INSERT INTO tournament_rounds VALUES ($1,$2,$3,$4,NULL,\'{"scorecard_message":"Director note"}\')',
      [ids.round, ids.event, ids.course, ids.layout],
    );
    await db.query(
      'INSERT INTO league_events VALUES ($1,$2,$3,$4,NULL,\'{"scorecard_message":"Night note"}\')',
      [ids.night, ids.league, ids.course, ids.layout],
    );
    const actor = async (user = ids.owner, role = "authenticated") => {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user ?? ""]);
      await db.exec(`SET LOCAL ROLE ${role}`);
    };
    const publish = () =>
      db.query("SELECT public.publish_layout($1,$2) AS version", [ids.layout, "Verified locally"]);
    const check = async (name, fn) =>
      t.test(name, async () => {
        await db.exec("BEGIN");
        try {
          await fn();
        } finally {
          await db.exec("ROLLBACK");
        }
      });
    await check("reproduces original RPC accepting unset par", async () => {
      await db.exec("UPDATE layout_slots SET par = NULL");
      await actor();
      assert.equal((await publish()).rows[0].version, 2);
    });
    await t.test("read-only audit works before the context column exists", async () => {
      await db.exec(await sqlFile("scripts/course-builder-db-audit.sql"));
    });
    await db.exec(
      await sqlFile(
        "supabase/migrations/20261009142843_course_layout_publication_snapshot_safety.sql",
      ),
    );
    await t.test("read-only audit works after installing publication safety", async () => {
      await db.exec(await sqlFile("scripts/course-builder-db-audit.sql"));
    });
    await check("steward publishes and advances version", async () => {
      await actor();
      assert.equal((await publish()).rows[0].version, 2);
      assert.equal((await publish()).rows[0].version, 3);
    });
    await check("failed publication leaves versions and draft status unchanged", async () => {
      await db.exec("UPDATE layout_slots SET par=NULL");
      await actor();
      await db.exec("SAVEPOINT publication");
      await assert.rejects(publish(), /Every included hole/);
      await db.exec("ROLLBACK TO SAVEPOINT publication");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM layout_versions")).rows[0].n, 1);
      await db.exec("RESET ROLE");
      assert.equal(
        (await db.query("SELECT status FROM course_layouts WHERE id=$1", [ids.layout])).rows[0]
          .status,
        "draft",
      );
    });
    for (const [name, query, args = [], message = /Every included hole/] of [
      ["rejects unset par", "UPDATE layout_slots SET par = NULL"],
      ["rejects invalid par", "UPDATE layout_slots SET par = 8"],
      ["rejects missing tee", "UPDATE layout_slots SET tee_id = NULL"],
      ["rejects empty label", "UPDATE layout_slots SET display_label = ' '"],
      ["rejects negative position", "UPDATE layout_slots SET position = -1"],
      [
        "rejects wrong physical hole",
        "UPDATE course_tees SET course_hole_id = $1",
        [ids.otherHole],
      ],
      [
        "rejects foreign course asset",
        "UPDATE course_tees SET course_id = $1",
        [ids.foreignCourse],
      ],
      ["rejects partial coordinates", "UPDATE course_tees SET longitude = NULL"],
      ["rejects invalid latitude", "UPDATE course_tees SET latitude = 91"],
      ["rejects NaN coordinates", "UPDATE course_tees SET latitude = 'NaN'::float8"],
      ["rejects infinite coordinates", "UPDATE course_tees SET longitude = 'Infinity'::float8"],
      [
        "rejects empty playable layout",
        "UPDATE layout_slots SET included = false",
        [],
        /at least one included hole/,
      ],
    ])
      await check(name, async () => {
        await db.query(query, args);
        await actor();
        await assert.rejects(publish(), message);
      });
    await check("unplaced complete assets publish with unknown map coordinates", async () => {
      await db.exec("UPDATE course_tees SET latitude = NULL,longitude = NULL");
      await actor();
      await publish();
      const row = (
        await db.query("SELECT snapshot,context_snapshot FROM layout_versions WHERE version=2")
      ).rows[0];
      assert.equal(row.snapshot[0].tee, null);
      assert.equal(row.snapshot[0].route_source_id, null);
      assert.deepEqual(row.context_snapshot.legacy_geometry, []);
    });
    await check("player and draft creator cannot publish", async () => {
      await db.query("UPDATE course_layouts SET created_by=$1", [ids.player]);
      await actor(ids.player);
      await assert.rejects(publish(), /Only course stewards/);
    });
    await check("null identity fails closed", async () => {
      await actor(null);
      await assert.rejects(publish(), /Sign in required/);
    });
    await check("anonymous role has no publisher privilege", async () => {
      await actor(null, "anon");
      await assert.rejects(publish(), /permission denied/);
    });
    await check(
      "captures controls, stable identities, independent metadata and ground/rules",
      async () => {
        await actor();
        await publish();
        const row = (
          await db.query("SELECT snapshot,context_snapshot FROM layout_versions WHERE version=2")
        ).rows[0];
        assert.deepEqual(row.snapshot[0].flight_path, [[41.001, -87]]);
        assert.equal(row.snapshot[0].route_source_id, ids.legacy);
        assert.equal(row.snapshot[0].par, 3);
        assert.deepEqual(row.snapshot[0].rules, [{ note: "selected" }]);
        const context = row.context_snapshot;
        assert.equal(context.schema_version, 1);
        assert.deepEqual(context.legacy_geometry[0].tees[0].flight_path, route);
        assert.equal(context.legacy_geometry[0].hole.distance_ft, 888);
        assert.deepEqual(
          context.features.map((f) => f.id),
          [id(100), id(101), id(103)],
        );
        assert.equal(context.tees[0].id, ids.tee);
        assert.equal(context.baskets[0].id, ids.basket);
      },
    );
    await check(
      "explicit played rules select foreign-layout rule without event rules",
      async () => {
        await db.query("UPDATE course_layouts SET played_rule_ids=$1 WHERE id=$2", [
          [id(102), id(104)],
          ids.layout,
        ]);
        await actor();
        await publish();
        const context = (
          await db.query("SELECT context_snapshot FROM layout_versions WHERE version=2")
        ).rows[0].context_snapshot;
        assert.deepEqual(
          context.features.map((f) => f.id),
          [id(100), id(102)],
        );
      },
    );
    await check("mismatched pairing never borrows old route", async () => {
      await db.exec("UPDATE course_tees SET latitude=41.002");
      await actor();
      await publish();
      const row = (
        await db.query("SELECT snapshot,context_snapshot FROM layout_versions WHERE version=2")
      ).rows[0];
      assert.equal(row.snapshot[0].route_source_id, null);
      assert.equal(row.snapshot[0].flight_path, null);
      assert.deepEqual(row.context_snapshot.legacy_geometry, []);
    });
    await check("old snapshots remain untouched and explicitly lack context", async () => {
      await actor();
      await publish();
      const old = (
        await db.query("SELECT snapshot,context_snapshot FROM layout_versions WHERE version=1")
      ).rows[0];
      assert.deepEqual(old, { snapshot: [{ historical: true }], context_snapshot: null });
    });
    for (const [name, query, role] of [
      [
        "blocks service-role snapshot update",
        "UPDATE layout_versions SET snapshot='[]'",
        "service_role",
      ],
      ["blocks service-role version deletion", "DELETE FROM layout_versions", "service_role"],
      [
        "blocks privileged context mutation",
        "UPDATE layout_versions SET context_snapshot='{}'",
        "postgres",
      ],
    ])
      await check(name, async () => {
        await db.exec(`SET LOCAL ROLE ${role}`);
        await assert.rejects(db.exec(query), /immutable/);
      });
    for (const [kind, round, table] of [
      ["tournament", ids.round, "tournament_rounds"],
      ["league", ids.night, "league_events"],
    ]) {
      await check(`${kind} snapshot freezes context and only its overlays`, async () => {
        await actor();
        await publish();
        const captured = (
          await db.query("SELECT build_event_round_snapshot($1,$2) AS snapshot", [kind, round])
        ).rows[0].snapshot;
        assert.equal(captured.layout_context.schema_version, 1);
        assert.deepEqual(
          captured.event_rules.map((f) => f.id),
          [kind === "tournament" ? id(104) : id(105)],
        );
        await db.exec("RESET ROLE");
        const before = (await db.query(`SELECT rules_snapshot FROM ${table} WHERE id=$1`, [round]))
          .rows[0].rules_snapshot;
        const beforeVersion = (
          await db.query("SELECT snapshot,context_snapshot FROM layout_versions WHERE version=2")
        ).rows[0];
        await db.exec(
          "UPDATE holes SET flight_path='[[42,-86]]',distance_ft=100; UPDATE hole_tees SET flight_path='[]'; UPDATE course_baskets SET latitude=42; UPDATE course_features SET geometry='{}';",
        );
        assert.deepEqual(
          (await db.query(`SELECT rules_snapshot FROM ${table} WHERE id=$1`, [round])).rows[0]
            .rules_snapshot,
          before,
        );
        assert.deepEqual(
          (await db.query("SELECT snapshot,context_snapshot FROM layout_versions WHERE version=2"))
            .rows[0],
          beforeVersion,
        );
        assert.match(before.scorecard_message, /note/i);
        assert.equal(before.layout_context.legacy_geometry[0].hole.distance_ft, 888);
      });
    }
    await check("snapshot cannot pin a version belonging to another layout", async () => {
      await db.query("INSERT INTO layout_versions(layout_id,version,snapshot) VALUES ($1,1,'[]')", [
        ids.otherLayout,
      ]);
      await db.query(
        "UPDATE tournament_rounds SET layout_version_id=(SELECT id FROM layout_versions WHERE layout_id=$1)",
        [ids.otherLayout],
      );
      await actor();
      await assert.rejects(
        db.query("SELECT build_event_round_snapshot($1,$2)", ["tournament", ids.round]),
        /published version/,
      );
    });
    await check(
      "old pinned event context stays null rather than using current geometry",
      async () => {
        await db.query(
          "UPDATE tournament_rounds SET layout_version_id=(SELECT id FROM layout_versions WHERE version=1)",
        );
        await actor();
        const captured = (
          await db.query("SELECT build_event_round_snapshot($1,$2) AS snapshot", [
            "tournament",
            ids.round,
          ])
        ).rows[0].snapshot;
        assert.equal(captured.layout_context, null);
        assert.deepEqual(captured.layout, [{ historical: true }]);
      },
    );
    await check("unauthorized event manager cannot build snapshots", async () => {
      await actor(ids.player);
      await assert.rejects(
        db.query("SELECT build_event_round_snapshot($1,$2)", ["league", ids.night]),
        /Not allowed/,
      );
    });
    await check(
      "course lead can capture event geometry through the real capability function",
      async () => {
        await actor();
        await publish();
        await db.exec("RESET ROLE");
        await db.query(
          "INSERT INTO event_managers(kind,event_id,user_id,staff_role) VALUES ('tournament',$1,$2,'course_lead')",
          [ids.event, ids.player],
        );
        await actor(ids.player);
        assert.equal(
          (
            await db.query("SELECT build_event_round_snapshot($1,$2) AS snapshot", [
              "tournament",
              ids.round,
            ])
          ).rows[0].snapshot.layout_context.schema_version,
          1,
        );
      },
    );
    for (const [name, staffRole, revoked] of [
      ["scoring staff cannot alter course snapshots", "scoring", []],
      [
        "explicit course capability revocation takes precedence",
        "co_td",
        ["event.manage_course_ops"],
      ],
    ]) {
      await check(name, async () => {
        await db.query(
          "INSERT INTO event_managers(kind,event_id,user_id,staff_role,revoked_capabilities) VALUES ($1,$2,$3,$4,$5)",
          ["tournament", ids.event, ids.player, staffRole, revoked],
        );
        await actor(ids.player);
        await assert.rejects(
          db.query("SELECT build_event_round_snapshot($1,$2)", ["tournament", ids.round]),
          /Not allowed/,
        );
      });
    }
  } finally {
    await db.close();
  }
});
