PHASE — COURSE GEOMETRY HARVESTER 2.0
PHYSICAL ASSETS + ALTERNATE TEES/PINS + REVIEW MAP + GPS + AUTO-LAYOUTS

Continue the nationwide Tee Pad and Basket Harvester.

The first version currently:

- divides the United States into ~2,430 regions
- reads open map data region-by-region
- preserves source IDs/provenance
- retries failures
- attempts Course matching
- fills empty Tee/Basket spots when source Hole numbers are explicit
- protects existing DGD/steward coordinates
- flags moved accepted source points
- sends unnumbered Courses to Confirm Hole Order
- runs in the background.

Keep these protections.

Now turn this into the complete DGD physical Course geometry pipeline.

==================================================
PRIMARY OBJECTIVE
==================================================

For every canonical United States Course:

1. discover all legitimate Tee and Basket geometry available
2. preserve every useful source observation
3. resolve physical Holes
4. resolve ALL physical Tees
5. resolve ALL Basket Positions
6. build or improve canonical Layouts from those physical assets
7. identify exactly what still requires human mapping
8. provide field tools to finish the remaining gaps.

The final model must be:

COURSE
  ↓
PHYSICAL HOLES
  ↓
TEES + BASKET POSITIONS
  ↓
LAYOUTS REFERENCE THOSE ASSETS

Do NOT make physical geometry subordinate to an existing Layout.

==================================================
1. FIRST VERIFY THE EXISTING HARVESTER
==================================================

Before expanding functionality:

run several actual regions.

Do not rely on the first panel rendering successfully.

Test geographically separate regions containing known disc golf Courses.

At minimum test regions in:

Indiana
Illinois
Massachusetts
Texas
Colorado
California.

For each test region record:

source disc golf Courses found

source Tees found

source Baskets found

source Hole features found

matched canonical Courses

unmatched source Courses

matched Hole numbers

unassigned Tees

unassigned Baskets

coordinates accepted

coordinates sent to review.

If the first real region returns unexpected zero values:

STOP expansion

and diagnose the source query/parser first.

==================================================
2. INSPECT REAL SOURCE STRUCTURE
==================================================

Use actual returned features to improve matching.

Do not design solely around theoretical tags.

Capture examples of:

Course relations

Hole paths

Tee features

Basket features

Hole numbers

missing Hole numbers

multiple Tees

multiple Baskets

practice baskets

Courses sharing a property.

Build parser fixtures from real examples.

==================================================
3. PHYSICAL ASSETS MUST EXIST WITHOUT A LAYOUT
==================================================

Remove the architectural limitation:

"only fill empty Tee/Basket spots on existing Layouts."

Correct model:

Course geometry ingestion creates or matches:

physical_hole

tee

basket_position

first.

Layouts then reference them.

A Course with no Layout may therefore have:

18 physical Holes
18 Tees
18 Baskets
0 published Layouts.

The Auto-Layout Builder can then construct a source-backed Layout Draft.

==================================================
4. DO NOT CREATE FAKE PHYSICAL HOLES
==================================================

Still preserve the earlier rule:

reported_hole_count = 18

does NOT automatically create 18 physical Holes.

Physical Holes may be automatically created when source evidence explicitly
identifies actual Hole objects/endpoints.

==================================================
5. SUPPORT MULTIPLE TEES
==================================================

The current first version does not properly model extra Tee pads.

Fix this.

One physical Hole may have:

Main
Short
Long
Red
White
Blue
Gold
Pro
Am
Custom named

Tees.

Store each as a distinct canonical physical Tee.

Do NOT merely count:

second pad.

==================================================
6. TEE IDENTITY
==================================================

Canonical Tee should conceptually support:

tee_id
physical_hole_id
name
color
geometry
coordinate accuracy
surface where known
source state
verification state
created_at
updated_at.

Reuse the existing schema if equivalent structures already exist.

Do not create parallel Tee tables unnecessarily.

==================================================
7. SUPPORT MULTIPLE BASKET POSITIONS
==================================================

One physical Hole may have:

Main

A

B

C

Short

Long

Summer

Winter

other legitimate positions.

These are distinct:

BASKET POSITIONS.

Layouts reference the selected position.

==================================================
8. CURRENT BASKET VS POSITION
==================================================

Do not confuse:

physical Basket Position

with:

which position currently contains the basket.

If DGD later tracks current pin placement:

store that separately.

==================================================
9. PRACTICE BASKETS
==================================================

Practice Basket remains a Course-wide feature.

It must NOT become a Hole Basket merely because it is near a Hole.

Require structural evidence.

==================================================
10. SOURCE FEATURE PRESERVATION
==================================================

Do NOT discard a Tee/Basket just because DGD cannot currently assign it.

Store as:

UNASSIGNED_SOURCE_FEATURE.

Examples:

Unassigned Tee

Unassigned Basket

Possible Practice Basket

Unknown disc-golf target.

This allows future matching logic to improve without refetching source data.

==================================================
11. REPLACE SKIP WITH REVIEW
==================================================

Current logic skips Tee/Basket pairings under 60 ft or over 1,500 ft.

Change this.

Use distance primarily as:

SANITY SIGNAL

not:

automatic destructive rejection.

States:

VALID

SUSPICIOUS_SHORT

SUSPICIOUS_LONG

REVIEW_REQUIRED.

Disc golf can contain unusual legitimate Hole lengths.

Do not throw data away solely because a Hole is unusual.

==================================================
12. HOLE NUMBER MATCHING
==================================================

Strongest evidence:

explicit source Hole relation / ref.

Then consider:

Hole path endpoints

Tee/Basket source relationship

feature refs

Course relation

existing Hole geometry

layout data.

Number alone is useful but not sufficient in complex Courses.

==================================================
13. UNNUMBERED HOLES
==================================================

Do not immediately reduce every unnumbered Course to:

"guess walking order."

Build a stronger topology resolver first.

Use evidence such as:

Hole paths connecting Tee → Basket

source relation membership

relative feature groups

existing DGD Hole geometry

existing Layout Hole sequence

Course maps/imports

known Tee/Basket labels.

Only after structural evidence is exhausted should walking-order review be
needed.

==================================================
14. WALKING ORDER IS A PROPOSAL
==================================================

Rename:

Fill in walking order

to something safer:

PREVIEW PROPOSED HOLE ORDER.

Show:

source Tee

source Basket

proposed Hole number

distance

map.

User must confirm before canonical assignment.

Do not silently publish walking-order guesses.

==================================================
15. HOLE ORDER REVIEW MAP
==================================================

Build a real visual review tool.

For an unnumbered Course show:

all Tee candidates

all Basket candidates

existing physical Holes

proposed pairings

proposed sequence.

Use different symbols for:

Tee
Basket
existing verified assets
source candidates
conflicts.

==================================================
16. REVIEW ACTIONS
==================================================

Reviewer can:

Assign to Hole

Create Physical Hole

Pair Tee + Basket

Mark Practice Basket

Mark Alternate Tee

Mark Alternate Basket

Ignore invalid feature

Keep unassigned.

==================================================
17. DRAG / CLICK MATCHING
==================================================

Allow simple map-based matching.

Example:

Select Tee candidate
→ click Hole 7.

Select Basket candidate
→ click Basket Position B.

Do not require database-style forms.

==================================================
18. SOURCE DISAGREEMENT MAP
==================================================

Build:

GEOMETRY CONFLICT VIEW.

Overlay:

CURRENT DGD

OPEN MAP SOURCE

OTHER SOURCE

GPS CONTRIBUTION.

Show distance difference.

Example:

HOLE 12 BASKET

DGD Verified
●

Source Candidate
● 38 ft northeast.

Actions:

Keep Current

Use Candidate

Create Alternate Basket Position

Needs Field Check.

==================================================
19. NEVER AVERAGE CONFLICTING COORDINATES
==================================================

Two different source coordinates should not automatically become their
midpoint.

They may represent:

incorrect data

moved Basket

alternate Basket

different Tee

different Course.

Preserve both until resolved.

==================================================
20. ACCEPTED SOURCE POINT MOVEMENT
==================================================

Keep the first-version:

Moved since accepted

tracking.

Improve it.

Show:

previous source coordinate

latest source coordinate

movement distance

source version/change date.

Do not automatically move canonical geometry.

==================================================
21. SOURCE FEATURE DISAPPEARANCE
==================================================

Implement the missing deletion/staleness logic.

When previously known source feature disappears:

DO NOT delete canonical Tee/Basket.

Mark source observation:

SOURCE_MISSING

with:

last_seen_at

first_missing_at

consecutive_missing_scans.

==================================================
22. DELETION CONFIRMATION
==================================================

