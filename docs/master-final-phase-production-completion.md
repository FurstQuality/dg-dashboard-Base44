MASTER FINAL PHASE — DGD PRODUCTION COMPLETION, OPTIMIZATION & LAUNCH CERTIFICATION

PROJECT:
DG Dashboard / SmartCaddy Intelligence

MISSION:

Perform a complete end-to-end review, completion, cleanup, optimization,
security audit, data reconciliation, regression test, and production-readiness
certification of the ENTIRE DGD application.

DO NOT treat this as another design audit.

DO NOT return a long list of recommendations without implementing them.

DO NOT mark an item complete merely because:

- the route exists
- the component renders
- TypeScript compiles
- the build succeeds
- a button is visible
- a table exists
- sample data works
- an old test previously passed.

For every feature:

AUDIT
→ TEST
→ REPAIR
→ COMPLETE
→ VERIFY WITH REAL DATA
→ DOCUMENT RESULT.

The objective is:

A COHESIVE, MOBILE-FIRST, PRODUCTION-READY DISC GOLF PLATFORM
WHERE ALL MAJOR FEATURES WORK TOGETHER AND SHARE CANONICAL DATA.

==================================================
0. ABSOLUTE PRODUCT PRINCIPLES
==================================================

Preserve these rules across the entire app.

1. ONE REAL-WORLD ENTITY = ONE CANONICAL DGD ENTITY.

Examples:

one Player
one physical Round
one Course
one physical Hole
one Tee
one Basket Position
one Layout Version
one Event
one Event Round
one Registration
one Result.

Different products reference those canonical entities.

Do not create copies because different screens need the same fact.

2. ONE FACT = ONE OWNER.

If multiple screens display:

Par
distance
registration status
current Basket
Event date
Round score
payout
player rating
Course geometry

identify the canonical owner.

Other screens render/reference it.

3. SOURCE PROVENANCE IS PRESERVED.

PDGA
UDisc
Disc Golf Scene
DGD-native
Course Atlas
manual/steward data

remain attributable.

4. EXTERNAL RATING SYSTEMS REMAIN INDEPENDENT.

PDGA ≠ UDisc ≠ DGD.

Do not blend their rating values.

5. UNKNOWN ≠ ZERO.

NULL / unknown remains unknown.

Never silently create:

Par 3
Default Layout
0 rating
0 distance

to satisfy UI requirements.

6. HISTORICAL TRUTH IS VERSIONED.

Published Event/Layout/Result history must not silently change because current
Course data changes later.

7. MOBILE IS FIRST-CLASS.

Every important player and Event-Day workflow must be excellent from a phone.

Desktop is the richer management environment.

8. FRONTEND VISIBILITY IS NOT AUTHORIZATION.

Server/database rules must enforce access.

==================================================
1. BUILD A COMPLETE FEATURE REGISTRY FIRST
==================================================

Before changing code, inventory the entire application.

Create a machine-readable feature registry containing:

feature_id
feature name
route(s)
mobile route/view
owner module
canonical tables/models used
required permissions
feature status
dependencies
data sources
test coverage
production criticality.

Classify every feature:

PRODUCTION CRITICAL
CORE
SECONDARY
EXPERIMENTAL
ADMIN ONLY
DEPRECATED.

Do not rely on memory.

Inspect actual routes, components, hooks, queries, functions, Edge Functions,
database objects, jobs, and navigation.

==================================================
2. FIND ORPHANED AND DUPLICATE FEATURES
==================================================

Identify:

routes no longer reachable
navigation links to old screens
duplicate editors
duplicate creation flows
old Event Manager screens
old Course Builder screens
old Social Feed routes
old league/tournament products
unused components
old Supabase RPCs
legacy tables no longer used
temporary feature flags
staging-only logic.

For each:

KEEP
MERGE
REDIRECT
DEPRECATE
REMOVE.

Do not leave two ways to do the same canonical job unless they genuinely serve
different contexts.

==================================================
3. REBUILD THE NAVIGATION INVENTORY
==================================================

Verify every:

main navigation item
dropdown
subpage
tab
card CTA
breadcrumb
mobile bottom nav
admin nav

against actual functionality.

Target primary product structure:

PLAY

EVENTS

COURSES

COMMUNITY

EVENT MANAGER

TRACKERS

DG STATBOARD

MORE / ACCOUNT where needed.

No redundant top-level products.

==================================================
4. PLAY IS THE HOME PAGE
==================================================

Verify Play is the default signed-in landing experience.

It should answer:

What can I play right now?
Who wants to play?
What are my friends doing?
What Events are nearby?
What League is happening tonight?
Do I have a Round in progress?
What am I registered for next?

Primary elements:

Start Round
Resume Round
Looking to Play
Open Rounds
Friends Playing
Today's Events/Leagues
My Next Event
local activity
quick Community access
Clubhouse when relevant.

Remove business-dashboard feeling.

==================================================
5. PLAY SOCIAL MATCHING
==================================================

Fully complete:

Looking to Play
Open Rounds
player queue
friend activity
match suggestions
course/time preference
join/invite flow
group formation
Start Round handoff.

Ensure status automatically clears/expires appropriately.

Never publicly expose precise player GPS coordinates.

==================================================
6. COMMUNITY
==================================================

Verify Social Feed + Community are truly unified.

Community primary screen should be the Feed.

Integrated areas:

Feed
People
Friends/Crew
Clubs
Messages/DGIM
Marketplace
Lost & Found
Community Events discovery.

Remove duplicate Overview pages that provide no additional purpose.

==================================================
7. EVENTS — PLAYER DISCOVERY PRODUCT
==================================================

Events must be for:

DISCOVERING
TRACKING
REGISTERING
FOLLOWING
PLAYING.

NOT Event administration.

Complete:

All Events
Tournaments
Leagues
Series
Community/Outreach
My Events & Calendar
Map
Cards
Table
Calendar
week/date views
distance/search/filtering.

Verify PDGA/UDisc/Disc Golf Scene/DGD listings reconcile correctly.

==================================================
8. EVENT MANAGER — CREATION & OPERATIONS
==================================================

All Event creation/management belongs here.

Target navigation:

