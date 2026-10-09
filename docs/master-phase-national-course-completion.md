MASTER PHASE — NATIONAL COURSE COMPLETION ENGINE
ONE COMPLETE U.S. COURSE ATLAS + SYSTEMATIC PHYSICAL MAPPING

GOAL:

Build the system that takes DGD from:

"we have many Courses and some mapped geometry"

to:

"every legitimate United States Course is accounted for on the Course Atlas,
and every physical mapping gap has either been automatically recovered or
turned into an actionable completion task."

This is the next phase after the Course Geometry Harvester real-region tests.

DO NOT define "complete national map" as:

every Course magically has Tee and Basket coordinates from an automated
source.

Our real-world testing has already shown that no single open source has that
coverage.

Instead build a completion pipeline with TWO independent targets:

TARGET A — NATIONAL COURSE DIRECTORY COMPLETE

Every legitimate canonical U.S. Course has:

- canonical course_id
- name
- city/state
- valid representative map location
- public Directory state
- source provenance
- duplicate resolution.

TARGET B — PHYSICAL COURSE MAP COMPLETE

Every active Hole has:

- physical Hole identity
- required Tee(s)
- required Basket Position(s)
- coordinates
- Layout references
- Par where legitimately known
- permanent rules where needed.

The system must know the exact status of every Course against both targets.

==================================================
1. BUILD ONE NATIONAL COURSE MASTER LIST
==================================================

Create one canonical inventory of every United States Course DGD knows from:

PDGA
UDisc
Disc Golf Scene
OpenStreetMap
DGD native submissions
approved imports
other legitimate supported sources.

These become:

SOURCE OBSERVATIONS

linked to:

ONE CANONICAL COURSE.

Do not let every source maintain its own Course Directory.

==================================================
2. NATIONAL COURSE IDENTITY IS THE FOUNDATION
==================================================

For every source Course listing:

MATCH EXISTING CANONICAL COURSE

or

CREATE CANONICAL COURSE CANDIDATE

or

SEND TO REVIEW.

Do not let unidentified source records disappear.

==================================================
3. COURSE ACCOUNTING RULE
==================================================

Every discovered U.S. Course must end in exactly one major state:

CANONICAL_ACTIVE

CANONICAL_CLOSED

DUPLICATE_OF_CANONICAL

NOT_A_COURSE

LAYOUT_OF_EXISTING_COURSE

REVIEW_REQUIRED.

Nothing should disappear into a vague:

ignored

or:

set aside.

==================================================
4. COURSE DIRECTORY FIRST
==================================================

A Course does NOT need:

Layout

Par

Hole coordinates

Tees

Baskets

ratings

to appear in the national Course Directory.

Minimum Directory requirement:

legitimate canonical identity
+
usable Course location.

This is how DGD gets nationwide coverage before every Hole is mapped.

==================================================
5. NATIONAL DIRECTORY LOCATION ENGINE
==================================================

For every Course without a valid representative coordinate:

attempt location recovery from strongest available evidence.

Priority:

1. DGD verified Course location
2. reliable source-provided exact Course coordinate
3. agreement between independent sources
4. legitimate street address
5. named park/property location
6. manual review.

Do not use city/state centroid as if it were the exact Course.

==================================================
6. LOCATION STATES
==================================================

Use:

VERIFIED

EXACT_SOURCE

HIGH_CONFIDENCE

PROPERTY_LEVEL

APPROXIMATE

MISSING.

Directory policy can decide whether PROPERTY_LEVEL / APPROXIMATE locations are
shown, but they must never be mislabeled as exact.

==================================================
7. LOCATION GAP QUEUE
==================================================

Build:

COURSES MISSING DIRECTORY LOCATION.

Sort:

Has street address
Has park/property
Multiple agreeing sources
Upcoming Event
Nearby DGD contributor
No usable evidence.

Give each one a direct repair workflow.

==================================================
8. NATIONAL MAP QUERY
==================================================