One missing scan is not enough to imply removal.

Require repeated evidence before marking:

SOURCE_REMOVED / STALE.

Even then canonical physical asset remains until appropriately corrected.

==================================================
23. ALTERNATE FEATURE DETECTION
==================================================

When multiple Tees/Baskets exist for same source Hole:

do not arbitrarily choose one.

Attempt to identify names/colors/positions.

If unknown:

Tee 1
Tee 2

or:

Basket Position 1
Basket Position 2

as temporary review labels only.

Do not publish ugly generated names unnecessarily.

==================================================
24. AUTO-LAYOUT BUILDER INTEGRATION
==================================================

Connect geometry harvesting directly to the DGD Auto-Layout Builder.

Once enough evidence exists:

Physical Holes
+
Tee/Basket relationships
+
Hole order
+
Par where available

may generate:

SOURCE-BACKED LAYOUT DRAFT.

==================================================
25. NO LAYOUT PAR INVENTION
==================================================

Geometry alone does not establish Par.

If Hole geometry exists but Par does not:

Layout can become:

MAP STRUCTURE READY

but NOT:

SCORING READY.

Unknown Par stays NULL.

==================================================
26. SOURCE-BACKED LAYOUT EXAMPLE
==================================================

Source proves:

Hole sequence 1–18

18 main Tees

18 main Basket Positions

but no Par.

Expected:

Physical Course:
complete geometry.

Layout Draft:
Main 18

Map Ready:
YES

Scoring Ready:
NO — Par missing.

This distinction is critical.

==================================================
27. MULTIPLE LAYOUT CONSTRUCTION
==================================================

If source evidence shows:

White Tee Layout

Blue Tee Layout

create two Layout Drafts referencing the same physical Holes.

Do not duplicate physical geometry.

==================================================
28. ALTERNATE PIN LAYOUT
==================================================

Same:

A Pins

B Pins

Mixed Championship Pins.

Layouts select different Basket Positions.

==================================================
29. EXISTING LAYOUT RECONCILIATION
==================================================

If canonical Layout already exists:

match source assets to it.

Do not create:

Main

Main Layout

Main 18

as duplicates.

==================================================
30. PUBLISHED LAYOUT PROTECTION
==================================================

New source geometry never mutates an immutable published Layout Version.

If required:

create proposed next version.

==================================================
31. STATE-BY-STATE DASHBOARD
==================================================

Implement the missing state drilldown.

Course Atlas → Geometry.

Columns:

State

Canonical Courses

Regions Read

Source-Mapped Courses

Matched Courses

Courses with Any Tee

Courses with All Primary Tees

Courses with Any Basket

Courses with All Primary Baskets

Fully Mapped

Review Required

Last Scan.

==================================================
32. STATE DETAIL
==================================================

Click:

Indiana.

Show:

Courses fully mapped

Closest to complete

No source geometry

Unmatched source Course

Needs hole-order review

Geometry conflicts.

==================================================
33. CLOSEST TO COMPLETE
==================================================

This should become a major operational queue.

Example:

COUNTRYSIDE PARK
21/21 Tees
20/21 Baskets

Missing:
Hole 14 Basket

[Map It].

Next:

ROGERS LAKEWOOD
27/27 Tees
25/27 Baskets

Missing:
18B, 24.

This is more valuable than a generic completeness percentage.

==================================================
34. NO SOURCE GEOMETRY QUEUE
==================================================

Explicitly show:

NO PUBLIC GEOMETRY FOUND.

These Courses should become priority candidates for:

GPS Walk Course

Steward request

file import

satellite manual mapping.

==================================================
35. GPS WALK COURSE MODE
==================================================

Build the missing mobile field mapping workflow.

Course Studio:

WALK COURSE.

Workflow:

Hole 1

[STAND ON TEE]

capture

[STAND AT BASKET]

capture

NEXT HOLE.

==================================================
36. GPS QUALITY
==================================================

Display:

GPS accuracy ±X ft.

Allow:

Wait for Better Accuracy

Save Anyway

Retry.

Store observed accuracy.

==================================================
37. MULTI-SAMPLE GPS
==================================================

For higher-quality coordinate capture:

collect several seconds of samples.

Discard obvious outliers.

Use a stable location estimate.

Store:

sample count

observed accuracy.

Do not pretend phone GPS is survey-grade.

==================================================
38. MAP ONLY MISSING
==================================================

