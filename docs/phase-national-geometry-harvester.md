PHASE — NATIONAL COURSE GEOMETRY HARVESTER
TEE PAD + BASKET COORDINATES FOR THE UNITED STATES

Build a dedicated DGD system for discovering, importing, reconciling,
validating and maintaining physical disc golf Course geometry across the
United States.

PRIMARY OBJECTIVE:

For every canonical DGD Course:

find every legitimate source-backed:

- physical Hole
- Tee pad
- alternate Tee
- Basket
- alternate Basket / pin position

and connect those coordinates to the SAME canonical Course Studio objects
used by:

Course Directory
Course Studio
Layouts
Caddy
Events
Tee signs
Statboard.

DO NOT fabricate missing coordinates.

The system should automatically recover everything that real source data can
prove, then make the remaining gaps extremely easy for users/stewards to map.

==================================================
1. HARD PRODUCT RULE
==================================================

There is ONE physical Course geometry model.

The ingestion system does NOT maintain its own:

ingested Tees

builder Tees

Caddy Tees

Event Tees.

Source data becomes:

OBSERVATIONS / CANDIDATES

that resolve into canonical:

physical Hole
Tee
Basket Position.

==================================================
2. NATIONAL TARGET
==================================================

Process every canonical United States Course.

For each Course determine:

COURSE LOCATION KNOWN

PHYSICAL HOLES KNOWN

TEE COORDINATES KNOWN

BASKET COORDINATES KNOWN

ALTERNATE TEES KNOWN

ALTERNATE BASKETS KNOWN

HOLE ASSOCIATIONS KNOWN

LAYOUT ASSOCIATIONS KNOWN.

==================================================
3. DO NOT REQUIRE ONE SOURCE
==================================================

No single source is expected to contain every coordinate.

Build a multi-source geometry pipeline.

Potential source classes:

OPEN MAP DATA

existing authorized PDGA source data

existing authorized UDisc source data

existing authorized Disc Golf Scene source data

DGD native Course Studio mappings

DGD GPS mappings

authorized GPX / KML / GeoJSON imports

verified Course steward submissions

official Course maps with machine-readable geometry where permitted.

Every source has its own adapter.

==================================================
4. SOURCE POLICY
==================================================

Only ingest geometry that DGD is legitimately permitted to access/use.

Do not:

bypass authentication

circumvent anti-bot protection

bypass CAPTCHA

scrape private account data

or copy copyrighted map imagery as geographic data without permission.

If a source does not permit automated geometry harvesting:

do not build a workaround.

Use another legitimate source or require user/steward mapping.

==================================================
5. OPENSTREETMAP ADAPTER
==================================================

Build a first-class OpenStreetMap geometry adapter.

Use the CURRENT documented OpenStreetMap disc-golf tagging conventions.

Recognize:

Course features

physical Hole features

Tee features

Basket features

Course/hole relations where present

alternate Tee metadata

Hole refs/numbers

Par where legitimately present.

Do not assume every OSM disc golf Course is fully mapped.

==================================================
6. OSM ATTRIBUTION
==================================================

Preserve:

source = OPENSTREETMAP

OSM element type

OSM element ID

OSM version where available

retrieved/observed timestamp.

Ensure product attribution/licensing requirements are preserved wherever
required.

==================================================
7. DO NOT HAMMER PUBLIC ENDPOINTS
==================================================

National ingestion must use responsible batching.

Do NOT issue thousands of individual browser requests.

Prefer:

bounded state/region queries

approved bulk extracts where appropriate

cached snapshots

incremental refreshes.

The background server performs ingestion.

The browser never performs nationwide geometry crawling.

==================================================
8. SOURCE ADAPTER INTERFACE
==================================================

All geometry adapters should normalize into the same internal observation
format.

Conceptually:

source

source_course_id

source_hole_id

source_feature_id

feature_type

coordinates

geometry

hole_ref

tee_name

tee_color

basket_name

basket_position

layout_name if known

source_accuracy

observed_at

source_version

raw_attributes

license/provenance.

==================================================
9. RAW OBSERVATION ≠ CANONICAL ASSET
==================================================

A coordinate found externally is:

SOURCE OBSERVED

before it becomes canonical.