Once a Course has a valid representative coordinate:

it must appear through the canonical Directory viewport query.

Do not wait for physical Hole mapping.

Use PostGIS spatial indexing / viewport queries.

National zoom:
clusters.

State/city zoom:
individual Course pins.

==================================================
9. STATE COMPLETION BOARD
==================================================

Create:

COURSE ATLAS → NATIONAL COVERAGE.

Rows:

Alabama
Alaska
Arizona
...
Wyoming.

Columns:

Source Listings

Canonical Courses

Directory Located

Directory Visible

Missing Location

Duplicate Review

Courses with Layout

Courses with Any Geometry

Fully Physical-Mapped

Needs Field Work.

==================================================
10. STATE COMPLETION STATUS
==================================================

Each state may become:

DISCOVERY INCOMPLETE

IDENTITY REVIEW

DIRECTORY COMPLETE

GEOMETRY IN PROGRESS

PHYSICAL MAP COMPLETE.

Do not call a state complete simply because an ingestion crawler finished.

==================================================
11. COURSE COMPLETION STATE
==================================================

Every Course gets a completion profile.

Example:

ROGERS LAKEWOOD PARK

Directory
✓ Identity
✓ Location
✓ Public

Course Details
✓ Hole Count
✓ Amenities
✓ Sources

Layout
✓ Main 27
✓ Par
✓ Sequence

Geometry
27/27 primary Tees
25/27 primary Baskets

Rules
21/27 reviewed

OVERALL NEXT ACTION:
Map Basket Positions on Holes 18 and 24.

==================================================
12. SEPARATE COMPLETENESS DIMENSIONS
==================================================

Track independently:

IDENTITY

LOCATION

SOURCE COVERAGE

COURSE DETAILS

PHYSICAL HOLES

TEES

BASKET POSITIONS

LAYOUT STRUCTURE

PAR

DISTANCE

MAP GEOMETRY

PERMANENT RULES

CADDY.

Never use one vague percentage to replace these facts.

==================================================
13. HARVESTER BECOMES ONE INPUT
==================================================

The OpenStreetMap Tee/Basket Harvester is:

GEOMETRY SOURCE A.

It should continue processing the country safely.

But failure to find geometry does NOT stop the Course from appearing in Atlas.

==================================================
14. MULTI-SOURCE GEOMETRY
==================================================

Create a unified geometry-source system.

Possible legitimate geometry sources:

OpenStreetMap

existing approved source Course geometry

DGD Course Studio

DGD GPS Walk Course

official GPX/KML/GeoJSON

steward-uploaded coordinate CSV

approved municipal/course-design files.

All feed the same canonical physical Course model.

==================================================
15. DO NOT BUILD SOURCE-SPECIFIC PHYSICAL COURSES
==================================================

No:

OSM Holes

GPS Holes

CSV Holes.

Instead:

SOURCE OBSERVATIONS

resolve into:

CANONICAL PHYSICAL HOLES

TEES

BASKET POSITIONS.

==================================================
16. NATIONAL GEOMETRY PASS
==================================================

For every canonical Course:

run all enabled automatic geometry sources.

Final machine state:

GEOMETRY_FOUND

PARTIAL_GEOMETRY

NO_AUTOMATIC_GEOMETRY

MATCH_AMBIGUOUS

SOURCE_CONFLICT.

==================================================
17. NO-AUTOMATIC-GEOMETRY IS NOT FAILURE
==================================================

This is expected for many Courses.

When automatic sources are exhausted:

convert the Course into:

FIELD MAPPING REQUIRED.

Do not endlessly rescan the same sources hoping missing coordinates appear.

==================================================
18. BUILD THE NATIONAL FIELD-MAPPING QUEUE
==================================================

This is the most important path to full physical-map coverage.

Queues:

ONE FEATURE MISSING

2–3 FEATURES MISSING

PARTIAL COURSE