Dashboard
Events
Series & Leagues
Team
Organization.

One primary:

+ CREATE EVENT.

Event types enable modules rather than spawn incompatible products.

==================================================
9. EVENT CREATION FLOW
==================================================

Make creation fast.

Initial required information should be roughly:

Name
Type
Date/time
Host
Location/Course when applicable.

Create workspace quickly.

Advanced configuration happens after creation.

Do not require irrelevant fields.

==================================================
10. SERIES / RECURRING LEAGUES
==================================================

Audit this carefully.

SERIES itself does NOT require a Course.

Individual Event occurrences may have different:

Courses
Layouts
Dates
formats.

Support:

Edit series defaults

Apply changes to:
Future Events
All eligible Events
Selected Events

and:

Edit this Event only.

A missing Series-level Course must NEVER block Series editing.

==================================================
11. SERIES SCORING
==================================================

Fully complete:

points
placement points
attendance points
bonuses
drops
best-X Events
qualification minimums
division rules
ties
finale weighting
podium cut
awards
manual adjustments
audit history.

Build dynamic Series standings.

Support Region Rumble-like structure.

==================================================
12. SERIES SCOREBOARD
==================================================

Create visually polished:

Series leaderboard

division standings

player Event-by-Event breakdown

points trajectory

qualification status

finale scenarios

podium movement.

Event finale should be capable of live dynamic Series implications.

==================================================
13. SERIES / EVENT PROMOTION
==================================================

Event staff tools should support growth.

Complete:

share cards
registration links
QR codes
social post assets
email/text copy
registration progress
waitlist
spots remaining
deadline reminders
schedule graphics
Course preview links
Series standings promotion
sponsor graphics.

Do not require Event staff to leave DGD to create basic promotion material.

==================================================
14. EVENT WORKSPACE
==================================================

Verify one coherent workspace.

Recommended contextual modules:

Overview
Course & Rounds
Players
Team
Operations
Finance
Results.

Hide modules irrelevant to the Event type.

==================================================
15. EVENT OVERVIEW
==================================================

Make this mission control.

Show:

Event status
countdown
registration
readiness
Course/Layout
staff
tasks
weather
open issues
recent activity
next recommended action.

No large empty cards.

==================================================
16. EVENT COURSE & ROUNDS
==================================================

Complete:

Course
Layout
Layout Version
round count
division/pool assignment
multi-Course Events
start format
tee times
shotgun
Event Overlay
temporary OB/Mando/DZ/Holes.

Events pin exact Layout Versions.

Never silently update published Event structure when current Course changes.

==================================================
17. EVENT TEAM
==================================================

Complete server-authoritative roles/capabilities.

Examples:

Owner
TD
Co-TD
Course Lead
Check-in
Scoring
Finance
Volunteer Lead
Media
Staff
Viewer.

Event role ≠ Course role.

==================================================
18. EVENT OWNER PROTECTION
==================================================

Only creator/owner or explicit transferred ownership should control critical
Event identity.

Critical actions include:

ownership
deleting Event
major structural configuration
official result finalization
financial finalization
staff role escalation.

Support ownership transfer with audit history.

==================================================
19. EXTERNAL EVENT OWNERSHIP
==================================================

Audit imported Event ownership logic.

For:

PDGA
Disc Golf Scene
UDisc

do NOT let arbitrary DGD users claim/edit an imported Event.

Use trustworthy linkage/verification evidence.

If ownership cannot be established:

Event remains read-only imported data

until legitimate organizer claim is verified.

==================================================
20. EVENT OPERATIONS
==================================================

Fully complete:

Tasks
Volunteers
Check-in
Player Packs
Inventory
Announcements
Course Setup
Incidents
Event Day.

Make Event Day highly mobile optimized.

==================================================
21. REGISTRATION
==================================================

One canonical Event registration/player record.

Complete:

capacity
division caps
waitlist
deadlines
payment status
waiver
custom questions
team registration
guest/external player support
PDGA lookup
DGD player linkage.

Concurrency must prevent oversubscription.

==================================================
22. PLAYER QR
==================================================

Permanent Player QR uses stable secure identity token.

It MUST NOT contain mutable profile values directly.

Scanning resolves current server-side information.

It is not authentication.

It cannot grant account access.

==================================================
23. EVENT QR
==================================================

One Event QR may be lifecycle aware.

Before registration:
Event information.

Registration open:
registration.

Event day:
check-in.

After Event:
results.

==================================================
24. RAPID CHECK-IN
==================================================

Complete staff rapid scan:

scan Player QR
→ find registration
→ check in

or:

scan unregistered player
→ Quick Register
→ Check In.

Target:
roughly 1–3 seconds after successful scan for pre-registered players.

Include manual search fallback.

==================================================
25. KIOSK
==================================================

Complete secure Event Kiosk.

Only Event-safe fields.

Reset after each player.

Protected staff operations require staff authorization.

==================================================
26. PLAYER PACKS
==================================================

Track:

issued
not issued
who issued
timestamp.

Prevent accidental double handout.

==================================================
27. PAYOUT ENGINE
==================================================

Complete shared payout engine across:

Tournament
League
Series Event
Finance
Results.

Support:

Singles
Doubles
Triples
larger teams.

Display:

team payout
per-player payout.

==================================================
28. PAYOUT MINIMUMS & ROUNDING
==================================================

Respect latest product rule:

minimum payout per player may be as low as:

$1.

Rounding may be:

nearest $1
nearest $5
custom supported increment
exact where supported.

Convenience settings must NEVER silently take earned money away from a player.

Preserve total purse accounting explicitly.

==================================================
29. PDGA PAYOUT REFERENCE
==================================================

Where DGD offers PDGA-guided sanctioned calculation:

keep:

official curve source/version

separate from:

current compliance ruleset/version.

Do not approximate official workbook curves if exact source data has not been
verified.

Historical Event snapshot preserves the versions used.

==================================================
30. CASH AMATEUR DGD EVENTS
==================================================

DGD Rules may permit amateur cash payouts independently of PDGA policy.

Do not hardcode PDGA Pro/Am payout assumptions into core DGD Event architecture.

==================================================
31. SIDE FUNDS / PRIZES
==================================================