Do not immediately overwrite:

verified DGD Tee

verified DGD Basket

Course steward geometry.

==================================================
10. GEOMETRY OBSERVATION STORE
==================================================

Reuse existing source/provenance architecture where possible.

If needed, conceptually support:

course_geometry_observations

with:

id
course_id
source
source_external_id
feature_type
hole_ref
geometry
metadata
confidence
match_state
first_seen
last_seen
source_version.

Do not create duplicate tables if equivalent structures already exist.

==================================================
11. FEATURE TYPES
==================================================

At minimum support:

COURSE_POINT

COURSE_BOUNDARY

PHYSICAL_HOLE

TEE

BASKET_POSITION

PRACTICE_BASKET

MAYBE_TEE

MAYBE_BASKET.

Temporary Event geometry is NOT imported as permanent Course geometry.

==================================================
12. COURSE MATCHING FIRST
==================================================

Before importing hole geometry:

resolve the source Course to canonical:

course_id.

Use:

existing source link

name

coordinates

address

park

city/state

Course complex.

Do not attach Tee/Basket data until Course identity is sufficiently resolved.

==================================================
13. COURSE PROXIMITY SAFETY
==================================================

When multiple Courses share a park:

do not assign geometry solely by proximity.

Use:

source relation membership

Course relation

Hole relationships

Course name

layout context

explicit source identity.

Ambiguous geometry enters review.

==================================================
14. PHYSICAL HOLE MATCHING
==================================================

Match source Hole to canonical Physical Hole using:

explicit source link

source Course relationship

Hole ref

Hole label

Tee/Basket endpoints

existing geometry

layout relationships.

Do not depend only on:

Hole number.

==================================================
15. SUPPORT SPECIAL HOLE LABELS
==================================================

Recognize:

1

2

8A

8B

15A

A

B

X

TEMP

where legitimately present.

Do not force every physical Hole into integer numbering.

==================================================
16. TEE MODEL
==================================================

A physical Hole may have:

one Tee

or many Tees.

Examples:

Main

Short

Long

Red

White

Blue

Gold

Pro.

Each Tee is a physical asset.

Layouts reference it.

==================================================
17. BASKET MODEL
==================================================

A physical Hole may have:

one permanent Basket Position

or:

A
B
C
Short
Long

alternate positions.

Each Position is canonical.

Current physical basket placement may be tracked separately if DGD later
supports it.

==================================================
18. TEE SOURCE MATCHING
==================================================

Match source Tee candidates using:

source ID

Hole

position

name

color

coordinate proximity

existing physical Tee.

Do not create a duplicate Tee every time another source describes the same pad.

==================================================
19. BASKET SOURCE MATCHING
==================================================

Same principle for Basket Positions.

Do not create:

Basket A from PDGA

Basket A from OSM

Basket A from DGD

as three physical baskets when evidence says they are the same position.

==================================================
20. COORDINATE DEDUPLICATION
==================================================

If two source points fall within a very small configurable tolerance and
belong to the same Hole/type:

evaluate as likely same physical asset.

Use context.

Do not globally merge points merely because they are close.

==================================================
21. CONFIDENCE MODEL
==================================================

Use understandable confidence classes:

VERIFIED

HIGH

MEDIUM

LOW

REVIEW.

Do not create fake mathematical precision such as:

92.74819%

unless the matching model genuinely supports it.

==================================================
22. VERIFIED
==================================================

VERIFIED examples:

Course steward GPS mapping

trusted DGD on-site mapping

approved admin mapping

multiple strong independent sources plus human confirmation.

==================================================
23. HIGH CONFIDENCE
==================================================

Possible HIGH example:

source explicitly identifies:

Course

Hole

feature type

and precise coordinate,

with no conflicting canonical geometry.

==================================================
24. MEDIUM / LOW
==================================================

Medium:

strong spatial/source evidence but incomplete Hole association.

Low:

candidate coordinate with weak structural relationship.

Low-confidence geometry should never silently become public Course truth.

==================================================
25. SOURCE CONFLICTS
==================================================

Example:

DGD verified Basket:
41.x, -87.x

OSM Basket:
35 ft away.

Do not silently move verified Basket.

Create:

GEOMETRY CONFLICT.