LAYOUT KNOWN / GEOMETRY UNKNOWN

NO GEOMETRY

NEEDS VERIFICATION.

Sort closest-to-complete first.

==================================================
19. CLOSEST TO COMPLETE
==================================================

Example:

Glenn C. Nicholson
21/21 Tees
20/21 Baskets

Hole 14 Basket needed.

[MAP BASKET]

This should rank ahead of a Course with:

0/18 Tees
0/18 Baskets.

Completing Courses produces usable maps faster.

==================================================
20. UPCOMING EVENT PRIORITY
==================================================

If Course is being used by an upcoming DGD Event:

automatically increase completion priority.

Example:

VALPO CHAMPS
11 days away

Rogers Lakewood:
2 Basket Positions missing

HIGH PRIORITY.

==================================================
21. LOCAL CONTRIBUTOR MATCHING
==================================================

Use coarse regional/user relationships appropriately to identify people who
may be able to help.

Possible signals:

Course steward

Course saved/followed

recent Round at Course

organization manages Course

Event staff at Course.

Never expose private precise player locations.

==================================================
22. HELP MAP THIS COURSE
==================================================

Course Directory card:

MAP INCOMPLETE

17/18 Holes mapped

[Help Finish Map].

Only show where contributions are allowed.

==================================================
23. WALK THE COURSE
==================================================

Build the mobile field-mapping workflow as a core completion tool.

User selects:

Walk Course.

DGD guides:

Hole 1

[Stand on Tee]

capture coordinate

[Stand at Basket]

capture coordinate

Next Hole.

==================================================
24. EXISTING DATA AWARENESS
==================================================

If Hole 1 Tee already exists:

do not ask for it again.

Example:

Hole 1
✓ Tee
✗ Basket

Show only:

[Stand at Basket].

==================================================
25. MAP ONLY MISSING
==================================================

Button:

MAP MISSING ITEMS.

For a Course with two incomplete Holes:

jump only to those two.

Do not force user through 18 completed Holes.

==================================================
26. GPS MULTI-SAMPLE
==================================================

When user captures:

collect a short series of GPS readings.

Display accuracy.

Reject obvious outliers.

Derive stable point.

Store:

coordinate
reported accuracy
sample count
time
contributor.

==================================================
27. OFFLINE-FIRST FIELD WORK
==================================================

Disc golf Courses often have poor reception.

Walk Course must work offline.

Store field observations locally.

Sync later.

Stable operation IDs prevent duplicates.

==================================================
28. VERIFY MAP MODE
==================================================

For source-imported coordinates:

offer:

VERIFY COURSE MAP.

At each mapped feature:

Looks Correct

Move Here

Wrong Feature

Needs Review.

This converts machine/imported geometry into human-verified DGD geometry.

==================================================
29. COURSE STEWARD FAST PATH
==================================================

Verified Course Steward may have permission to approve certain geometry
directly.

Normal contributor:

submits proposal.

Respect existing Course approval rules.

==================================================
30. IMPORT OFFICIAL MAP DATA
==================================================

Build easy:

IMPORT COURSE MAP.

Supported structured files:

CSV
GPX
KML
GeoJSON.

Eventually support other legitimate machine-readable formats.

==================================================
31. SMART IMPORT
==================================================

Automatically recognize labels such as:

Hole 1 Tee

1 Basket

Blue Tee 5

Basket B 12.

Suggest canonical matches.

User reviews before saving.

==================================================
32. MASS COURSE IMPORT
==================================================

For trusted organizations/parks that maintain multiple Courses:

allow controlled bulk structured import.

Do not require mapping each Course by hand if legitimate coordinate data
already exists.

==================================================
33. PHYSICAL HOLES FIRST
==================================================

Reaffirm architecture:

COURSE

→ PHYSICAL HOLES

→ TEES + BASKET POSITIONS

→ LAYOUTS.

Do not make imported geometry dependent on Layout existence.