Finance/Results must support a separate table for:

Ace Fund
50/50
CTP
Longest Putt
raffle/prize where applicable
other Event-defined prizes.

Track:

fund amount
winner
per-player payout
status
payment/award confirmation.

==================================================
32. PRIZE QR
==================================================

Where configured:

staff may scan Player QR

→ select Prize

→ confirm award.

Never award automatically from QR scan alone.

==================================================
33. SCORECARD — MOBILE FIRST
==================================================

The primary scoring screen must remain extremely simple.

Default:

full-screen Hole image/map

Hole
Par
Distance

large score controls

Previous Hole
Next Hole / Submit.

Everything else secondary.

==================================================
34. SCORECARD ADVANCED TOOLS
==================================================

Move advanced tools behind one obvious:

TOOLS / MORE

surface.

Not five competing tabs and menus.

Advanced tools may include:

Caddy
Card
Shot Tracking
Hole Details
Rules
Players
Round Menu.

==================================================
35. RECORD THROW
==================================================

Complete quick-select Throw Tracking.

Record:

Tee Shot
Upshot
Putt
Penalty where applicable.

Optional details:

disc
lie
distance
fairway
C1 in regulation
C2 in regulation
OB
made/missed putt
throw-in.

Make basic recording extremely fast.

==================================================
36. GPS SHOT TRACKING
==================================================

Fix obvious invalid-distance cases.

Never show values such as:

88,398 ft to Basket

without flagging/rejecting bad GPS state.

Validate:

GPS accuracy
coordinate sanity
Hole bounds
distance thresholds.

Gracefully fall back if location unavailable.

==================================================
37. CADDY
==================================================

Digital Caddy must use exact:

Course
Layout Version
Tee
Basket
Hole
Event Overlay
current weather when available
player bag data.

Do not generate advice from placeholder geometry.

==================================================
38. COURSE TOTALS
==================================================

Never show Course total Par without identifying the Layout.

Example:

Main 21 · Par 68

not merely:

Course Par 68.

Players should also see:

current score relative to Par
projected/available DGD Round Rating where legitimate.

==================================================
39. ROUND RATING
==================================================

DGD Round Rating:

0–1000 display scale

whole-number presentation.

Do not calculate official/persisted rating state only from page load.

Use server-authoritative rating pipeline.

==================================================
40. DGD PLAYER RATING
==================================================

Audit V1.3 production implementation.

Keep:

V1.2 frozen comparison/control
historical model/version metadata.

Verify:

eligible physical Round deduplication
chronological update
historical replay
source provenance
no PDGA/UDisc blending.

==================================================
41. UDISC ROUND ELIGIBILITY
==================================================

Preserve rules:

singles
current player on card
at least 2 participants

can qualify according to current model.

Solo excluded.

Doubles/team excluded.

Native UDisc rating preserved when supplied.

Do not invent missing native rating.

==================================================
42. PDGA HISTORY
==================================================

DGD may use valid older physical PDGA Rounds beyond official current PDGA
rating window.

Official PDGA section continues to reflect PDGA's own current official rules.

==================================================
43. STATBOARD
==================================================

Verify cohesive Statboard:

Overview
Ratings
Rounds
Courses
Events
Scoring
Development.

Research restricted where appropriate.

Use persisted/canonical facts.

No fake:

Default Layout
Par 54.

==================================================
44. DGD TIER
==================================================

Completely separate from playing skill.

Rating:
ability.

Tier:
verified experience/contribution/service.

Green
Yellow
Bronze
Silver
Gold.

Rank inside Tier by DGD Rating.

Never combine them into one power score.

==================================================
45. COURSES — DIRECTORY
==================================================

One national Course Directory.

Map + search + cards/table.

Every canonical public Course with usable representative location must be
eligible for map display regardless of Hole-map completeness.

Use clustering when zoomed out.

==================================================
46. ONE COURSE MAP / ONE COURSE STUDIO
==================================================

New Course and Edit Course use the SAME:

map
Course Studio
database
physical asset model
renderer.

No separate Course Builder implementation.

From Directory:

[Add Course]

or click existing Course:

[Edit / Suggest Correction]

depending permissions.

==================================================
47. COURSE STUDIO
==================================================

Final navigation:

Course
Map
Layouts
Signage
Caddy Book
Sponsors
Public Page.

Simple interactive design-tool feel.

Not a GIS admin console.

==================================================
48. COURSE PHYSICAL ARCHITECTURE
==================================================

Course

→ Physical Holes

→ Tees

→ Basket Positions

→ Layouts

→ Layout Versions.

Layout references physical assets.

Copying Layout does not copy physical geometry.

==================================================
49. COURSE MAP EDITOR
==================================================

Final desktop interaction:

large map

compact tool palette

contextual selected-object inspector

minimal permanent sidebars.

Primary objects:

Tee
Basket
Flight Path
Mando
OB
Hazard
DZ
Island
terrain
amenities.

==================================================
50. COURSE MAP BASE LAYERS
==================================================

One shared map implementation everywhere.

Support:

Street
Satellite
Hybrid
Terrain.

Ensure high-detail imagery does not disappear/turn blank/gray at useful Course
editing zoom levels.

Provide graceful provider fallback.

==================================================
51. COURSE ATLAS
==================================================

Convert Atlas into the automated maintenance appliance already specified.

Normal admin view:

[UPDATE COURSE ATLAS]

Status
coverage
latest changes
Review Issues.

Advanced ingestion internals go under:

Advanced Diagnostics.

==================================================
52. COURSE ATLAS AUTOMATION
==================================================

One orchestrated pipeline:

Discover
Ingest
Normalize
Match
Locate
Reconcile
Geometry
Layouts
Validate
Publish safe data
Review exceptions
Report.

Durable server-side work.

Closing browser does not stop it.

==================================================
53. COURSE ATLAS BREADTH TARGET
==================================================

Do not require perfect mapping.

States:

MAP NEEDED
PARTIAL MAP
COMMUNITY MAP
VERIFIED MAP.

Goal:
most Courses get useful starter maps that users can improve.

==================================================
54. COURSE DATA GAP RULE
==================================================

No unexplained missing data.

Every missing item should have a reason/status such as:

SOURCE DOES NOT PROVIDE
NO GEOMETRY FOUND
NEEDS FIELD MAPPING
SOURCE CONFLICT
AWAITING REVIEW
NOT APPLICABLE.

Do not fabricate the missing value.

==================================================
55. COURSE INGESTION
==================================================

Audit all supported source ingestion.

PDGA
UDisc
Disc Golf Scene
open map data
DGD native.

Preserve source snapshots/provenance.

One canonical Course may link multiple source listings.

==================================================
56. FALSE COURSE CLASSIFICATION
==================================================

Ensure:

Basket #5
Hole 1
Tee 7
Practice Basket
Disc Golf Net

do not become canonical Course records.

Repair historical false positives where safe.

==================================================
57. COURSE LOCATION
==================================================

Backfill/fix Courses with:

missing
approximate
town-center

coordinates.

Maintain location confidence.

Do not present approximate point as verified exact.

==================================================
58. COURSE GEOMETRY
==================================================

Continue national geometry harvesting.

Preserve:

source
confidence
verification.

Never overwrite verified steward geometry because an external source differs.

==================================================
59. COURSE CONDITIONS
==================================================

Complete:

condition reports
duplicate report detection
verification
freshness/recheck
offline report saving
Course status
Hole status
steward resolution.

Temporary condition does not necessarily alter permanent Course geometry.

==================================================
60. COURSE STEWARDSHIP
==================================================

Complete:

Course Steward
Trusted Contributor
Course Admin
Global Admin.

Include:

request/claim
approval
role management
history.

==================================================
61. COURSE SUBMISSIONS
==================================================

Anyone may create/submit a legitimate new Course.

After approval:

large structural changes require appropriate review.

No self-approval where policy prohibits it.

==================================================
62. COURSE SIGNAGE
==================================================

Finalize professional automatic Tee Sign renderer.

Every line/feature should correspond to real Course information.

Support:

multiple Tees
multiple Basket positions
current pin
distance matrix
flight routes
large trees
woods
water
OB
Mando
DZ
topography
elevation
distance guides
QR
sponsors.

==================================================
63. SIGNAGE DATA ACCURACY
==================================================

Distance guides must be true Tee-centered physical distances.

Trees/terrain correspond to canonical features.

Do not invent decorative trees/fairways.

Unknown Par means:

NEEDS PAR

not print-ready.

==================================================
64. CURRENT BASKET POSITION
==================================================

Complete current Basket operational state.

Authorized maintainers may set:

A/B/C etc.

Track history.

Digital Course/Caddy/sign previews update.

Historical pinned Event layouts remain unchanged.

==================================================
65. COURSE PRESENTATION ENGINE
==================================================

One renderer powers:

Hole Sign
Course Overview
Course Map Sign
Information Board
Caddy Book
Digital Caddy
Event Guide.

Do not redraw geometry per product.

==================================================
66. COURSE OVERVIEW
==================================================

Automatically produce professional illustrated whole-Course map from canonical
geometry.

Show appropriate:

Hole routes
numbers
woods
water
paths
parking
restroom
practice
Course entrance
major rules
amenities.

Layout-aware.

==================================================
67. CADDY BOOK
==================================================

One-click professional generation from:

Course
Layout Version
optional Event Overlay.

Generate:

cover
overview
rules
Hole pages
sponsors.

True vector PDF output where supported.

==================================================
68. LAYOUT STUDIO
==================================================

Complete:

arbitrary Hole count
skip/add/reorder
special labels
multiple Tees/Baskets
copy
bulk variants
draft/publish
versioning
effective dates
dependency warnings.

==================================================
69. TRACKERS
==================================================

Verify Event Tracker and Player/Crew Tracker use canonical entities.

Following = subscription.

Do not create duplicate Event/player objects for each follower.

==================================================
70. TRACKER SCORING FIELDS
==================================================

Maintain separate concepts:

ROUND_SCORE
ROUND_TO_PAR
EVENT_TOTAL_SCORE
EVENT_TOTAL_TO_PAR
CURRENT_ROUND_THRU
ROUNDS_COMPLETED.

No overloaded score field.

==================================================
71. DGD RULEBOOK
==================================================

Complete editable/versioned DGD Rules & Standards system.

Documents may include:

Official Rules
Competition Manual
Divisions
Payout Standards
Course Standards
Event Standards
Code/Conduct where appropriate.

Do not permanently copy PDGA text.

DGD owns its rules.

==================================================
72. RULE EDITOR
==================================================

Authorized Rules admins can:

add
edit
retire
renumber
version
publish.

Historical Events retain referenced ruleset/version.

==================================================
73. RULE LINKS
==================================================

Event rules may reference:

DGD rule numbers.

Caddy/rules UI and Ask Ace can resolve them.

==================================================
74. ASK ACE — RULES
==================================================

When answering rules questions:

ground responses in the active DGD ruleset.

Clearly distinguish:

DGD
PDGA

if both are available.

==================================================
75. DIVISIONS
==================================================

Complete configurable DGD division engine.

Include planned age protection including:

30+
40+
etc. as defined.

Do not block production on arbitrary hardcoded thresholds.

Use versioned Division rules.

==================================================
76. DIVISION THRESHOLDS
==================================================

The previously undecided rating limits for:

Amateur 1–4
30+/40+ Amateur

must be resolved before public Competition rules are marked final.

If product owner has not specified them:

do NOT invent permanent policy.

Provide an admin Rules/Division configuration requiring final approval.

==================================================
77. DGD AMATEUR CASH
==================================================

DGD rules must be able to allow Amateur divisions to receive cash.

Do not inherit PDGA plastic/merch assumptions into DGD rules.

==================================================
78. CLUBHOUSE
==================================================

Complete Clubhouse 2.0 as a real staging/social product.

Two contexts:

Event Clubhouse
Local Clubhouse.

==================================================
79. EVENT CLUBHOUSE
==================================================

Show:

checked-in count
here-now count
My Card
division/pool/start
countdown
staff announcements
Ready status
working mini-games
scorecard handoff.

==================================================
80. LOCAL CLUBHOUSE
==================================================

Show:

Looking to Play
Open Rounds
friends online/playing
course lobbies
matchmaking
game challenges.