Course Studio:

MAP MISSING FEATURES.

If Course is:

35/36 assets complete,

take user directly to:

Hole 18 Basket.

==================================================
39. VERIFY EXISTING MAP
==================================================

Field mode:

VERIFY COURSE MAP.

For each existing source-backed point:

✓ Correct

Move Here

Needs Review.

This is how source data becomes steward-verified.

==================================================
40. OFFLINE MAPPING
==================================================

GPS field mapping must work without reception.

Persist local draft actions.

Sync after reconnect.

Use stable client operation IDs so retries do not create duplicates.

==================================================
41. FILE IMPORT
==================================================

Build missing:

GPX

KML

GeoJSON

CSV

geometry import.

Available in Course Studio for authorized users.

==================================================
42. FILE IMPORT PREVIEW
==================================================

Never immediately write imported features.

Preview map first.

Require matching:

Course

Hole

Feature Type

Tee/Basket name/position.

==================================================
43. SMART FILE MATCHING
==================================================

If import contains labels such as:

Hole 1 Tee

Hole 1 Basket

A Pin

Blue Tee

suggest mappings automatically.

User confirms.

==================================================
44. CSV TEMPLATE
==================================================

Support:

hole
feature_type
name
latitude
longitude
accuracy/source optional.

Provide downloadable template later if appropriate.

==================================================
45. IMPORT DUPLICATE DETECTION
==================================================

Compare imported geometry against canonical assets.

If same Tee already exists nearby:

suggest:

Match Existing

not:

Create New.

==================================================
46. NATIONAL SOURCE MATCHING IMPROVEMENT
==================================================

Current first-version Course matching:

within 900m + name check.

Keep as one signal, not final architecture.

Add:

source Course relationship

Course boundary

source name

canonical aliases

property

address

city/state

Course complex

existing source links.

==================================================
47. 900M IS NOT UNIVERSAL
==================================================

Do not hard reject simply because a legitimate large Course's mapped feature
extends beyond 900 meters from its representative Course point.

Use:

Course relationship evidence

boundary

feature cluster

Course scale.

900m may remain an initial search radius, but not an absolute truth.

==================================================
48. FEATURE CLUSTER MATCHING
==================================================

A group of:

18 Tees
18 Baskets

clustered together is strong Course evidence.

Use whole-cluster topology rather than matching every point independently.

==================================================
49. COURSE COMPLEX SAFETY
==================================================

When multiple canonical Courses share a property:

create:

COURSE COMPLEX REVIEW

when source geometry cannot be reliably separated.

Never randomly split features by nearest Course center.

==================================================
50. NATIONAL PROGRESS
==================================================

Replace only:

1 / 2,430 Regions

with richer progress:

Regions:
1 / 2,430

Source Courses Found:
x

Matched:
x

Tees Found:
x

Baskets Found:
x

Physical Assets Accepted:
x

Review:
x

No Match:
x.

==================================================
51. ETA
==================================================

Calculate observed:

regions/hour

remaining regions

estimated first-pass completion.

Do not hardcode:

4 days

if actual throughput changes.

==================================================
52. SCAN CONTROL
==================================================

Admin actions:

START / RESUME NATIONAL SCAN

PAUSE NEW WORK

READ NEXT REGION

RUN STATE

REFRESH COURSE.

Do not cancel already safely-running claimed work when merely pausing new
seeding unless intended.

==================================================
53. NATIONAL SCAN RESUMABILITY
==================================================

Restarting deployment/browser must not reset scan progress.

Region states persist.

==================================================
54. REGION STATES
==================================================

Use:

PENDING

PROCESSING

COMPLETE

RETRY

FAILED

STALE / REFRESH_DUE.

==================================================
55. FAILED REGION INSPECTOR
==================================================

Click failed region:

bounds

attempts

last error

next retry

source response/status

parser result.

==================================================
56. RETRIES
==================================================

Keep bounded exponential/backoff behavior.

Never retry malformed source data forever.

Eventually route persistent failure to:

REVIEW / DEAD LETTER.

==================================================
57. QUEUE DURABILITY
==================================================

Continue using durable server-side work.

The scan must continue when:

browser closes

admin logs out

route changes.

Current Supabase Queues are intended for durable background message
processing. Keep the queue system server-controlled rather than exposing
national ingestion to ordinary clients.

==================================================
58. QUEUE EXPOSURE
==================================================