==================================================
34. AUTOMATIC LAYOUT BUILDER
==================================================

After physical Hole assets exist:

construct Layout Drafts where evidence supports them.

Input evidence:

Hole order

Tee selections

Basket selections

Par

Layout name.

==================================================
35. DO NOT INVENT PAR
==================================================

Complete geometry with unknown Par is:

MAP READY

not:

SCORING READY.

Keep Par NULL.

==================================================
36. DO NOT INVENT LAYOUT SEQUENCE
==================================================

If physical Holes exist but sequence uncertain:

send to:

LAYOUT ORDER REVIEW.

Do not silently number by nearest-neighbor walking path.

==================================================
37. VISUAL LAYOUT REVIEW
==================================================

Show Course map with:

proposed Hole 1 → 2 → 3...

Reviewer can drag/reorder.

Support:

8A
15A
A
B
non-standard layouts.

==================================================
38. ALTERNATE TEES AND PINS
==================================================

Once physical asset architecture exists:

auto-builder can create:

White Layout

Blue Layout

Short Layout

Long Layout

Mixed Championship Layout

without duplicate geometry.

==================================================
39. SOURCE DISAGREEMENT REVIEW
==================================================

Build one map where reviewer can compare:

DGD verified

open-map source

GPS submission

file import.

Do not average coordinates.

==================================================
40. COURSE COMPLETION WORKSPACE
==================================================

Course Studio should gain:

COMPLETE COURSE

mode.

Show only outstanding work.

Example:

4 tasks remaining

1. Confirm Hole 6 Par
2. Map Hole 9 Basket
3. Review alternate Tee on Hole 14
4. Confirm Layout order.

This is much better than opening the entire editor with no direction.

==================================================
41. COURSE COMPLETION TASK MODEL
==================================================

Generate tasks automatically from missing requirements.

Types:

LOCATE_COURSE

MATCH_SOURCE

CONFIRM_HOLE

MAP_TEE

MAP_BASKET

MATCH_ALT_TEE

MATCH_ALT_BASKET

CONFIRM_PAR

CONFIRM_ORDER

VERIFY_GEOMETRY

REVIEW_CONFLICT.

==================================================
42. TASKS AUTO-CLOSE
==================================================

If missing Basket is later imported/verified:

its task closes automatically.

Do not maintain separate manual checklist truth.

==================================================
43. NATIONAL TASK DASHBOARD
==================================================

Admin Course Atlas:

OPEN COMPLETION TASKS.

Break down:

Missing Course Location

Missing Tee

Missing Basket

Layout Required

Par Required

Conflict

Verification.

==================================================
44. USER-FACING CONTRIBUTION BOARD
==================================================

Optional:

HELP BUILD DGD COURSE ATLAS.

Show appropriate nearby/saved Courses needing help.

Not an admin data dump.

Example:

2 Courses you play need help.

Rogers:
2 Baskets

Valparaiso University:
Verify Hole 8 Tee.

==================================================
45. CONTRIBUTOR REPUTATION
==================================================

Track accuracy of accepted contributions.

Use existing Trusted Contributor / Course Steward permission model.

Do not create a second reputation system unless necessary.

==================================================
46. VERIFIED CONTRIBUTION / DGD TIER
==================================================

Once a meaningful mapping contribution is accepted:

it can feed the existing verified service/contribution dimension of DGD Tier
once.

Prevent double-credit for the same physical asset.

==================================================
47. REQUEST COURSE STEWARD
==================================================

For Courses with repeated activity but no verified manager:

allow legitimate steward claim/request process.

Stewards become the best long-term source of:

pin movements

new Tees

Course changes.

==================================================
48. MUNICIPAL / CLUB OWNERSHIP
==================================================

Support verified organization Course stewardship.

Example:

local disc golf club

park department

Course designer group.

Organization permission does not automatically give every member structural
edit access.

==================================================
49. STALE GEOMETRY MONITORING
==================================================

After Course is mapped:

do not consider it finished forever.

Track:

last source confirmation

last steward verification

reported structural changes.

==================================================
50. PIN MOVEMENT WORKFLOW
==================================================

If source suggests Basket moved:

create:

POSSIBLE BASKET CHANGE.

Do not automatically move verified geometry.

==================================================
51. COURSE CONDITION ≠ PHYSICAL CHANGE
==================================================

Temporary:

basket pulled for maintenance

flooded Tee

construction

does not necessarily rewrite permanent geometry.

Use Course Conditions.

==================================================
52. PERMANENT CHANGE
==================================================

Verified permanent:

new Tee

removed Hole

new Basket Position

Course redesign

creates new canonical asset/version state with history.

==================================================
53. NATIONAL COVERAGE FUNNEL
==================================================

Course Atlas should visibly show:

SOURCE COURSE LISTINGS
        ↓
CANONICAL COURSES
        ↓
DIRECTORY LOCATED
        ↓
DIRECTORY VISIBLE
        ↓
LAYOUT KNOWN
        ↓
ANY PHYSICAL GEOMETRY
        ↓
PRIMARY TEES COMPLETE
        ↓
PRIMARY BASKETS COMPLETE
        ↓
MAP READY
        ↓
SCORING READY
        ↓
CADDY READY.

Use actual counts.

==================================================
54. NEVER HIDE THE GAP
==================================================

For every level show:

complete count

remaining count.

Example:

Primary Baskets:
4,211 / 13,056 Courses complete

8,845 remaining.

Do not report only percentages.

==================================================
55. EXPLICIT UNMAPPED REASONS
==================================================

Every incomplete Course gets principal reason:

NO AUTOMATIC GEOMETRY

SOURCE MATCH AMBIGUOUS

MISSING TEE

MISSING BASKET

LAYOUT UNKNOWN

PAR UNKNOWN

CONFLICT

FIELD VERIFICATION REQUIRED.

==================================================
56. STATE COMPLETION TARGET
==================================================

A state reaches:

DIRECTORY COMPLETE

when:

every legitimate known Course is canonical
every active/public Course has usable Directory location
every such Course appears in Directory map.

Physical mapping is separate.

==================================================
57. PHYSICAL STATE COMPLETION
==================================================

A state reaches:

PHYSICAL MAP COMPLETE

only when every active Course's required primary physical assets are mapped or
explicitly exempted.

==================================================
58. COURSE EXEMPTION
==================================================

Some unusual locations may genuinely be:

object Course

portable/temp-only Course

private/inaccessible

closed.

Allow explicit classification rather than forcing meaningless permanent
geometry.

==================================================
59. NATIONAL DIRECTORY QA
==================================================

Before focusing heavily on Hole geometry:

verify every state can be browsed on Course Directory map.

Test:

West Coast

Mountain West

Southwest

Texas

Midwest

Southeast

Northeast

Alaska

Hawaii.

==================================================
60. MAP QUERY GUARANTEE
==================================================

Every public canonical Course with acceptable representative location must be
returned by the Directory viewport query.

Unexplained missing:

ZERO.

==================================================
61. STATE SOURCE DISCOVERY PASSES
==================================================

Run each supported Course-directory source state-by-state.

Maintain checkpoints.

Do not depend on one nationwide query.

==================================================
62. DISCOVERY DIFFERENCE REPORT
==================================================

For every state:

PDGA-only Courses

UDisc-only

DGS-only

DGD-only

multi-source

possible duplicates.

This helps reveal discovery gaps.

==================================================
63. SOURCE DISAGREEMENT
==================================================

Sources disagree about:

Course name

location

Hole count

status.

Preserve all observations and resolve canonically.

Do not simply pick whichever source refreshed last.

==================================================
64. CLOSED COURSES
==================================================

Preserve historical Course identity.

Mark:

CLOSED / RETIRED.

Do not delete, because historical Rounds/Events may reference it.