==================================================
81. CLUBHOUSE GAMES
==================================================

Do not ship fake games.

Initial fully working production games:

Putting
CTP
Trivia.

Any unfinished game:

remove from production UI
or label Coming Soon outside primary flow.

==================================================
82. CLUBHOUSE PRESENCE
==================================================

Use temporary realtime presence for:

currently in room
activity
zone/game.

Persistent Event check-in remains separate durable data.

==================================================
83. CLUBHOUSE GAME RESULTS
==================================================

Casual only.

Never affect:

DGD Rating
official Event Results
Series standings.

==================================================
84. MESSAGING / DGIM
==================================================

Audit:

direct messaging
Event rooms
friend conversation
notifications/unread.

Resolve intermittent message issues.

Avoid duplicated chat systems.

Clubhouse ephemeral chat remains separate from durable DGIM.

==================================================
85. NOTIFICATIONS
==================================================

Build consistent notification architecture for:

friend activity
invites
Event updates
registration
check-in/card
Series changes
Course change approval
messages
staff tasks.

Respect user preferences.

Avoid notification spam.

==================================================
86. WEATHER
==================================================

Verify Course/Event weather modules.

Do not block core workflows when weather provider is unavailable.

Event weather alerting should be contextual and useful.

==================================================
87. OFFLINE / WEAK SIGNAL
==================================================

Test:

Scorecard
Course condition report
Course field mapping
Event check-in where feasible
active Round state.

Cache appropriate data.

Use stable operation IDs to avoid duplicate sync after reconnect.

==================================================
88. MOBILE APP EXPERIENCE
==================================================

Audit EVERY major route at:

small phone
large phone
tablet.

Remove:

desktop tables squeezed onto mobile
multi-column dashboards
tiny controls
horizontal-scroll dependence
giant toolbars.

==================================================
89. DESKTOP EXPERIENCE
==================================================

Desktop should feel like a modern interactive app/site.

Avoid:

old-style admin portal visual density
giant full-width spreadsheets
unnecessary permanent filters
large blank boxes.

Use whitespace and contextual detail.

==================================================
90. RESPONSIVE PRODUCT DIFFERENTIATION
==================================================

Do not simply shrink desktop UI.

Examples:

Mobile Scorecard:
minimal scoring.

Desktop Scorecard:
more optional stats/map.

Mobile Course mapping:
GPS/map missing.

Desktop Course Studio:
full design.

Mobile Event Day:
operations-first.

Desktop Event Manager:
planning-first.

==================================================
91. ACCESSIBILITY
==================================================

Target practical WCAG 2.2 AA quality.

Audit:

keyboard navigation
focus
contrast
semantic labels
screen-reader names
touch targets
non-color status indicators
modal focus
reduced motion.

==================================================
92. PERFORMANCE
==================================================

Audit:

bundle size
route splitting
map payload
query count
N+1 queries
duplicate subscriptions
large image loading
unnecessary realtime channels
unbounded list fetches.

Set measurable budgets.

==================================================
93. MAP PERFORMANCE
==================================================

Never load national Course Hole geometry on Course Directory.

National map:
Course points/clusters.

Selected Course:
Course detail.

Course Studio:
that Course's geometry.

==================================================
94. DATABASE QUERY PERFORMANCE
==================================================

Identify slow/high-frequency queries.

Verify appropriate indexes for:

foreign keys
canonical IDs
source IDs
Event dates
Course spatial fields
player lookup
registration uniqueness
round lookup
series standings.

Do not add speculative indexes without query evidence.

==================================================
95. DATA INTEGRITY — GLOBAL
==================================================

Run a complete database integrity audit.

Find:

orphan foreign keys
duplicate canonical entities
duplicate physical Rounds
duplicate registrations
duplicate Event results
source links pointing nowhere
Layout slots missing assets
Round → wrong Layout Version
Event round missing pinned Layout Version
invalid Course coordinates
impossible distances
bad Pars
stale duplicate readiness flags.

==================================================
96. PHYSICAL ROUND DEDUPLICATION
==================================================

One physical Round may have multiple source links/ratings.

It must count once for DGD.

Verify across:

PDGA
UDisc
DGD-native.

==================================================
97. DATA GAP LEDGER
==================================================

Create a global Data Gap Ledger.

Every required missing/invalid field becomes either:

FIXED

INTENTIONALLY UNKNOWN

SOURCE UNAVAILABLE

NOT APPLICABLE

REQUIRES USER/STEWARD INPUT

BLOCKS PRODUCTION.

No unexplained critical NULLs.

==================================================
98. PLACEHOLDER SCAN
==================================================

Search code and database for placeholder concepts including:

Default Layout
Par 54
Par 3 fallback
Projected DGD Rating label
fake scores
dummy players
test Event IDs
Lorem Ipsum
TODO production
hardcoded development URLs
magic sample data.

Remove/replace production-invalid placeholders.

==================================================
99. DATE / TIME
==================================================

Audit timezone handling.

Store appropriate UTC timestamps while preserving Event-local timezone.

Verify:

registration deadlines
tee times
League recurring dates
Event countdowns
notifications
Series schedules.

DST must not shift Event time incorrectly.

==================================================
100. MONEY
==================================================

Audit all financial values.

Use appropriate numeric/integer-cent model.

Avoid floating-point money errors.

Verify:

entry fee
payout
Ace Fund
50/50
expenses
player pack value
merchandise value
added cash.

==================================================
101. AUTHENTICATION
==================================================

Audit:

sign-up
sign-in
sign-out
password reset
email verification
MFA if enabled
session expiry
account recovery.

No dead-end states.

==================================================
102. AUTHORIZATION
==================================================

Build capability matrix across:

normal user
Event participant
Event staff
Event owner
Organization staff
Course contributor
Trusted Contributor
Course Steward
Course Admin
Rules Admin
Global Admin.

Test both allowed and denied operations.

==================================================
103. GLOBAL ADMIN
==================================================

Global Admin capabilities must be explicit and server-authoritative.

Do not infer global admin from editable user metadata.

Global override actions should be auditable.

==================================================
104. RLS — ALL EXPOSED TABLES
==================================================