Do NOT expose geometry worker queues through the public Data API unless there
is a specific need.

Server/admin workers should own national harvesting.

==================================================
59. SOURCE HEALTH
==================================================

Geometry source panel should show:

Healthy

Rate Limited

Degraded

Parser Failure

Paused.

Metrics:

Last request

Last successful region

Regions today

Source features today

Parse failure %

HTTP errors.

==================================================
60. PARSER REGRESSION
==================================================

Alert if expected data suddenly disappears.

Example:

previous regions:
hundreds of Tee/Basket features

current batch:
zero across many known-disc-golf regions.

Do not treat this as:

"country has no mapped Courses."

==================================================
61. FIX ZERO FEATURE DETECTION
==================================================

If the first few real regions all show:

0 mapped Courses

0 Tees

0 Baskets

in areas known to contain mapped Courses:

stop automated scan.

Mark:

SOURCE/PARSER HEALTH FAILURE.

Do not waste four days scanning bad queries.

==================================================
62. SOURCE FIXTURE TESTS
==================================================

Save representative source payload fixtures for:

simple 9-Hole Course

18-Hole numbered Course

unnumbered Course

multiple Tee Course

alternate Basket Course

Course complex

practice Basket.

Parser tests must use these.

==================================================
63. GEOMETRY HISTORY
==================================================

Canonical physical assets need history.

When coordinate changes:

old coordinate

new coordinate

source/reason

actor

timestamp.

==================================================
64. SOURCE OBSERVATION HISTORY
==================================================

Separately maintain source history.

Do not overwrite:

OSM element v4

with:

v5

without trace.

==================================================
65. LAST CONFIRMED
==================================================

For Tee/Basket:

Last Confirmed:

Source scan

Steward

GPS contributor

Admin.

Useful for future freshness.

==================================================
66. STALENESS
==================================================

Do not treat permanent Course geometry as stale every 30 days just because
source refresh is 30 days.

Separate:

SOURCE REFRESH AGE

from:

CANONICAL GEOMETRY CONFIDENCE.

A steward-verified Tee does not become untrusted because OSM hasn't changed.

==================================================
67. COURSE STUDIO SOURCE LAYER
==================================================

Add Layers:

Published Course

Source Candidates

Conflicts

Unassigned

Conditions

Event Overlay.

==================================================
68. SOURCE SYMBOLS
==================================================

Use recognizable but subtle source-candidate styling.

Do not clutter normal player Course maps with ingestion internals.

Only Course Studio/review/admin sees source candidates.

==================================================
69. PUBLIC MAP
==================================================

Public Course view renders:

approved canonical geometry only.

Never raw unreviewed candidates.

==================================================
70. APPROVAL RULES
==================================================

Protect already-approved geometry.

Normal external source change:

proposal/candidate.

New missing geometry may auto-fill only according to confidence/policy.

==================================================
71. SAFE AUTO-ACCEPT
==================================================

Consider auto-accept only when ALL are true:

Course identity high confidence

Hole relationship explicit

feature type explicit

canonical slot currently empty

no nearby conflict

coordinate passes validation

source class approved for auto-fill.

Otherwise:

review.

==================================================
72. ALTERNATE ASSETS SHOULD NOT AUTO-OVERWRITE PRIMARY
==================================================

If primary Basket exists and new source Basket appears:

do NOT replace it.

Potentially:

alternate Basket candidate.

==================================================
73. COURSE ATLAS STATUS
==================================================

Per Course display:

COURSE GEOMETRY

Physical Holes:
18

Tees:
22

Primary Tees mapped:
18/18

Basket Positions:
26

Primary Baskets mapped:
17/18

Alternates:
12

Conflicts:
1

Last source scan:
Oct 6.

==================================================
74. SOURCE BREAKDOWN
==================================================

Example:

Accepted geometry:

DGD GPS: 20
Open Map: 14
Steward: 8
File Import: 4.

Avoid double-counting the same canonical asset.

==================================================
75. COMMUNITY MAPPING REQUESTS
==================================================

For Courses with no recoverable source geometry:

allow:

REQUEST MAPPING HELP.

Players near/saved/following that Course may see a non-spammy contribution
request.

==================================================
76. UPCOMING EVENT PRIORITY
==================================================

If an upcoming Event uses an incomplete Course:

mark geometry job HOT.

Example:

Valpo Champs in 11 days