Directory may hide/filter it appropriately.

==================================================
65. NEW COURSES
==================================================

National discovery keeps running periodically.

New Course:

create/match canonical identity

resolve location

publish to Directory when eligible

start geometry completion pipeline.

==================================================
66. DIRECT USER ADD COURSE
==================================================

User submission goes through same canonical matcher.

Before creating:

check whether DGD already knows Course.

Prevent duplicates.

==================================================
67. AUTOMATED MATCHING FEEDBACK
==================================================

Human duplicate/match decisions should be recorded and used by future matching
rules.

Do not repeatedly surface same rejected match.

==================================================
68. GEOMETRY SOURCE COVERAGE SCORECARD
==================================================

Measure useful source performance:

Courses checked

Courses where geometry found

Tee features found

Basket features found

Hole features found

correct Course matches

review rate.

This tells us which sources are actually valuable.

==================================================
69. STOP WASTING SOURCE REQUESTS
==================================================

If a Course has been fully verified:

deprioritize expensive geometry scans unless source freshness policy says a
refresh is useful.

Focus resources on incomplete Courses.

==================================================
70. SMART NEXT-SOURCE ENGINE
==================================================

For each incomplete Course:

choose next useful action.

Example:

OSM already checked → no geometry
official file unavailable
→ request GPS mapping.

Do not repeatedly run the same failed source.

==================================================
71. COURSE COMPLETION STRATEGY
==================================================

For each Course derive one state:

AUTOMATIC SOURCES REMAIN

REVIEW SOURCE CANDIDATES

IMPORT AVAILABLE MAP

FIELD MAP REQUIRED

VERIFY EXISTING MAP

COMPLETE.

This becomes the completion orchestrator.

==================================================
72. COMPLETION SHOULD BE ACTIONABLE
==================================================

Never show merely:

63% complete.

Show:

Next:
Map Hole 14 Basket.

==================================================
73. EVENT-DAY FEEDBACK LOOP
==================================================

If Event staff discovers map error:

submit:

Course Map Correction.

After Event:

Course Steward/admin can resolve permanent change.

Do not let Event overlay silently rewrite Course.

==================================================
74. SCORECARD FEEDBACK
==================================================

Players may report:

Tee pin incorrect

Basket pin incorrect

Hole missing.

These create Course proposals/issues.

They do not directly move protected assets.

==================================================
75. CADDY FEEDBACK
==================================================

Likewise allow:

Map issue

from Caddy.

Attach exact:

course_id
layout_version
physical_hole
feature.

==================================================
76. NATIONAL COMPLETION CAMPAIGN
==================================================

Once infrastructure is stable, DGD can eventually run campaigns:

Help Map Indiana

Finish the Midwest

Map Your Home Course.

This is optional product UX, but architecture should support it.

==================================================
77. SECURITY
==================================================

Raw ingestion/source observations:

server/admin protected.

Canonical public Course map:

read according to public visibility.

Contributor proposals:

capability/RLS controlled.

Approved structural geometry:

only authorized capability.

==================================================
78. DO NOT EXPOSE HARVESTER CONTROL PUBLICLY
==================================================

National source scanning, retries and source credentials remain server/admin
only.

==================================================
79. CURRENT SUPABASE RULES
==================================================

Before implementing database objects:

verify current Supabase docs/changelog.

Use:

durable bounded background processing

PostGIS for spatial data

explicit Data API grants where needed

RLS on exposed tables

security-invoker views where appropriate.

Avoid SECURITY DEFINER as a shortcut.

==================================================
80. PERFORMANCE
==================================================

Do not load national Hole geometry into Course Directory.

Directory:
Course points/clusters only.

Selected Course:
Course metadata.

Course page/map:
that Course's geometry.

Course Studio:
that Course's full editing/source data.

==================================================
81. NATIONAL COMPLETION QA
==================================================

For every state:

randomly inspect canonical Course identity and map location.