Show current vs source candidate.

==================================================
26. CONFLICT VISUALIZATION
==================================================

Course Studio/Admin review:

CURRENT BASKET

SOURCE BASKET

distance difference.

Actions:

Keep Current

Move to Source

Create Alternate Position

Not Same Feature

Needs Field Check.

==================================================
27. HISTORICAL SOURCE MOVEMENT
==================================================

A Basket may legitimately have moved.

Do not assume changed coordinate is bad.

Allow:

MOVE PHYSICAL POSITION

or:

CREATE NEW BASKET POSITION

depending on evidence.

Preserve history.

==================================================
28. NEVER REWRITE HISTORICAL EVENT TRUTH
==================================================

Updating current physical Course geometry must not rewrite:

completed Event Layout Versions

historical Rounds

historical tee-sign snapshots.

==================================================
29. HOLE WAY / ENDPOINT EXTRACTION
==================================================

If a supported source explicitly describes a physical Hole path:

identify its:

start point

end point.

Where source semantics explicitly define:

start = Tee

end = Basket

use them as source-backed candidates.

Do not infer this for arbitrary unrelated LineStrings.

==================================================
30. DIRECT FEATURE EXTRACTION
==================================================

If source directly provides:

TEE node

BASKET node

ingest it even if Hole path is absent.

Then attempt Hole association.

==================================================
31. ORPHAN TEE
==================================================

If Tee coordinate known but Hole association unknown:

store source observation.

Do NOT discard it.

Mark:

UNASSIGNED TEE.

Review/matching job can resolve later.

==================================================
32. ORPHAN BASKET
==================================================

Same:

UNASSIGNED BASKET.

==================================================
33. GEOMETRY ASSIGNMENT ENGINE
==================================================

For unassigned features evaluate:

Course relation membership

Hole relation membership

Hole ref

nearest Hole endpoint

nearby paired Tee/Basket

flight path direction

known Layouts.

Automatically assign only above strong confidence.

==================================================
34. DO NOT USE SIMPLE NEAREST NEIGHBOR ALONE
==================================================

A basket may be physically near another Hole's Tee.

Nearest point alone is not enough.

Use Course/Hole topology.

==================================================
35. COURSE BOUNDARY
==================================================

If source supplies a Course boundary:

store/reconcile it as Course-wide geometry.

Boundary helps validate:

whether Tee/Basket candidate plausibly belongs to Course.

But Course boundary is not required.

==================================================
36. DISTANCE SANITY CHECK
==================================================

After candidate Tee/Basket pairing:

calculate direct Tee → Basket distance.

Flag clearly impossible values.

Do NOT use one universal hard cutoff that rejects unusual legitimate holes.

Use broad sanity diagnostics.

==================================================
37. HOLE ORDER SANITY
==================================================

Where sequence is known:

check that:

Hole refs are coherent

duplicate refs are intentional

special Holes are preserved.

Do not renumber source data automatically.

==================================================
38. AUTO-BUILD PHYSICAL COURSE
==================================================

If a source provides:

Course identity

Holes

Tee points

Basket points

DGD should automatically build source-backed physical Course assets.

These begin with source confidence.

Do not require humans to redraw every known coordinate.

==================================================
39. AUTO-BUILD LAYOUT
==================================================

If source also explicitly provides:

Hole order

Tee selection

Basket selection

Par

then automatically create/match:

Layout Draft.

==================================================
40. PARTIAL AUTO-BUILD
==================================================

Example:

18 Hole layout

18 Tees known

14 Baskets known.

Expected:

physical assets created/matched

Layout Draft created if sequence/Par support it

4 Baskets remain:

MISSING GEOMETRY.

Do not refuse the entire import.

==================================================
41. COURSE STUDIO INTEGRATION
==================================================

Imported coordinates appear on the SAME Course Studio map.

Visual source state:

solid:
verified/public

outlined:
source candidate

warning:
conflict

ghost:
unassigned observation.

==================================================
42. REVIEW SOURCE CANDIDATES
==================================================

Course Studio mode:

SOURCE CANDIDATES.

Toggle:

OSM

PDGA

UDisc

DGS

GPS

Other.

Allow steward/admin to approve or reject candidates.

