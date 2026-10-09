# Canonical model (target architecture)

This is the reference map the app follows. New features attach to these chains rather than creating parallel data.

```text
                        CANONICAL PLAYER
             ┌────────────────┼────────────────┐
            PDGA            UDisc          DGD Profile
             └───────── CANONICAL ROUND ───────┘
                              │
                       DGD V1.3 Rating
                              │
              Statboard / Profile / Events

CANONICAL COURSE
  ├── Base Course Assets
  ├── Layouts └── Layout Versions
  ├── Live Conditions
  └── Change History
            ▼
          EVENT → Course + Layout Version → Event Overlay → Event Round Snapshot
                → Event Results → CANONICAL PHYSICAL ROUND → Statboard / DGD Rating

EVENT DIRECTOR: Event · Series · League · Team · Operations · Organization
TRACKERS: follow canonical Events and Players, group Players into Crews, read canonical Courses/Results
COMMUNITY: discovers published Events, reports Course Conditions, suggests Course Changes,
           routes event creation → Event Director
```

## Gap report (2026-10-06)

| Link | Status | Where it lives / what is missing |
|---|---|---|
| PDGA + UDisc + native → canonical round | Done | canonical_rounds / canonical_round_sources, canonicalize_user_rounds |
| Canonical round → DGD V1.3 Rating | Done | dgd_v13_player_state, get_my_dgd_rating |
| Rating → Statboard / Profile / Events | Done | Statboard views, profile badge, tracker/leaderboard RPCs |
| Course base assets, layouts, versions | Done | course_holes/tees/baskets, layout_slots, layout_versions (publish_layout) |
| Live conditions, change history | Done | course_reports, course_feature_history, course_change_proposals |
| Event → Course + Layout | Done | tournaments/tournament_rounds/leagues/league_events carry course_id + layout_id |
| Event → Layout Version | Done | layout_version_id on tournament_rounds/league_events, auto-pinned by trigger; "Use latest" in director UI |
| Event Overlay | Done | "Event map rules" opens the builder with ?overlay=; features saved on layer=event, hidden from normal course views |
| Event Round Snapshot | Done | build_event_round_snapshot freezes layout version + event rules; copied to rounds.event_snapshot; scoring reads event rules from it |
| Event Results → canonical round | Done | canonical_rounds.event_kind/event_id/event_name labelled by trigger; Statboard Rounds shows event + round/week |
| Event Director: Event, Series, League, Team, Organization | Done | Phase 10.1 M1 navigation |
| Event Director: Operations | Missing | No operations workspace yet (Phase 10.1 M3) |
| Trackers | Done | follows events/players, crews, reads results |
| Community | Done | discovery, condition reports, suggest-a-fix, Create event → Event Director |