Review every exposed table.

RLS required.

Do not assume:

TO authenticated

is authorization.

Policies must enforce:

ownership
membership
role
capability
visibility.

==================================================
105. UPDATE POLICIES
==================================================

For RLS updates:

verify required SELECT policy exists.

Use:

USING

and:

WITH CHECK

appropriately.

Prevent reassignment/ownership escalation.

==================================================
106. AUTH CLAIMS
==================================================

Do not use user-editable user_metadata for authorization.

Use trusted server/database/app metadata patterns where necessary.

==================================================
107. DATA API GRANTS
==================================================

Audit Data API grants separately from RLS.

Grant minimum required privileges.

Do not expose:

worker queues
raw ingestion
admin internals
secret/source snapshots

unnecessarily.

==================================================
108. VIEWS
==================================================

Audit every client-accessible view.

Current Supabase guidance must be checked before implementation.

Ensure views do not silently bypass required RLS.

Use security-invoker behavior where appropriate/currently supported.

==================================================
109. SECURITY DEFINER
==================================================

Inventory all SECURITY DEFINER functions.

For every one:

prove necessity.

Prefer SECURITY INVOKER.

If a privileged function is genuinely required:

keep outside exposed API where possible
validate auth inside
set safe search_path
revoke PUBLIC execution unless explicitly needed
grant narrowly.

==================================================
110. STORAGE
==================================================

Audit:

profile images
Course files
Event media
signage exports
Caddy Book files
sponsor logos
attachments.

Use Storage APIs.

Do not directly mutate Supabase storage metadata tables.

Test upload/update/delete permissions.

==================================================
111. REALTIME
==================================================

Audit every realtime channel.

Confirm:

purpose
scope
private/public
authorized participants
cleanup/unsubscribe.

Avoid one global noisy subscription.

==================================================
112. REALTIME AUTHORIZATION
==================================================

Use current Supabase Realtime authorization mechanisms.

Private Event/Clubhouse/game channels require proper read/write/presence access.

Do not modify Supabase-managed Realtime schema structures.

==================================================
113. QUEUES / BACKGROUND JOBS
==================================================

Audit:

Course Atlas
source ingestion
rating recalculation
notifications
exports
data backfills.

Jobs must be:

durable when required
idempotent
retryable
observable.

Do not run long national jobs from browser state.

==================================================
114. JOB FAILURE MODEL
==================================================

Every durable job:

queued
running
completed
retry
failed/dead-letter.

Capture:

attempt
error
last attempt
next retry
entity affected.

==================================================
115. CRON / SCHEDULED MAINTENANCE
==================================================

Review:

Course refresh
source refresh
rating updater
stale conditions
notifications
cleanup.

Prevent duplicate schedules.

==================================================
116. SOURCE RATE LIMITING
==================================================

Each external source has independent:

budget
backoff
retry
health.

One degraded provider does not halt all ingestion.

==================================================
117. SECRET SCAN
==================================================

Search:

frontend
repo
logs
Edge Functions
config
stored files

for secrets.

Never expose:

service-role keys
provider secrets
private API credentials.

==================================================
118. ABUSE / RATE LIMITING
==================================================

Rate-limit/guard:

auth attempts
messages
friend requests
Clubhouse reactions
game challenges
Course reports
claim requests
QR resolution
public lookups
expensive searches.

==================================================
119. INPUT VALIDATION
==================================================

Validate server-side:

IDs
numeric ranges
coordinates
money
dates
division
scores
Par
distance
payout settings
role changes.

Do not trust frontend validation.

==================================================
120. FILE VALIDATION
==================================================

Validate uploads:

type
size
content expectations

for:

Course map import
GPX
KML
GeoJSON
CSV
images
logos
attachments.

==================================================
121. OBSERVABILITY
==================================================

Create production health visibility.

Track:

frontend exceptions
Edge Function failures
database errors
job failures
ingestion health
realtime connection failure
slow API calls
source degradation.

==================================================
122. USER-FACING ERROR HANDLING
==================================================

Every feature needs:

loading
empty
offline
permission denied
source unavailable
retry
unexpected error

states.

No blank white panels.

No infinite spinners.

==================================================
123. ERROR BOUNDARIES
==================================================

A broken widget must not crash an entire critical page.

Add appropriate route/component isolation.

==================================================
124. AUDIT LOGS
==================================================

Maintain immutable/actionable audit history for critical changes:

Event ownership
Event structural changes
result finalization
payout finalization
Course structural approval
Course role changes
current pin official changes
Rule publication
global admin actions.

==================================================
125. BACKUP / RECOVERY
==================================================

Document and test recovery plan.

Confirm current Supabase backup/PITR configuration available for the deployed
plan.

At minimum test:

data restoration procedure/documentation

and application behavior if a deployment must be rolled back.

Do not claim disaster recovery is ready without verification.

==================================================
126. FEATURE FLAGS
==================================================

Experimental features should be behind explicit flags.

Examples if still incomplete:

advanced Clubhouse games
unvalidated rating preview
unfinished marketplace flows
experimental Course automation.

Do not expose partially working systems merely because routes exist.

==================================================
127. DEPRECATED FEATURES
==================================================

Remove or redirect old:

Social Feed route
old Course Builder
duplicate League management
old Event creation
legacy Caddy interfaces

once replacements are confirmed.

Do not leave navigable dead products.

==================================================
128. SEO / PUBLIC SHARING
==================================================

For public Course/Event/player-safe pages:

verify metadata
titles
Open Graph/social previews
canonical URLs
share links.

Do not expose private data in metadata.

==================================================
129. PRIVACY
==================================================

Audit public projections of:

player profile
location
Clubhouse
Event registration
messages
Course contribution
QR lookup.

Expose only intended fields.

==================================================
130. ACCOUNT CONTROLS
==================================================

Verify:

profile edit
privacy
notifications
blocked users
linked disc-golf identities
delete/deactivate workflow as product supports.

==================================================
131. IMPORTED EXTERNAL PLAYERS
==================================================

Read-only imported PDGA/external player identities must not require fake DGD
accounts.

Support safe later claim/linking.

==================================================
132. TEST DATA / SANDBOX
==================================================