==================================================
43. ONE-CLICK ACCEPT
==================================================

Example:

Hole 12 Basket Candidate
Source: Open map data
High confidence

[Accept]
[Move]
[Reject].

Accept attaches to canonical Basket Position.

==================================================
44. BULK ACCEPT
==================================================

If one Course has:

18 Tees
18 Baskets

all strongly matched and no conflicts:

authorized reviewer can:

ACCEPT 36 HIGH-CONFIDENCE FEATURES.

Show preview first.

==================================================
45. NEVER BULK ACCEPT CONFLICTS
==================================================

Conflicting/ambiguous geometry excluded from bulk approval.

==================================================
46. AUTOMATIC PUBLICATION POLICY
==================================================

Separate:

INGEST

MATCH

CANONICALIZE

PUBLISH.

Do not automatically publish low-confidence physical geometry.

Optional auto-publish may eventually be enabled only for:

approved source class

strong exact structural match

no conflicting verified geometry

validated Course identity.

Default conservative behavior is acceptable.

==================================================
47. USER-CONTRIBUTED GPS
==================================================

Course Studio mobile should remain a first-class gap-filling source.

Buttons:

TEE AT MY LOCATION

BASKET AT MY LOCATION.

Capture:

GPS coordinate

accuracy radius

timestamp

Course

Hole

asset type.

==================================================
48. GPS ACCURACY
==================================================

Never pretend phone GPS is exact.

Store device-reported accuracy where available.

Example:

±12 ft.

==================================================
49. GPS MULTI-SAMPLE
==================================================

Optional improved mapping:

Stand on Tee

Collect 5–10 seconds of samples

remove obvious outliers

derive stable point

save accuracy estimate.

Same for Basket.

==================================================
50. OFFLINE GPS MAPPING
==================================================

Allow field mapping without signal.

Queue locally:

Course

Hole

asset type

coordinate

accuracy

time.

Sync when connection returns.

Prevent duplicate submission after reconnect.

==================================================
51. GPS CONTRIBUTOR STATUS
==================================================

Normal contributor mappings on protected Course may become:

PROPOSED GEOMETRY.

Trusted Course Steward may have direct-save capability according to Course
permissions.

==================================================
52. COURSE MAP IMPORTS
==================================================

Allow authorized import of legitimate:

GPX

KML

GeoJSON

CSV coordinates.

Always preview.

User maps imported features to:

Hole
Tee
Basket.

Do not blindly insert.

==================================================
53. CSV FORMAT
==================================================

Support practical columns such as:

course

hole

feature_type

tee_name

basket_position

latitude

longitude

source.

Validate every row.

==================================================
54. MACHINE INFERENCE
==================================================

Do NOT treat computer-vision detection from aerial imagery as verified
coordinates.

Future image inference may generate:

CANDIDATES ONLY.

Never authoritative permanent geometry.

==================================================
55. NATIONAL GEOMETRY JOB PIPELINE
==================================================

Conceptually:

COURSE GEOMETRY DISCOVERY

→ FETCH SOURCE DATA

→ PARSE FEATURES

→ MATCH COURSE

→ MATCH HOLES

→ MATCH PHYSICAL ASSETS

→ VALIDATE

→ CREATE CANDIDATES

→ AUTO-ACCEPT WHERE POLICY ALLOWS

→ REVIEW

→ COURSE STUDIO.

==================================================
56. DURABLE QUEUES
==================================================

Use durable server-side background queues.

Separate at least:

geometry-hot

geometry-normal

geometry-backfill

geometry-review/reparse

if useful.

Do not rely on the admin browser staying open.

==================================================
57. HOT GEOMETRY
==================================================

Prioritize:

Course selected for upcoming Event

Course user is currently editing

Course user explicitly requests

Course missing only a few coordinates.

==================================================
58. NATIONAL BACKFILL
==================================================

Process remaining United States Courses continuously at lower priority.

==================================================
59. STATE-BY-STATE PROCESSING
==================================================

National progress should be resumable by state/region.

Do not restart entire country after failure.

==================================================
60. IDEMPOTENCY
==================================================

Repeated source processing must NOT create duplicates.

Stable keys should include:

source

external feature ID

source version

canonical asset relation where applicable.