For every geometry-ready sample:

verify Tee/Basket placement visually.

For every auto-built Layout sample:

verify Hole order/Par provenance.

==================================================
82. HARD COMPLETION RULE — DIRECTORY
==================================================

National Course Directory is complete only when:

every discovered legitimate active U.S. Course is either:

VISIBLE ON DIRECTORY MAP

or:

has a specific documented reason it cannot yet be shown.

No unexplained omissions.

==================================================
83. HARD COMPLETION RULE — PHYSICAL MAP
==================================================

Physical national map is complete only when:

every active Course is either:

MAP READY

or:

has an explicit remaining completion task.

Do not claim 100% automated geometry coverage.

==================================================
84. IMPLEMENTATION ORDER
==================================================

PHASE A — NATIONAL DIRECTORY

1. Build one canonical U.S. Course accounting report.
2. Resolve duplicate/source identities.
3. Backfill Course locations.
4. Fix national Directory visibility.
5. Build state-by-state Directory coverage.
6. Reach zero unexplained missing pins.

PHASE B — GEOMETRY ORCHESTRATOR

7. Finish Harvester 2.1 correctness fixes.
8. Complete physical Hole/Tee/Basket data model.
9. Run automatic geometry sources.
10. Classify every Course after automated pass.
11. Build closest-to-complete queue.

PHASE C — HUMAN GAP FILL

12. Build Walk Course mobile GPS mode.
13. Build Map Missing Features.
14. Build Verify Existing Map.
15. Build offline mapping.
16. Build CSV/GPX/KML/GeoJSON import.
17. Build contributor proposal/approval workflow.

PHASE D — LAYOUT COMPLETION

18. Build Auto-Layout Builder from physical assets.
19. Build Layout order review.
20. Add proper alternate Tee/Basket support.
21. Resolve Par/distance provenance.
22. Version/publish approved Layouts.

PHASE E — NATIONAL OPERATIONS

23. Build state completion dashboard.
24. Build Course completion tasks.
25. Prioritize upcoming Event Courses.
26. Add contributor help surfaces.
27. Add stale/change monitoring.
28. Perform nationwide QA.

PHASE F — SECURITY + RELEASE

29. Audit RLS.
30. Audit Data API grants.
31. Audit exposed views/functions.
32. Run database/security advisors.
33. Fix issues.
34. Run multi-state regression.
35. production-ready verification.

==================================================
85. FINAL COMPLETION REPORT
==================================================

Return:

DIRECTORY

A. source Course listings
B. canonical U.S. Courses
C. active Courses
D. closed Courses
E. duplicate Courses resolved
F. Directory-located Courses
G. Directory-visible Courses
H. missing-location Courses
I. unexplained map omissions

GEOMETRY

J. Courses checked by automatic geometry sources
K. Courses with any physical geometry
L. Courses with all primary Tees
M. Courses with all primary Baskets
N. fully Map Ready Courses
O. unassigned Tee candidates
P. unassigned Basket candidates
Q. geometry conflicts

HUMAN COMPLETION

R. Courses requiring field mapping
S. Courses missing exactly one feature
T. Courses awaiting verification
U. file imports awaiting review

LAYOUTS

V. Layouts detected
W. Layout Drafts built
X. scoring-ready Layouts
Y. map-ready Layouts
Z. caddy-ready Layouts
AA. Par unknown
AB. Layout-order reviews

COVERAGE

AC. state-by-state Directory completeness
AD. state-by-state physical map completeness
AE. source coverage by state
AF. remaining tasks by state

SYSTEM HEALTH

AG. ingestion throughput
AH. source health
AI. geometry job backlog
AJ. failed/dead-letter jobs
AK. RLS/security findings
AL. Data API/grant findings
AM. advisor findings

FINAL

AN. exact list/count of remaining national Course Directory blockers
AO. exact list/count of remaining physical-map blockers grouped by reason.

Never replace those last two with a generic percentage.