Rogers:
2 Basket positions missing.

Process/ask for those before random national backfill.

==================================================
77. EVENT DIRECTOR WARNING
==================================================

Event Director Course setup:

Map:
25/27 Holes ready.

Missing:
18B
24.

[Finish Course Map]

Do not silently invent Event geometry.

==================================================
78. CADDY READINESS
==================================================

Course geometry dashboard should separately distinguish:

MAP READY

from:

CADDY READY.

OB/Mando/rules may still be missing.

==================================================
79. AUTOMATED MAP DISTANCE
==================================================

Once Tee/Basket pair is canonical:

calculate direct geodesic distance.

Do not overwrite:

official/source Hole distance.

Display both if different:

Official:
328 ft

Map:
322 ft.

==================================================
80. ELEVATION FUTURE-READY
==================================================

Keep geometry model compatible with later elevation enrichment.

Do not fabricate elevation during this phase.

==================================================
81. STATE QA
==================================================

After every state completes first pass:

sample several matched Courses.

Visually verify Tee/Basket alignment using Course Studio imagery/map.

Do not trust match counts alone.

==================================================
82. NATIONAL QA
==================================================

After first national pass:

random sample across every geographic region.

Report:

Course match accuracy

Hole assignment accuracy

feature-type accuracy

obvious false positive rate.

==================================================
83. MANUAL FALSE POSITIVE
==================================================

Review action:

WRONG COURSE

should improve/remain recorded as matching feedback.

Do not rematch it automatically every refresh without considering rejection.

==================================================
84. PERMANENT REJECTION
==================================================

A rejected source-to-canonical match should retain a rejection key/version.

If source materially changes later:

it may be reconsidered.

==================================================
85. SOURCE ATTRIBUTION
==================================================

Preserve required source attribution/licensing in the data model and UI where
necessary.

Do not detach imported open-source geometry from provenance.

==================================================
86. SECURITY — RAW SOURCE DATA
==================================================

Raw/source ingestion tables:

server/admin.

Normal players do not need direct access.

==================================================
87. SECURITY — CANONICAL GEOMETRY
==================================================

Players may read approved Course geometry.

Contributors may submit proposals according to Course permissions.

Only authorized roles approve protected structural changes.

==================================================
88. RLS
==================================================

Enable RLS on exposed tables.

Do not use:

TO authenticated

alone as authorization for edits.

Contributor updates/proposals must be scoped by ownership/capability.

==================================================
89. VIEWS
==================================================

If Course Geometry summary uses database views:

use current RLS-preserving view behavior such as security-invoker where
appropriate.

==================================================
90. DATA API GRANTS
==================================================

Explicitly review grants separately from RLS.

Do not expose:

geometry observation internals

worker queues

source snapshots

merely because a frontend summary exists.

==================================================
91. DATABASE ADVISORS
==================================================

After schema/policy changes:

run current Supabase database/security advisors.

Fix new actionable issues before completion.

==================================================
92. ACCEPTANCE TEST — NUMBERED COURSE
==================================================

Source provides:

18 explicit Holes

18 Tees

18 Baskets.

Expected:

Course match

physical Hole match/create

18 Tee assets

18 Basket Positions

high-confidence geometry

Layout Draft if source supplies enough Layout information.

==================================================
93. ACCEPTANCE — MULTIPLE TEES
==================================================

Source:

18 Holes

Blue + White Tees.

Expected:

36 physical Tees where legitimate.

Layouts can independently reference them.

No "second pad" placeholder architecture.

==================================================
94. ACCEPTANCE — MULTIPLE BASKETS
==================================================

Source:

A + B positions.

Expected:

distinct Basket Positions.

Primary Basket not overwritten.

==================================================
95. ACCEPTANCE — UNNUMBERED
==================================================

Source has Tee/Basket geometry but no Hole refs.

Expected:

features retained.

Topology resolver attempts assignment.

Anything unresolved enters visual review.

No data discarded.

==================================================
96. ACCEPTANCE — PRACTICE BASKET
==================================================

Practice Basket near Hole 1.

Expected:

not assigned to Hole 1 automatically.

==================================================
97. ACCEPTANCE — LONG HOLE
==================================================

Legitimate Hole > previous 1,500-ft heuristic.

Expected:

review flag if necessary.

Source data retained.

No automatic deletion.

==================================================
98. ACCEPTANCE — MOVED BASKET
==================================================