==================================================
61. SOURCE CHANGE
==================================================

If source element changes coordinate:

record new observation/version.

Do not mutate canonical verified coordinate without reconciliation.

==================================================
62. SOURCE DELETION
==================================================

If external feature disappears:

do not immediately delete canonical asset.

Mark source observation:

NO LONGER PRESENT / STALE

and evaluate.

==================================================
63. REFRESH CADENCE
==================================================

Recently mapped / active Event Courses:

refresh sooner.

Stable verified Courses:

refresh much less often.

Do not repeatedly re-download unchanged geometry.

==================================================
64. CONTENT HASH / VERSION
==================================================

If source geometry unchanged:

skip downstream rematching.

==================================================
65. NATIONAL COVERAGE DASHBOARD
==================================================

Data Intelligence
→ Course Atlas
→ Geometry.

Top metrics:

CANONICAL US COURSES

COURSES WITH ANY HOLE GEOMETRY

COURSES WITH ALL PRIMARY TEES

COURSES WITH ALL PRIMARY BASKETS

FULLY MAPPED COURSES

TEES KNOWN

BASKET POSITIONS KNOWN

UNASSIGNED TEES

UNASSIGNED BASKETS

GEOMETRY CONFLICTS.

==================================================
66. DO NOT REPORT ONLY PERCENTAGES
==================================================

Show exact counts.

Example:

5,432 / 13,056 Courses have at least one mapped Hole.

Use actual project values.

==================================================
67. STATE COVERAGE
==================================================

Table:

State

Courses

Courses with Geometry

Primary Tees Known

Primary Baskets Known

Fully Mapped

Missing One Asset

Conflicts

Last Pass.

==================================================
68. DRILLDOWN
==================================================

Click state.

Show:

Courses requiring geometry.

Sort:

Closest to Complete

Upcoming Event

Most Source Data Available

Zero Geometry.

==================================================
69. COURSE GEOMETRY STATUS
==================================================

Per Course show:

18 physical Holes

18/18 primary Tees mapped

16/18 primary Baskets mapped

2 missing

3 alternate Tees

5 alternate Basket positions

1 conflict.

==================================================
70. NEXT BEST ACTION
==================================================

Course should have one clear geometry action:

MAP BASKETS 7 AND 15

or:

REVIEW 4 SOURCE CANDIDATES

or:

MATCH 2 UNASSIGNED TEES.

==================================================
71. NATIONAL IMPORT ACTION
==================================================

Admin action:

RUN NATIONAL GEOMETRY PASS.

This queues controlled server work.

Do not perform it directly in browser.

==================================================
72. STATE IMPORT ACTION
==================================================

RUN STATE:

Indiana
California
Texas

etc.

Useful for QA and controlled rollout.

==================================================
73. COURSE REFRESH
==================================================

Per Course:

REFRESH GEOMETRY SOURCES.

Queues a high-priority job.

==================================================
74. JOB HEALTH
==================================================

Show:

Waiting

Running

Retrying

Completed today

Failed

Dead letter

Oldest job

Throughput/hour.

==================================================
75. SOURCE HEALTH
==================================================

Each geometry source:

Healthy

Rate limited

Degraded

Parser changed

Paused.

Show:

last success

features parsed

matches

conflicts

errors.

==================================================
76. PARSER HEALTH
==================================================

Detect sudden feature-count drops.

Example:

Yesterday source returned:
34,000 Tee/Basket features

Today:
400.

Flag parser/source regression.

Do not silently delete geometry.

==================================================
77. REVIEW QUEUES
==================================================

Dedicated queues:

COURSE MATCH

HOLE MATCH

UNASSIGNED TEES

UNASSIGNED BASKETS

GEOMETRY CONFLICTS

POSSIBLE ALT TEE

POSSIBLE ALT BASKET

INVALID COORDINATES

SOURCE REMOVED.

==================================================
78. INVALID COORDINATES
==================================================

Flag:

0,0

outside Course region

invalid latitude/longitude

obvious swapped coordinates

gross Course mismatch.

==================================================
79. LAT/LON ORDER
==================================================

When creating geographic points:

ensure geographic coordinate construction follows the project's PostGIS
convention correctly.

Create automated tests preventing swapped:

latitude / longitude.

==================================================
80. SPATIAL INDEXES
==================================================

Canonical Tee and Basket point geometry must be efficiently queryable.

Use appropriate PostGIS spatial indexes where useful.

==================================================
81. COURSE BOUNDING QUERY
==================================================

To match source features:

query only features within/near selected Course area.

Do not compare every Tee candidate nationally against every Course.

==================================================
82. GEOMETRY PROVENANCE
==================================================

Every canonical Tee/Basket should expose internally:

Current coordinate

Verified state

Source(s)

Last confirmed

Last changed

History.

==================================================
83. MULTI-SOURCE CONSENSUS
==================================================

When independent sources agree closely:

increase confidence.

Example:

OSM Tee

DGD GPS Tee

both nearly identical.

Show:

MULTI-SOURCE CONFIRMED.

==================================================
84. DISAGREEMENT
==================================================

When sources disagree beyond tolerance:

do NOT average the coordinates.

Show both.

Require resolution.

==================================================
85. TEE SURFACE
==================================================

If source legitimately provides Tee surface:

concrete

turf

rubber

natural

etc.

store it as metadata.

Geometry ingestion may enrich the physical Tee object.

==================================================
86. TEE COLOR
==================================================

Preserve source Tee color/name where present.

Multiple layouts may reference the same physical Tee.

==================================================
87. BASKET METADATA
==================================================

Preserve:

position name

target type/model if legitimately known

current/alternate position relationships

without conflating with coordinate identity.

==================================================
88. PRACTICE BASKET SAFETY
==================================================

A practice basket must not automatically become:

Hole Basket.

Require Hole relationship evidence.

==================================================
89. TEMPORARY BASKETS
==================================================

Event-only temporary baskets should remain:

EVENT OVERLAY

unless explicitly promoted as permanent Course assets.

==================================================
90. LAYOUT AUTO-CONSTRUCTION
==================================================

Once enough physical geometry exists:

Layouts should reference it.

Example:

Main 18

Hole 1:
Blue Tee → Basket A

Hole 2:
Main Tee → Basket B.

No copied coordinate records.

==================================================
91. MAP DISTANCE
==================================================

Once Tee + Basket Position coordinates are known:

derive:

straight-line map distance.

Store/display as:

MAP DISTANCE

unless it has been explicitly verified as official playing distance.

==================================================
92. FLIGHT PATH
==================================================

Do not invent curved flight path.

Direct Tee → Basket line may be shown as:

DIRECT LINE.

A manually/source-defined flight path is separate.

==================================================
93. AUTO-CADDY BENEFIT
==================================================

Once physical geometry is mapped:

Caddy immediately receives:

Tee location

Basket location

direct distance

orientation

elevation where supported by permitted data.

No duplicate geometry ingestion.

==================================================
94. EVENT BENEFIT
==================================================

Event Director selecting Course/Layout should use these canonical physical
assets.

Do not create Event-specific copies unless Event Overlay modifies them.

==================================================
95. TEE SIGN BENEFIT
==================================================

Generated tee signs use:

canonical Tee

Basket position

Layout

distance

rules.

==================================================
96. COURSE DIRECTORY STATUS
==================================================

Course card can show:

Mapped 18/18

or:

Map needs 4 baskets.

But incomplete Course remains visible.

==================================================
97. HELP MAP CTA
==================================================

For missing geometry:

HELP MAP.

Open Course Studio directly to:

next missing Tee/Basket.

==================================================
98. FIELD MAPPING MODE
==================================================

Mobile Course Studio option:

WALK THE COURSE.

Workflow:

Hole 1

[Stand on Tee]
Save

Walk to Basket

[Stand at Basket]
Save

Next Hole.

Very simple.

==================================================
99. FIELD MODE LARGE CONTROLS
==================================================

Outdoor/mobile:

big buttons

GPS accuracy

current Hole

undo

next.

Do not show full desktop editor.

==================================================
100. MAP REMAINING ONLY
==================================================

Option:

MAP ONLY MISSING FEATURES.

If 16 of 18 Holes are complete:

start directly at missing Hole.

==================================================
101. VERIFY COURSE MODE
==================================================

Another field workflow:

VERIFY EXISTING MAP.