Clearly separate:

production
sandbox/test

data.

No test player/Event/Course leakage into public production results.

==================================================
133. AUTOMATED TEST SUITE
==================================================

Build/fix tests at appropriate levels:

unit
database
RLS
integration
end-to-end
visual/regression where useful.

Do not attempt 100% superficial coverage.

Focus on critical workflows.

==================================================
134. REQUIRED END-TO-END TEST — NEW PLAYER
==================================================

New user:

create account
profile
find Course
find Event
register
check in
play Round
submit score
see Statboard.

PASS required.

==================================================
135. REQUIRED END-TO-END TEST — CASUAL ROUND
==================================================

Player:

Play
Looking to Play
form group
start Round
score
record throws
finish
Round appears once in history
DGD updater processes eligible Round.

PASS required.

==================================================
136. REQUIRED END-TO-END TEST — TD
==================================================

TD:

Create Event
select Course/Layout
configure registration
add staff
publish
promote
register players
check in via QR
run Event
score/results
payout
complete/archive.

PASS required.

==================================================
137. REQUIRED END-TO-END TEST — SERIES
==================================================

Create Series.

Add Events at multiple Courses/dates.

Edit Series defaults.

Edit one occurrence.

Score Events.

Update standings.

Run finale.

Finalize Series.

PASS required.

==================================================
138. REQUIRED END-TO-END TEST — COURSE CONTRIBUTOR
==================================================

User:

Add Course
submit
admin/steward approval
map Hole
add Tee/Basket
create Layout
publish
generate sign
generate Caddy Book.

PASS required.

==================================================
139. REQUIRED END-TO-END TEST — COURSE UPDATE
==================================================

Move approved Basket through authorized workflow.

Verify:

Course map
layout where applicable
tee sign
Caddy Book
digital Caddy

update correctly.

Historical Event snapshot does NOT change.

PASS required.

==================================================
140. REQUIRED END-TO-END TEST — GLOBAL ADMIN
==================================================

Global admin can perform intended overrides.

Normal user cannot.

Staff cannot escalate itself.

Course Steward cannot manage unrelated Course.

Event staff cannot change unrelated Event.

PASS required.

==================================================
141. REQUIRED END-TO-END TEST — QR
==================================================

Printed Player QR generated before profile/rating change.

Update profile/rating.

Scan same QR.

Expected:
new current safe data.

Also test:

registered
walk-up
already checked in
invalid/revoked QR.

PASS required.

==================================================
142. REQUIRED END-TO-END TEST — PAYOUT
==================================================

Test:

singles
doubles
triples
$1 minimum
$1 rounding
$5 rounding
exact mode
ties
Ace Fund
50/50
prizes
insufficient pool
remainder.

No negative values.

No overpayment.

No silent lost player earnings.

PASS required.

==================================================
143. REQUIRED END-TO-END TEST — RATINGS
==================================================

Import/link physical Round from multiple sources.

Confirm:

one canonical physical Round
native source ratings preserved
one DGD observation
persisted rating result
replay works
page refresh does not mutate rating.

PASS required.

==================================================
144. REQUIRED END-TO-END TEST — CLUBHOUSE
==================================================

Event player:

check in
enter Clubhouse
presence visible to another user
play working Putting game
receive announcement
see Card
start scorecard.

PASS required.

==================================================
145. MULTI-DEVICE TEST
==================================================

Test simultaneously with:

two players
one Event staff member.

Verify realtime/concurrency.

==================================================
146. BROWSER / DEVICE MATRIX
==================================================

At minimum test current supported versions of:

Chrome desktop
Edge
Safari
Chrome Android/mobile equivalent
Safari iPhone/mobile equivalent.

If a specific browser is unsupported:

document it.

==================================================
147. PERFORMANCE LOAD TESTS
==================================================

Test representative high-load cases:

large Event registration
100+ checked-in Event
live leaderboard
busy Clubhouse
national Course map
large 27-Hole Course editor
national Atlas job backlog
Series with many Events.

==================================================
148. CONCURRENCY TESTS
==================================================

Two staff scan same player.

Expected:
one check-in.

Two people take final division spot.

Expected:
one succeeds / proper waitlist.

Two staff issue player pack.

Expected:
duplicate prevented.

Two clients finish same game turn.

Expected:
consistent state.

==================================================
149. DATA BACKFILL
==================================================

Any new canonical rules introduced during this phase require explicit backfill.

Backfill must be:

idempotent
auditable
counted
verified.

Do not leave old rows in incompatible state.

==================================================
150. MIGRATIONS
==================================================

For database changes:

follow current Supabase guidance.

Do not blindly create migration history entries while iterating.

Verify SQL change first.

Run database/security advisors.

Then create clean committed migration using current supported workflow.

==================================================
151. CURRENT SUPABASE VERIFICATION
==================================================

Before implementation:

check current Supabase changelog and docs for relevant breaking changes.

In particular verify current guidance for:

Auth
RLS
Data API grants
Views
Realtime authorization
Storage
Queues
Cron
Edge Functions.

Do not rely on old Supabase assumptions.

==================================================
152. SECURITY ADVISORS
==================================================

Before launch:

run available database/security advisors.

Zero unresolved ERROR-level security findings.

Review warnings individually.

Do not automatically silence them.

==================================================
153. DATABASE INTEGRITY REPORT
==================================================

Generate exact counts for:

orphan records
duplicate canonical entities
duplicate Rounds
duplicate registrations
unlinked source records
invalid Layout references
missing required Par
missing Event Layout versions
invalid coordinates
failed backfills
dead jobs.

==================================================
154. DATA QUALITY DOES NOT REQUIRE WORLD PERFECTION
==================================================

Important:

Production does NOT require every U.S. Course to have every Tee/Basket mapped.

Production DOES require:

no misleading fabricated information

a known state for gaps

community/steward improvement path

working Course Directory

reliable canonical ownership.

==================================================
155. P0 / P1 / P2 CLASSIFICATION
==================================================

Classify all remaining issues.

P0 — LAUNCH BLOCKER

security vulnerability
data corruption
payments/payout corruption
wrong authorization
score/result corruption
rating corruption
critical crash
lost user data.