Previously accepted source Basket changes.

Expected:

Moved Since Accepted.

Canonical Basket unchanged pending reconciliation.

==================================================
99. ACCEPTANCE — SOURCE DISAPPEARS
==================================================

Previously known Tee disappears for one scan.

Expected:

canonical Tee remains.

Source observation marked missing.

No immediate delete.

==================================================
100. ACCEPTANCE — NO EXISTING LAYOUT
==================================================

Course has explicit physical Hole/Tee/Basket source data but zero DGD Layouts.

Expected:

physical geometry imports successfully.

Auto-Layout Builder can construct source-backed Draft where enough information
exists.

This is essential.

==================================================
101. ACCEPTANCE — GPS
==================================================

Course with missing Hole 14 Basket.

Contributor:

Walk Course
→ Hole 14
→ Stand at Basket
→ capture

Expected:

proposal/safe direct update according to capability.

Accuracy stored.

==================================================
102. ACCEPTANCE — OFFLINE
==================================================

Map several assets without signal.

Reconnect.

Expected:

one copy each.

No duplicated Tees/Baskets.

==================================================
103. ACCEPTANCE — FILE IMPORT
==================================================

Import valid GPX/GeoJSON/CSV.

Preview.

Match assets.

Confirm.

Expected:

canonical geometry updated/proposed correctly.

==================================================
104. ACCEPTANCE — NATIONAL SCAN
==================================================

Start nationwide scan.

Close browser.

Return later.

Expected:

progress continued.

==================================================
105. ACCEPTANCE — MULTI-STATE
==================================================

Geometry must populate beyond Northwest Indiana.

Verify successful source processing in:

West Coast

South

Mountain West

Northeast

Midwest.

==================================================
106. IMPLEMENTATION ORDER
==================================================

1. Test first real regions.
2. Verify parser/source query.
3. Build parser fixtures.
4. Decouple physical geometry from existing Layouts.
5. Implement proper alternate Tee model.
6. Implement proper alternate Basket Position model.
7. Preserve unassigned source features.
8. Improve Course matching.
9. Improve Hole topology resolver.
10. Replace destructive distance skipping with review flags.
11. Build visual Hole-order review.
12. Build source disagreement map.
13. Add source disappearance tracking.
14. Integrate Auto-Layout Builder.
15. Build state-by-state Geometry dashboard.
16. Build Closest-to-Complete queue.
17. Build Walk Course GPS.
18. Add multi-sample GPS.
19. Add offline GPS mapping.
20. Add GPX/KML/GeoJSON/CSV imports.
21. Improve national job controls.
22. Add queue/parser/source health.
23. Prioritize upcoming Event Courses.
24. Build Course Studio source layers.
25. Backfill existing source observations.
26. Run multi-state tests.
27. Run national scan.
28. QA regional samples.
29. RLS/grants audit.
30. Run database/security advisors.
31. Fix regressions.
32. production-ready verification.

==================================================
107. COMPLETION REPORT
==================================================

Return:

A. real regions tested
B. source parser results
C. regions completed nationally
D. source Courses discovered
E. canonical Courses matched

F. source Tees found
G. source Baskets found
H. source Hole paths/features

I. canonical physical Holes
J. canonical Tees
K. canonical Basket Positions

L. Courses with all primary Tees
M. Courses with all primary Baskets
N. fully map-ready Courses

O. alternate Tees created/matched
P. alternate Basket Positions created/matched

Q. unassigned Tees
R. unassigned Baskets
S. unnumbered Courses
T. Course-complex reviews
U. geometry conflicts

V. source features missing since prior scan
W. moved-since-accepted features

X. Layout Drafts created from harvested geometry
Y. Layouts becoming Map Ready
Z. Layouts becoming Scoring Ready

AA. Courses with no source geometry
AB. Courses requiring GPS mapping
AC. closest-to-complete queue count

AD. state-by-state coverage
AE. scan throughput
AF. estimated remaining first-pass time
AG. failed/retry/dead-letter regions
AH. parser/source health

AI. GPS mapping tests
AJ. offline tests
AK. file import tests

AL. RLS/security results
AM. Data API grant results
AN. database advisor results

AO. remaining blockers.

Never report geometry coverage as complete simply because every region was
scanned.

Separate:

SCANNED
SOURCE GEOMETRY FOUND
MATCHED
CANONICALIZED
VERIFIED
MAP READY.