At each asset:

Looks Correct

Move Here

Needs Review.

==================================================
102. CONTRIBUTOR GAMIFICATION
==================================================

Verified mapping contributions may feed existing DGD Tier/service contribution
logic once.

Do not award repeatedly for the same physical asset.

==================================================
103. APPROVAL RULES
==================================================

New unmapped Course:

trusted contributor may have broad Draft mapping ability.

Published Course:

moving/removing established Tee/Basket may require approval according to
Course permissions.

==================================================
104. SOURCE IMPORT CANNOT BYPASS APPROVALS
==================================================

External refresh is not a backdoor that overwrites protected Course geometry.

==================================================
105. ADMIN OVERRIDE
==================================================

Global Admin may resolve conflicts.

Audit:

who

what

why

when.

==================================================
106. PUBLIC EDIT SECURITY
==================================================

Normal users cannot directly write:

canonical Tee coordinates

canonical Basket coordinates

source confidence

source provenance.

They submit allowed changes/proposals.

==================================================
107. RLS
==================================================

Source/ingestion tables:

admin/server access.

Canonical public Course geometry:

readable according to Course visibility.

Edits:

Course capability policies.

Do not rely on frontend buttons.

==================================================
108. DATA API GRANTS
==================================================

Explicitly grant only the tables/views/functions the app should use.

RLS remains separate.

New ingestion/admin tables should normally NOT be exposed broadly.

==================================================
109. VIEWS
==================================================

Any exposed views must preserve Course RLS.

Use secure current Supabase practices.

==================================================
110. BACKGROUND WORKER SECURITY
==================================================

Source credentials/API tokens if any:

server-side only.

Never expose them in Lovable/frontend environment variables.

==================================================
111. EXISTING GEOMETRY BACKFILL
==================================================

Before national import:

index/match all existing DGD Course geometry.

Do not recreate:

current mapped Tees

current mapped Baskets.

External source observations should reconcile against them.

==================================================
112. INITIAL NATIONAL PASS
==================================================

Order:

1. Index current canonical Courses
2. Index current physical geometry
3. Pull open/authorized national source geometry
4. Match Courses
5. Match Holes
6. Match Tees/Baskets
7. Create candidates
8. Auto-accept only policy-safe matches
9. Queue ambiguous cases
10. Update Course Atlas coverage.

==================================================
113. DO NOT REINGEST COURSES UNNECESSARILY
==================================================

Geometry harvesting should be able to run against existing:

course_id

without rebuilding Course identity.

==================================================
114. MULTI-STATE QA
==================================================

Test real existing DGD Courses in:

Indiana

Illinois

California

Texas

Colorado

Florida

North Carolina

Washington

Northeast.

Confirm geometry is not NWI-only.

==================================================
115. SOURCE COVERAGE QA
==================================================

For each source:

sample imported Tees/Baskets manually.

Verify coordinates correspond to correct Course/Hole.

==================================================
116. COURSE WITH COMPLETE SOURCE GEOMETRY
==================================================

Expected:

Tee/Basket assets automatically matched.

Course Studio displays them.

Layout can reference them.

No manual redraw.

==================================================
117. COURSE WITH PARTIAL SOURCE GEOMETRY
==================================================

Expected:

known assets imported.

Missing assets listed.

No fake coordinates.

==================================================
118. COURSE WITH NO SOURCE GEOMETRY
==================================================

Expected:

Course remains in Directory.

Status:

MAP NEEDED.

Offer:

Walk Course

Map on Satellite

Import File.

==================================================
119. ALTERNATE TEE TEST
==================================================

Source has:

Blue + White Tee.

Expected:

two physical Tee assets.

No duplication across Layouts.

==================================================
120. ALTERNATE BASKET TEST
==================================================

Source has:

A + B Basket Positions.

Expected:

two Basket Position assets.

Layout references correct one.

==================================================
121. SAME PARK TWO COURSES TEST
==================================================

Ensure source geometry does not leak between Courses.

==================================================
122. PRACTICE BASKET TEST
==================================================

Practice Basket near Hole 1.

Expected:

not automatically assigned as Hole 1 Basket.

==================================================
123. CONFLICT TEST
==================================================

Verified DGD Basket and external candidate differ significantly.