P1 — MUST FIX BEFORE PUBLIC PRODUCTION

major broken workflow
severe mobile failure
major data inconsistency
important dead feature
unexplained data loss/gap.

P2 — POST-LAUNCH ENHANCEMENT

visual improvement
non-critical automation
rare edge-case UX
optional advanced game/theme.

==================================================
156. LAUNCH GATE
==================================================

PRODUCTION READY requires:

P0 = 0

P1 = 0

All production-critical E2E tests = PASS

Security review = PASS

RLS review = PASS

Data API grants = PASS

Critical DB integrity checks = PASS

Required backfills = COMPLETE

Background jobs = HEALTHY

Mobile critical workflows = PASS

Desktop management workflows = PASS

No known secrets exposed

No fake placeholder production data.

==================================================
157. DO NOT HIDE FAILURE TO GET A GREEN REPORT
==================================================

If launch gate fails:

report:

NOT READY FOR PRODUCTION.

Fix the issue.

Re-run gate.

Do not redefine failed test as optional without product-owner approval.

==================================================
158. DEPLOYMENT SAFETY
==================================================

Before final production publish:

capture:

migration state
release version
feature flags
known-good rollback point
production environment validation.

Use a staged release if possible.

==================================================
159. LIVE SMOKE TEST
==================================================

After actual production publish:

test LIVE production URLs.

Not preview/staging.

Test:

sign-in
Play
Courses
Event discovery
Event registration
scorecard
Community
Statboard
Event Manager authorized route.

==================================================
160. MONITOR AFTER RELEASE
==================================================

For initial release window watch:

auth errors
DB errors
Edge Function failures
job queue
realtime
frontend exceptions
source ingestion
rating jobs
Course Atlas jobs.

Create clear operational dashboard.

==================================================
161. FINAL UX POLISH
==================================================

Across all pages:

remove cramped visual density

reduce redundant labels

use one primary CTA

use progressive disclosure

prefer visual hierarchy over card proliferation

remove giant empty states

remove technical implementation language from player-facing UI.

==================================================
162. EMPTY STATES
==================================================

Every empty state should answer:

What is this?

Why is it empty?

What should I do next?

Example:

No open rounds nearby.

[I'm Looking to Play]

not a giant blank card.

==================================================
163. LOADING STATES
==================================================

Use stable skeletons where appropriate.

Avoid content jumping.

No infinite loading.

==================================================
164. COPY CONSISTENCY
==================================================

Standardize naming.

Examples:

Event Manager
not Event Management / TD Dashboard / Tournament Manager randomly.

Course Studio
not Course Builder / Builder / Course Editor depending route.

DGD Rating

DGD Tier

Caddy Book

Clubhouse.

==================================================
165. PRODUCTION FEATURE MATRIX
==================================================

Produce final matrix:

MODULE
FEATURE
STATUS
MOBILE
DESKTOP
DATA
SECURITY
E2E
NOTES.

Every listed production feature must be:

PASS

or explicitly excluded/flagged experimental.

==================================================
166. FINAL DATA GAP REPORT
==================================================

Report every remaining gap grouped by:

Player

Round

Course

Layout

Event

Series

Registration

Result

Rating

Payout

Rules

Source ingestion.

For each:

count
severity
reason
whether it blocks launch.

There must be ZERO unexplained P0/P1 data gaps.

==================================================
167. FINAL ROUTE REPORT
==================================================

Return:

all active public routes

authenticated routes

admin routes

deprecated redirects

unreachable routes removed.

==================================================
168. FINAL SECURITY REPORT
==================================================

Return:

tables reviewed

RLS coverage

views reviewed

functions reviewed

Data API grants reviewed

Storage reviewed

Realtime reviewed

admin permission tests

security advisor results

secret scan.

==================================================
169. FINAL PERFORMANCE REPORT
==================================================

Return:

largest routes/bundles

slowest critical queries

slowest Edge Functions

map performance

critical interaction latency

optimizations completed

remaining P2 opportunities.

==================================================
170. FINAL PRODUCTION CERTIFICATE
==================================================

At the very end output exactly:

DGD PRODUCTION READINESS

Overall:
PASS / FAIL

P0 blockers:
#

P1 blockers:
#

Production-critical E2E:
passed / total

Mobile critical flows:
passed / total

Desktop management flows:
passed / total

Database integrity:
PASS / FAIL

Security:
PASS / FAIL

RLS:
PASS / FAIL

Data API grants:
PASS / FAIL

Background jobs:
PASS / FAIL

Course Atlas:
PASS / FAIL

Rating pipeline:
PASS / FAIL

Event operations:
PASS / FAIL

Scoring:
PASS / FAIL

Course Studio:
PASS / FAIL

Clubhouse:
PASS / FAIL

Rules:
PASS / FAIL

Known non-blocking gaps:
#

Deployment recommendation:
READY TO PUBLISH
or
DO NOT PUBLISH.

==================================================
171. FINAL PRODUCT STANDARD
==================================================

The final DGD platform should feel like one product.

A player should be able to:

find people
find a Course
find an Event
register
check in
hang out
play
score
track stats
see results
follow friends
improve Courses

without understanding the internal architecture.

A TD should be able to:

create
promote
staff
register
check in
run
score
pay out
publish
close

an Event entirely inside DGD.

A Course steward should be able to:

map
maintain
publish
generate signs
generate Caddy Books
handle conditions
approve corrections

from one Course Studio.

A global admin should be able to:

monitor
reconcile
moderate
repair
audit
control

the platform without normal users inheriting those powers.

DO NOT OPTIMIZE FOR THE NUMBER OF FEATURES DGD HAS.

OPTIMIZE FOR THE NUMBER OF COMPLETE, TRUSTWORTHY WORKFLOWS.

THE FINAL STANDARD IS:

NO FAKE DATA.
NO DUPLICATE TRUTH.
NO DEAD BUTTONS.
NO SECRET ADMIN BYPASS.
NO CRITICAL MOBILE DEAD ENDS.
NO UNEXPLAINED DATA CORRUPTION.
NO "WORKS IN PREVIEW" CLAIM WITHOUT REAL VERIFICATION.

ONE CONNECTED DISC GOLF PLATFORM.