Expected:

conflict.

No auto-overwrite.

==================================================
124. SOURCE UPDATE TEST
==================================================

External coordinate changes.

Expected:

new observation/version.

Current verified geometry preserved until reconciled.

==================================================
125. OFFLINE FIELD TEST
==================================================

Map two Holes offline.

Reconnect.

Expected:

each asset syncs once.

==================================================
126. IDEMPOTENCY TEST
==================================================

Run national import twice.

Expected:

no duplicate physical Tees/Baskets.

==================================================
127. PERFORMANCE TEST
==================================================

National ingestion does not:

freeze browser

load all geometry client-side

or make Course Directory slower.

==================================================
128. COURSE STUDIO PERFORMANCE
==================================================

When opening one Course:

load that Course's physical geometry only.

Do not load nationwide tee/basket observations.

==================================================
129. NATIONAL GEOMETRY PROGRESS
==================================================

Admin should eventually be able to answer:

How many Courses have all primary Tees?

How many have all primary Baskets?

How many physical Tees do we know?

How many Basket Positions?

How many came from each source?

How many need field mapping?

==================================================
130. COMPLETION DEFINITION
==================================================

Do NOT define completion as:

Every U.S. Course has coordinates.

That cannot be guaranteed when no legitimate source or mapper has supplied
them.

Define automation completion as:

EVERY CANONICAL U.S. COURSE HAS BEEN CHECKED AGAINST EVERY ENABLED LEGITIMATE
GEOMETRY SOURCE.

Every source-backed Tee/Basket coordinate has been:

matched

or:

placed into an explicit review state.

Every remaining missing asset has an actionable reason:

NO SOURCE GEOMETRY

AMBIGUOUS MATCH

CONFLICT

NEEDS FIELD MAPPING

NEEDS IMPORT

etc.

==================================================
131. HARD RULE
==================================================

NEVER CREATE A FAKE TEE OR BASKET COORDINATE JUST TO MAKE COVERAGE REACH 100%.

UNKNOWN IS BETTER THAN WRONG.

==================================================
132. IMPLEMENTATION ORDER
==================================================

1. Audit existing canonical Course geometry schema
2. Audit existing mapped Tee/Basket data
3. Build geometry observation/provenance model if needed
4. Build source adapter interface
5. Add OpenStreetMap geometry adapter
6. Integrate existing authorized source geometry parsers
7. Build Course matcher
8. Build physical Hole matcher
9. Build Tee matcher
10. Build Basket matcher
11. Add alternate Tee/Basket support
12. Add geometry confidence/provenance
13. Add conflict detection
14. Add unassigned feature queues
15. Integrate Course Studio candidate layer
16. Add bulk review
17. Add GPS Walk Course mode
18. Add offline GPS capture
19. Add GPX/KML/GeoJSON/CSV import
20. Build geometry job queues/workers
21. Build state-by-state national processing
22. Build Course Atlas Geometry dashboard
23. Run existing geometry backfill
24. Run first national source pass
25. QA geographically distributed Courses
26. Add Event/Layout integration
27. RLS/Data API/security audit
28. Run database advisors
29. Fix failures
30. production-ready verification.

==================================================
133. COMPLETION REPORT
==================================================

Return:

A. canonical U.S. Courses checked
B. source geometry Courses found
C. Courses with any Tee coordinates
D. Courses with all primary Tees
E. Courses with any Basket coordinates
F. Courses with all primary Baskets
G. fully physically mapped Courses

H. total canonical physical Holes
I. total Tees
J. total Basket Positions

K. source observations by source
L. accepted geometry by source
M. multi-source confirmed assets

N. unassigned Tees
O. unassigned Baskets
P. geometry conflicts
Q. invalid coordinates
R. ambiguous Course matches

S. Courses requiring field mapping
T. Courses missing only one feature
U. state-by-state coverage

V. automatic Layouts improved from new geometry
W. Layouts reaching Map Ready
X. Courses reaching Caddy Ready

Y. queue health
Z. parser/source health

AA. RLS/security results
AB. Data API grant results
AC. database advisor results

AD. remaining unmapped Course count grouped by exact reason.

Do not hide missing geometry inside a generic "incomplete" number.