MASTER PHASE — DGD COURSE DATA ENGINE
NATIONAL COURSE INGESTION + SOURCE RECONCILIATION + AUTOMATIC LAYOUT BUILDING

Build a production-quality Course Data Ingestion system for DG Dashboard.

The purpose of this system is to:

1. Discover every legitimate Course possible.
2. Populate the canonical DGD Course Directory.
3. Reconcile PDGA, UDisc, Disc Golf Scene, DGD-native and user-submitted
   Course information into ONE Course identity.
4. Continuously enrich Course information.
5. Recover real Hole / Tee / Basket / Layout information where sources
   legitimately provide it.
6. Automatically construct source-backed Layout drafts.
7. Push incomplete Courses into Course Studio for community/steward mapping.
8. Preserve provenance, confidence, history and conflicts.
9. Never fabricate Course facts.

This should replace the current collection of partially separate:

PDGA Course ingestion
UDisc Course ingestion
Disc Golf Scene Course ingestion
Course Build-out
Course enrichment
layout backfill

workflows with one coordinated Course Data Engine.

==================================================
1. CORE ARCHITECTURE
==================================================

Use this pipeline:

SOURCE DISCOVERY
        ↓
SOURCE SNAPSHOT
        ↓
PARSE / NORMALIZE
        ↓
CANONICAL MATCHING
        ↓
COURSE IDENTITY
        ↓
LOCATION RESOLUTION
        ↓
DIRECTORY PUBLICATION
        ↓
FIELD RECONCILIATION
        ↓
PHYSICAL COURSE ASSET DISCOVERY
        ↓
LAYOUT DETECTION
        ↓
AUTO-LAYOUT BUILDER
        ↓
VALIDATION
        ↓
COURSE STUDIO / REVIEW
        ↓
PUBLISHED COURSE + LAYOUT VERSIONS

Every stage should be inspectable.

Do not hide failures inside a generic "sync failed" state.

==================================================
2. ONE CANONICAL COURSE
==================================================

Maintain ONE canonical:

course_id

for each real physical Course.

External listings become source links.

Example:

DGD Course:
Glenn Christopher Nicholson Disc Golf Course

Source Links:
PDGA #xxxxx
UDisc /courses/...
Disc Golf Scene #xxxxx

These are NOT three Courses.

==================================================
3. DO NOT REBUILD VALID COURSE TABLES BLINDLY
==================================================

Before schema changes:

audit the current DGD schema.

Identify existing canonical owners for:

Courses
Physical Holes
Tees
Basket Positions
Layouts
Layout Versions
Course features
Source records.

Reuse and migrate existing valid structures.

Do NOT automatically create:

courses_v2
holes_v2
layouts_v2

beside working tables.

==================================================
4. SOURCE ADAPTERS
==================================================

Build one adapter per supported source.

At minimum:

PDGA COURSE ADAPTER

UDISC COURSE ADAPTER

DISC GOLF SCENE COURSE ADAPTER

DGD NATIVE / USER SUBMISSION ADAPTER.

Each adapter independently handles:

discovery
detail fetch
parsing
normalization
source identity
source refresh
retry/backoff
parser version
rate limits
errors.

Do not create one giant brittle generic scraper.

==================================================
5. ACCESS RULE
==================================================

Only ingest information DGD is legitimately authorized to access.

Prefer:

official API/integration
authorized exports
public structured pages/data
approved public directory content.

Respect:

source terms
access restrictions
rate limits
reasonable refresh cadence.

Do NOT implement:

anti-bot bypass
authentication circumvention
CAPTCHA bypass
private-account scraping.

==================================================
6. RAW SOURCE SNAPSHOTS
==================================================

Preserve normalized raw/source observations where legally appropriate.

Conceptually:

course_source_snapshots

source
external_id
source_url
fetched_at
source_updated_at
http/status metadata
parser_version
content_hash
raw/normalized payload reference
parse_status.

This allows DGD to:

reparse stored data

without refetching every source.

==================================================
7. SOURCE PARSER VERSIONING
==================================================

Every parser needs a version.

Examples:

pdga-course@1.4.0
udisc-course@1.2.0
dgs-course@1.3.0.

When parser improves:

reparse stored source snapshots.

Do not require a nationwide redownload if stored source data is sufficient.

==================================================
8. NORMALIZED SOURCE COURSE
==================================================

Create/reuse normalized source Course observations.

Conceptually:

source_course_id
source
external_id
external_url
raw_name
normalized_name
address
city
state
postal_code
country
latitude
longitude
location_accuracy
reported_hole_count
course_status
established_year
designer
course_type
tee_type
basket/target type
access
fees
amenities
difficulty
description
source_rating
source_rating_count
source_fields
last_seen_at
last_parsed_at
parser_version.

These are SOURCE observations.

They are NOT automatically canonical truth.

==================================================
9. FIELD-LEVEL PROVENANCE
==================================================

Important Course facts must be explainable.

For canonical values retain:

value
source
source_entity
observed_at
confidence
verification state.

Admin should be able to click:

WHY THIS VALUE?

Example:

Hole count:
21

Evidence:

PDGA ........ 21
UDisc ....... 21
DGS ......... 21
Steward ..... verified 21

Canonical:
21.

==================================================
10. SOURCE CONFLICT MODEL
==================================================

If sources disagree:

do not overwrite history.

Example:

PDGA:
18 holes

UDisc:
21 holes

DGS:
21 holes.

Create:

SOURCE CONFLICT

and resolve according to:

verification
freshness
field-specific source authority
source agreement
steward/admin evidence.

==================================================
11. FIELD-SPECIFIC AUTHORITY
==================================================

Do not use one global source priority.

Different sources may be strongest for different information.

Examples:

verified DGD geometry
> external Course coordinates.

live DGD conditions
> stale directory description.

official source Event/Layout name
may be stronger than an inferred name.

Make reconciliation field-specific.

==================================================
12. CANONICAL MATCHING
==================================================

When a new source Course arrives:

search existing canonical Courses.

Signals:

explicit source links
normalized Course name
coordinates
distance between coordinates
address
park/property name
city/state
postal code
reported Hole count
established year
shared Event relationships.

==================================================
13. MATCH CONFIDENCE
==================================================

Use explainable confidence:

EXACT

HIGH

MEDIUM

LOW

REVIEW.

Store why.

Example:

96% MATCH

+35 name
+35 location
+20 address
+4 Hole count
+2 city.

Tune using real data.

==================================================
14. AUTO-MATCH
==================================================

Only auto-link at sufficiently strong confidence.

Medium confidence:

REVIEW.

Never aggressively merge uncertain Course identities merely to reduce
duplicate counts.

==================================================
15. SAME PROPERTY PROTECTION
==================================================

Protect:

North Course
South Course
Championship Course
Short Course
Course A
Course B.

Same:

address
park
coordinates

does not prove same Course.

==================================================
16. COURSE COMPLEX
==================================================

Support optional:

course_complex / property

where multiple legitimate Courses occupy one property.

Example:

Disc Golf Complex

├ North Course
└ South Course.

==================================================
17. COURSE VS LAYOUT DETECTION
==================================================

Some source listings may represent:

physical Course

Layout

alternate Tee configuration

alternate basket configuration.

Classifier states:

COURSE

LAYOUT_OF_EXISTING

SEPARATE_COURSE_SAME_PROPERTY

UNCERTAIN.

Do not automatically merge an uncertain listing into a Layout.

==================================================
18. LOCATION ENGINE
==================================================

Resolve Course location using strongest evidence.

Priority approximately:

1. DGD steward/admin verified location
2. trusted exact source coordinates
3. agreeing source coordinates
4. Course street address geocode
5. park/property geocode
6. manual review.

==================================================
19. NO FAKE LOCATION
==================================================

Never place a Course publicly at:

city centroid
state centroid
random ZIP centroid

and present it as accurate.

If only approximate information exists:

retain:

APPROXIMATE

or:

UNRESOLVED.

==================================================
20. LOCATION CONFIDENCE
==================================================

Use:

VERIFIED

HIGH

MEDIUM

APPROXIMATE

UNRESOLVED.

Store:

method
source
accuracy/confidence.

==================================================
21. CURRENT MISSING LOCATIONS
==================================================

Process all current DGD Courses with missing coordinates.

For each:

inspect source links
inspect stored source pages
try legitimate address resolution
validate result
save provenance.

Remaining unresolved Courses enter:

LOCATION REVIEW.

==================================================
22. GEO VALIDATION
==================================================

Detect bad coordinates.

Examples:

0,0

Course listed in Indiana but coordinate in California

ocean coordinates

large groups assigned exact city-center coordinate

state mismatch

country mismatch.

Do not publish clearly invalid pins.

==================================================
23. DIRECTORY READY
==================================================

Define explicit:

DIRECTORY_READY.

Minimum:

legitimate Course identity
usable representative location
not known duplicate
not invalid/hidden.

A Course does NOT require:

mapped Holes
mapped Tees
mapped Baskets
Layout
known Par

to appear in Course Directory.

==================================================
24. DIRECTORY PUBLICATION
==================================================

Publishing into Course Directory is a state/visibility decision on the same
canonical Course.

Do NOT create:

ingested Course

then copy into:

directory Course.

Same course_id.

==================================================
25. NATIONAL COURSE COVERAGE
==================================================

Run discovery by:

country
state/region
source cursor/page.

Maintain checkpoints.

Do not restart the entire United States after every worker failure.

==================================================
26. STATE COVERAGE
==================================================

Admin → Course Atlas should show:

STATE
CANONICAL COURSES
PDGA LINKED
UDISC LINKED
DGS LINKED
LOCATED
DIRECTORY READY
SCORING READY
MAP READY
VERIFIED
REVIEW REQUIRED.

==================================================
27. SOURCE OVERLAP
==================================================

Show:

PDGA only
UDisc only
DGS only
PDGA + UDisc
PDGA + DGS
UDisc + DGS
all sources.

This is more useful than targeting one external site's total.

==================================================
28. COMPLETENESS DIMENSIONS
==================================================

Track independently:

IDENTITY

LOCATION

SOURCE COVERAGE

COURSE DETAILS

PHYSICAL HOLES

TEES

BASKETS

SCORING

LAYOUT

MAP

CADDY

VERIFICATION.

Do not produce one misleading "complete" score only.

==================================================
29. "WHY IS THIS MISSING?"
==================================================

Every missing major field should have a reason when possible.

Example:

Basket coordinates missing

Reason:
No supported source supplied basket coordinates and no DGD contributor has
mapped them.

Layout Par missing

Reason:
Source has Hole count but no Hole-by-Hole Par.

==================================================
30. PHYSICAL COURSE FACTS
==================================================

Extract legitimate information about:

physical Holes
Tee pads
Basket / pin positions
Course-wide features
permanent rules

when supported by source data.

Never infer physical geometry from text alone.

==================================================
31. REPORTED HOLE COUNT ≠ PHYSICAL HOLES
==================================================

If source says:

18 holes

store:

reported_hole_count = 18.

Do NOT automatically create:

18 fake Holes.

==================================================
32. WHEN PHYSICAL HOLES MAY BE AUTO-CREATED
==================================================

Physical Hole identities MAY be created automatically when a source
explicitly enumerates individual Holes.

Example source provides:

Hole 1
Hole 2
...
Hole 18

with actual Hole-specific data.

Then DGD may create:

18 physical Hole candidates/identities

with provenance.

Do NOT add:

fake coordinates
fake Tee
fake Basket
fake Par

unless source explicitly supplies them.

==================================================
33. PAR RULE
==================================================

Never use:

Hole missing Par
→ Par 3.

Never use:

18 holes
→ Course Par 54.

Unknown Par remains:

NULL / —.

==================================================
34. PAR PROVENANCE AUDIT
==================================================

Audit all currently stored Par.

Classify:

SOURCE VERIFIED

DGD VERIFIED

LAYOUT-SPECIFIC

IMPORTED

LEGACY PLACEHOLDER

UNKNOWN PROVENANCE.

Flag suspicious:

all Holes Par 3

without evidence.

==================================================
35. DISTANCE RULE
==================================================

Do not fabricate Hole distance.

If source provides:

official distance

store source observation.

If DGD later has mapped Tee + Basket:

derive map distance separately.

Keep:

OFFICIAL DISTANCE

and:

MAP DISTANCE

distinct.

==================================================
36. TEE DETECTION
==================================================

Where source explicitly supplies Tee names:

White
Blue
Red
Long
Short

create/reconcile canonical Tee candidates.

No coordinate:

Tee identity may exist
location remains unknown.

==================================================
37. BASKET POSITION DETECTION
==================================================

Where source explicitly supplies:

A
B
C
Long
Short

Basket positions:

create/reconcile Basket Position candidates.

No coordinate:

do not invent one.

==================================================
38. SOURCE GEOMETRY
==================================================

If legitimate source provides:

Tee coordinate

Basket coordinate

Hole map geometry

ingest it as:

SOURCE OBSERVATION.

It is not automatically:

STEWARD VERIFIED.

==================================================
39. LAYOUT DETECTION
==================================================

Build a Layout Detector.

Look for explicit source evidence of:

Layout name

Hole sequence

Tee selection

Basket position

Hole Par

Hole distance

Hole labels

included/excluded Holes.

==================================================
40. LAYOUT SOURCES
==================================================

Possible legitimate evidence may come from:

Course detail pages

source Layout tables

official Course map data

source scoring layouts

Event Round Layout information

DGD-native data.

Never infer a full Layout from:

total Hole count + total Par

alone.

==================================================
41. LAYOUT CANDIDATE
==================================================

Normalized candidate:

source_layout_id

course_id

source

source_name

normalized_name

reported_hole_count

reported_total_par

reported_distance

hole_slots[]

confidence

source_version

first_seen

last_seen.

==================================================
42. SOURCE LAYOUT MATCHING
==================================================

Match candidate Layout against existing canonical Layouts using:

name

Hole count

Hole sequence

Tee choices

Basket positions

Pars

distances.

Do not create duplicate:

Main
Main Layout
Main 18

when evidence shows same Layout.

==================================================
43. AUTO-LAYOUT BUILDER
==================================================

Create:

AUTO BUILD LAYOUT

engine.

Input:

source-backed Layout candidate.

Output:

canonical Layout Draft / proposed Layout Version.

==================================================
44. AUTOMATIC LAYOUT LEVELS
==================================================

Classify generated Layouts:

LEVEL 0 — DETECTED

Layout identity/name found but insufficient Hole detail.

LEVEL 1 — STRUCTURE READY

Hole sequence known.

LEVEL 2 — SCORING READY

Every playable slot has:

physical Hole reference
Par.

LEVEL 3 — DISTANCE READY

Scoring ready +
usable distances.

LEVEL 4 — MAP READY

Every slot has:

selected Tee
selected Basket Position
mapped geometry.

LEVEL 5 — CADDY READY

Map ready +
important permanent rules/flight information where appropriate.

Do not treat these as the same state.

==================================================
45. AUTO-BUILD PHYSICAL REFERENCES
==================================================

For each source Layout slot:

resolve:

physical_hole_id

tee_id

basket_position_id.

If ambiguous:

flag that slot.

Do not silently bind to wrong asset.

==================================================
46. AUTO-CREATE PHYSICAL HOLE FROM EXPLICIT SLOT
==================================================

If source explicitly enumerates:

Hole 1

with source-backed identity

and no canonical Physical Hole exists:

DGD may create a physical Hole candidate.

But only from explicit Hole evidence.

Never from:

18 total Holes.

==================================================
47. LAYOUT SLOT
==================================================

Canonical Layout slot should reference:

position
display_label
physical_hole_id
tee_id
basket_position_id
par
official_distance where appropriate
rule references.

Do not store copied physical coordinates inside every Layout.

==================================================
48. ALTERNATE TEE LAYOUT
==================================================

Source:

White Layout

Blue Layout.

If both reuse same physical Holes:

create:

one set of physical Holes

two Layout configurations.

Do not duplicate Course geometry.

==================================================
49. ALTERNATE BASKET LAYOUT
==================================================

Same for:

A pins

B pins

Short

Long.

Map Basket Positions once.

Layouts reference them.

==================================================
50. MIXED LAYOUT
==================================================

Support:

Hole 1 Blue Tee / A Pin

Hole 2 White Tee / B Pin

Hole 3 Long Tee / C Pin.

No assumption that one Layout uses uniform Tee/Basket configuration.

==================================================
51. NON-STANDARD HOLE COUNTS
==================================================

Support:

6
9
12
18
20
21
24
27
arbitrary legitimate count.

Do not build around exactly 18.

==================================================
52. SPECIAL HOLE LABELS
==================================================

Support:

8A
8B
15A
A
B
Temp 1

as Layout display labels.

Do not corrupt Physical Hole identity.

==================================================
53. EVENT DATA AS LAYOUT EVIDENCE
==================================================

If Event source identifies:

Course
Layout name
Round Par
Hole count

use it as supporting evidence.

But:

Round total Par alone

cannot create full Hole-by-Hole Layout.

Create:

LAYOUT DETECTION / MATCH EVIDENCE

instead.

==================================================
54. AUTO-PUBLISH POLICY
==================================================

Automatic layout BUILDING and automatic layout PUBLISHING are separate.

Default:

AUTO-BUILD SOURCE-BACKED DRAFTS.

Do NOT automatically publish uncertain structural data.

Optional strict auto-publish may only occur when:

source policy permits
confidence exceeds configured threshold
all slots validate
no canonical conflict
no protected existing Layout conflict
source is considered sufficiently authoritative.

Default conservative behavior:

review before first public structural publication.

==================================================
55. EXISTING PUBLISHED LAYOUT
==================================================

If external source changes a Layout:

do NOT mutate published Layout Version.

Create:

PROPOSED NEW VERSION

with diff.

==================================================
56. LAYOUT DIFF
==================================================

Review screen:

CURRENT

vs

SOURCE PROPOSAL.

Show:

Hole added/removed

order changed

Tee changed

Basket changed

Par changed

distance changed.

==================================================
57. HIGH-CONFIDENCE AUTO-FIX
==================================================

Low-risk missing source metadata may be filled automatically.

Structural changes to published Course/Layout should respect existing DGD
approval rules.

==================================================
58. REVIEW QUEUES
==================================================

Create focused queues:

COURSE MATCH REVIEW

LOCATION REVIEW

COURSE VS LAYOUT REVIEW

SOURCE CONFLICT REVIEW

PAR PROVENANCE REVIEW

LAYOUT CANDIDATES

LAYOUT SLOT CONFLICTS

GEOMETRY REVIEW.

==================================================
59. AUTO-LAYOUT QUEUE
==================================================

Dedicated:

AUTO LAYOUTS

screen.

Columns:

Course

Source

Detected Layout

Holes

Par Coverage

Distance Coverage

Tee Coverage

Basket Coverage

Map Coverage

Confidence

State.

Actions:

Build Draft

Review

Ignore / Not a Layout.

==================================================
60. BATCH BUILD
==================================================

For high-confidence candidates:

allow:

BUILD 100 SOURCE-BACKED LAYOUT DRAFTS.

Do not auto-publish them merely because they were batch built.

==================================================
61. COURSE STUDIO HANDOFF
==================================================

Auto-built Draft appears immediately in:

same canonical Course Studio
→ Layouts.

No separate ingestion Layout editor.

==================================================
62. COURSE STUDIO SOURCE INDICATOR
==================================================

Example:

Main 18
AUTO-BUILT DRAFT

Source:
PDGA + UDisc

17 / 18 Holes resolved

[Review 1 Issue].

==================================================
63. NEXT ACTION ENGINE
==================================================

For incomplete auto-built Layout:

show one actionable next step.

Examples:

Resolve Hole 7 Tee

Map Basket 14B

Confirm Par on Hole 3

Match source Hole A to Physical Hole.

==================================================
64. COMMUNITY MAPPING
==================================================

If the only missing information is physical geometry:

Course Directory may show:

HELP MAP THIS COURSE.

Open canonical Course Studio.

==================================================
65. NO SECOND BUILDER
==================================================

The ingestion engine does not create its own Course Builder.

Everything eventually resolves into:

Course Directory
+
Course Studio.

==================================================
66. COURSE IMAGES / MAP REFERENCES
==================================================

Where source provides legitimate:

official Course map

PDF

image

web map

store appropriate reference/provenance.

Do not automatically copy copyrighted imagery into DGD unless permitted.

Use source map as reference material where allowed.

==================================================
67. GEO FILE IMPORT
==================================================

Support authorized:

GeoJSON
KML
GPX
CSV coordinate

imports.

Map imported features through preview.

Never blindly write imported geometry.

==================================================
68. AUTOMATIC LAYOUT VALIDATION
==================================================

Before Layout becomes SCORING READY validate:

all playable slots present

physical Hole reference valid

Par exists

sequence valid

no unintended duplicate slots

special labels valid.

==================================================
69. MAP VALIDATION
==================================================

Before MAP READY:

selected Tee coordinates exist

selected Basket Position coordinates exist

geometry valid.

==================================================
70. CADDY VALIDATION
==================================================

CADDY READY may validate:

critical permanent rules

Mando

OB

Hazard

DZ

flight path where useful.

Do not require cosmetic data.

==================================================
71. SOURCE FRESHNESS
==================================================

Track:

first_seen

last_seen

last_successful_fetch

last_changed

refresh_due.

==================================================
72. DIFFERENTIAL REFRESH
==================================================

Do not deep-fetch every Course constantly.

Priority:

upcoming Event Course

new Course

recently changed Course

Course with conflict

Course with missing Layout

stable Course later.

==================================================
73. SOURCE CHANGE DETECTION
==================================================

Use:

content hash

normalized field diff.

If source unchanged:

skip unnecessary downstream rebuild.

==================================================
74. QUEUE ARCHITECTURE
==================================================

Use durable server-side background work.

Separate queues by workload because priority should not depend on pretending a
FIFO queue supports arbitrary numeric priority.

Conceptually:

course-discovery-hot

course-discovery

course-detail-hot

course-detail

course-match

course-geocode

course-layout-detect

course-layout-build

course-reparse

course-review-seed.

==================================================
75. HOT COURSE WORK
==================================================

High priority:

Course requested by user

Course selected for upcoming DGD Event

newly submitted Course

Event Course missing Layout

Course currently being edited.

==================================================
76. NATIONAL BACKFILL
==================================================

Lower-priority:

full United States historical enrichment.

Do not let national backfill delay an Event Course needed tomorrow.

==================================================
77. IDEMPOTENT JOBS
==================================================

Workers may execute more than once safely.

Use stable identifiers/unique constraints.

Repeated processing must not create:

duplicate Course

duplicate source link

duplicate Layout

duplicate Hole

duplicate queue work.

==================================================
78. JOB FINGERPRINT
==================================================

Example:

PDGA|COURSE_DETAIL|12345|parser-1.4

or:

DGD|LAYOUT_BUILD|course-abc|source-layout-xyz|v2.

Reject duplicate active work.

==================================================
79. RETRY BEHAVIOR
==================================================

Classify failure.

RATE_LIMITED

TIMEOUT

SOURCE_DOWN

NOT_FOUND

PARSER_CHANGED

INVALID_DATA

MATCH_AMBIGUOUS

DATABASE_ERROR.

Use appropriate retry/backoff.

Do not loop endlessly.

==================================================
80. SOURCE CIRCUIT BREAKER
==================================================

If a source starts returning widespread:

403

429

5xx

parser failures

pause/slower that adapter.

Other adapters continue.

==================================================
81. CRON RESPONSIBILITY
==================================================

Cron should:

seed due jobs

start bounded workers

detect stalled jobs

refresh coverage summaries.

Do not run one enormous national crawl inside one Cron execution.

==================================================
82. WORKER RESPONSIBILITY
==================================================

Worker:

claims bounded batch

processes

records success/failure

archives/deletes completed queue item

exits.

Do not create endless Edge Functions.

==================================================
83. ADMIN COURSE DATA ENGINE
==================================================

Create:

ADMIN
→ DATA INTELLIGENCE
→ COURSE ATLAS.

Navigation:

OVERVIEW

COVERAGE

SOURCES

INGESTION

AUTO LAYOUTS

CONFLICTS

REVIEW

QUEUE HEALTH

PARSER HEALTH.

==================================================
84. OVERVIEW
==================================================

Show:

Canonical U.S. Courses

Located

Directory Ready

PDGA Linked

UDisc Linked

DGS Linked

Layouts Detected

Auto-Built Layouts

Scoring Ready

Map Ready

Conflicts

Review Required.

==================================================
85. SOURCE HEALTH
==================================================

Each source card:

PDGA
status
last pass
items discovered
last success
errors
rate-limit state
parser version.

Same for other supported sources.

Never show Healthy merely because queue is empty.

==================================================
86. RUN DISCOVERY
==================================================

Actions:

Run Indiana

Run Region

Run National Discovery

Refresh Selected Course

Reparse Stored Data.

These should enqueue controlled work.

The browser does NOT perform the crawl.

==================================================
87. INGEST URL
==================================================

Keep/improve:

INGEST SOURCE URL.

User/admin may paste supported Course URL.

System:

identifies adapter

fetches through server

parses

matches

enriches canonical Course.

Pasting a URL does not create a duplicate Course automatically.

==================================================
88. INGEST SEARCH
==================================================

Search source by:

Course name

city/state

external ID

where adapter supports it.

Useful for resolving missing Course source links.

==================================================
89. COURSE INSPECTOR
==================================================

Admin source inspector:

CANONICAL COURSE

Source Links

Canonical Values

Source Observations

Conflicts

Layouts

Physical Assets

Queue activity

History.

==================================================
90. VALUE LINEAGE
==================================================

Example:

ESTABLISHED
1992

PDGA:
1992

UDisc:
1992

DGS:
—

Canonical decision:
source consensus.

==================================================
91. LAYOUT LINEAGE
==================================================

Example:

MAIN 18

Detected:
PDGA
UDisc

Hole sequence:
agreement 18 / 18

Par:
18 / 18

Tee:
18 / 18

Basket:
15 / 18

Map:
9 / 18.

==================================================
92. DIRECTORY MAP
==================================================

All DIRECTORY_READY Courses appear on the same canonical Course map.

No separate ingestion map.

==================================================
93. POSTGIS
==================================================

Use proper PostGIS types and spatial indexes for canonical Course points and
appropriate geometry.

Do not rely only on unindexed decimal latitude/longitude for nationwide map
queries.

==================================================
94. VIEWPORT QUERY
==================================================

Course Directory queries:

visible bounding box.

Low zoom:

clusters.

High zoom:

individual Course pins.

Detailed Hole geometry loads only for selected Course.

==================================================
95. RLS / SECURITY
==================================================

Source ingestion operations are server/admin only.

Public user must NOT be able to:

modify source links

run crawlers

alter confidence

approve canonical conflicts

publish external structural changes.

==================================================
96. PUBLIC COURSE READ
==================================================

Normal users may read:

published canonical Course information

according to visibility.

Source internals remain private/admin as appropriate.

==================================================
97. CONTRIBUTOR ACCESS
==================================================

Authenticated contributors can:

create Course Drafts

submit corrections

help map Course

according to existing permission model.

They cannot alter raw ingestion provenance.

==================================================
98. VIEWS
==================================================

If creating:

Course Directory views

coverage views

layout readiness views

ensure exposed views preserve RLS using current secure-view practices.

==================================================
99. DATA API
==================================================

Check Data API grants separately from RLS.

Do not assume a table becomes client-accessible merely because RLS policies
exist.

==================================================
100. SECURITY DEFINER
==================================================

Avoid SECURITY DEFINER as a shortcut.

If genuinely necessary:

non-exposed schema

explicit authorization

restricted EXECUTE grants

security advisor verification.

==================================================
101. EXISTING DATA BACKFILL
==================================================

Do not start Course Atlas from zero.

Process all current:

Courses

source records

layouts

physical Holes

tees

baskets.

Backfill:

source links

provenance

confidence

readiness.

==================================================
102. EXISTING FAKE DATA
==================================================

Detect likely legacy placeholders.

Examples:

18 Holes all Par 3

Main Layout Par 54

0 ft distance

Default Layout

identical generated Hole metadata.

Do not delete blindly.

Flag:

LEGACY PLACEHOLDER.

Preserve historical Round snapshots.

==================================================
103. AUTO-LAYOUT EXISTING COURSES
==================================================

For each current Course:

collect source Layout candidates.

Attempt:

match existing Layout

or

build source-backed Draft.

Do not overwrite existing verified Layout.

==================================================
104. SOURCE AGREEMENT BOOST
==================================================

When two or more independent sources agree on:

Layout name

Hole sequence

Par

distance

Tee/Basket configuration

increase confidence.

Still preserve provenance.

==================================================
105. SOURCE DISAGREEMENT
==================================================

Example:

PDGA Main:
18 Holes · Par 57

UDisc Main:
18 Holes · Par 58.

Do not average.

Create conflict.

==================================================
106. AUTO-LAYOUT NEVER INVENTS
==================================================

The auto-builder may:

copy
normalize
match
reference
derive

only from legitimate known data.

It may NOT hallucinate:

missing Par

missing Hole number

Tee location

Basket location

OB

Mando

flight path.

==================================================
107. DERIVED DATA
==================================================

Derived values are allowed when mathematically/geospatially valid.

Examples:

Layout Par =
sum of known Layout slot Pars.

Map distance =
geodesic Tee → Basket.

But mark as:

DERIVED

not:

SOURCE PROVIDED.

==================================================
108. PARTIAL TOTALS
==================================================

If Layout distance incomplete:

show:

Distance incomplete

or:

5,214+ ft

rather than pretending exact total.

==================================================
109. AUTOMATIC EVENT BENEFIT
==================================================

When Event selects Course with no scoring-ready Layout:

automatically enqueue:

Course source refresh

Layout detection

Layout build.

Event Director may see:

Preparing Course Layout...

and then review result.

Do not block Event creation entirely.

==================================================
110. EVENT SAFETY
==================================================

Event may only pin:

published/approved Layout Version

or explicitly authorized Event-specific Draft according to Event rules.

Do not silently use an uncertain auto-generated Layout for official play.

==================================================
111. CADDY BENEFIT
==================================================

As physical Course data becomes available:

same Course Studio information automatically feeds:

Caddy

Tee signs

Course maps

Event guides.

No duplicate Caddy data.

==================================================
112. STATBOARD BENEFIT
==================================================

Historical / imported Rounds can match:

course_id

layout_id

layout_version_id

when confidently resolvable.

Do not remap uncertain historic Rounds silently.

==================================================
113. DATA QUALITY METRICS
==================================================

Measure:

source match precision

duplicate Course rate

location resolution rate

source conflict rate

auto-layout detection rate

auto-layout build rate

scoring-ready rate

map-ready rate

review acceptance rate.

==================================================
114. RANDOM SAMPLE QA
==================================================

After national passes:

sample Courses from every state.

Verify:

identity

city/state

coordinates

Hole count

source links

Layout candidates

Par provenance.

Automated ingestion success alone is not sufficient QA.

==================================================
115. ACCEPTANCE — SAME COURSE THREE SOURCES
==================================================

PDGA + UDisc + DGS describe same real Course.

Expected:

ONE canonical Course.

Three source links.

No duplicate map pins.

==================================================
116. ACCEPTANCE — SOURCE-ONLY COURSE
==================================================

Legitimate Course only exists in one supported source.

Good location.

Expected:

canonical Course

Directory Ready

source provenance retained.

Multiple-source confirmation not required.

==================================================
117. ACCEPTANCE — MULTI-COURSE PARK
==================================================

Two physical Courses share one property.

Expected:

two canonical Courses.

No accidental merge.

==================================================
118. ACCEPTANCE — HOLE COUNT ONLY
==================================================

Source says:

18 holes.

Nothing else.

Expected:

reported_hole_count = 18.

NO:

18 fake Hole rows

Par 54

fake Layout.

==================================================
119. ACCEPTANCE — EXPLICIT HOLES
==================================================

Source explicitly supplies:

Holes 1–18

Par + distance.

Expected:

source-backed physical Hole candidates may be created.

Auto-layout Draft can become:

SCORING READY

if all canonical validation passes.

No geometry invented.

==================================================
120. ACCEPTANCE — FULL GEOMETRY
==================================================

Trusted supported source supplies:

Hole sequence

Tee coordinates

Basket coordinates

Par

distance.

Expected:

Course physical assets matched/created as source observations.

Auto Layout Draft reaches:

MAP READY

subject to validation/approval policy.

==================================================
121. ACCEPTANCE — ALT TEES
==================================================

White and Blue Layouts use same Holes.

Expected:

physical Holes shared.

distinct Tee references.

No duplicated geometry.

==================================================
122. ACCEPTANCE — ALT PINS
==================================================

A/B pin positions.

Expected:

one Physical Hole

multiple Basket Positions

Layouts select correct position.

==================================================
123. ACCEPTANCE — SOURCE CONFLICT
==================================================

PDGA:
Par 57.

UDisc:
Par 58.

Expected:

conflict.

No averaging.

No arbitrary overwrite.

==================================================
124. ACCEPTANCE — REPARSE
==================================================

Parser bug fixed.

Reparse stored source snapshot.

Expected:

canonical observation updates

no external refetch necessary when stored data sufficient

no duplicate Course/Layout.

==================================================
125. ACCEPTANCE — SOURCE RETRY
==================================================

Adapter receives 429.

Expected:

backoff

job remains durable

other source adapters continue.

==================================================
126. ACCEPTANCE — WORKER CRASH
==================================================

Worker crashes after claiming Course job.

Expected:

job becomes available again according to queue visibility behavior.

No duplicate canonical Course.

==================================================
127. ACCEPTANCE — NATIONAL MAP
==================================================

Open U.S. Course Directory.

Expected:

clusters

not thousands of individual browser-loaded markers.

Zoom local:

individual Courses.

==================================================
128. ACCEPTANCE — HELP MAP
==================================================

Auto-built Layout is Scoring Ready but missing geometry.

Course card:

Map needed.

Help Map:

opens same Course Studio.

==================================================
129. ACCEPTANCE — EXISTING VERIFIED COURSE
==================================================

Source refresh disagrees with steward-verified Basket.

Expected:

source observation recorded.

Verified canonical Basket NOT silently moved.

==================================================
130. ACCEPTANCE — PUBLISHED LAYOUT CHANGE
==================================================

Source changes a Hole Par.

Expected:

new Layout proposal/version candidate.

Old published Layout Version remains immutable.

==================================================
131. IMPLEMENTATION ORDER
==================================================

1. Audit current Course ingestion/schema
2. Identify canonical tables
3. Consolidate current source ingestion paths
4. Build source adapter interface
5. Normalize source Course model
6. Add parser versioning
7. Add source snapshot/reparse support
8. Build field provenance
9. Build Course matcher
10. Build source-link backfill
11. Build location resolver
12. Process missing Course locations
13. Define Directory Ready
14. Build PostGIS viewport/cluster map
15. Build state coverage
16. Audit Par provenance
17. Build physical Hole extraction
18. Build Tee/Basket extraction
19. Build Layout detector
20. Build Layout matcher
21. Build Auto-Layout Builder
22. Build Layout validation/readiness
23. Build conflict/review queues
24. Integrate with Course Studio
25. Integrate with Event Director
26. Build Course Data Engine admin UI
27. Build durable worker queues
28. Add bounded scheduling
29. Run nationwide backfill
30. QA state-by-state samples
31. RLS/security audit
32. database advisors
33. regression tests
34. production-ready verification.

==================================================
132. COMPLETION REPORT
==================================================

Return:

A. canonical Course count
B. source Course counts
C. PDGA links
D. UDisc links
E. DGS links
F. multi-source matches
G. unresolved duplicate candidates
H. Courses missing location
I. location provenance breakdown
J. Directory Ready count
K. Par provenance audit
L. legacy placeholders identified
M. physical Holes discovered
N. Tees discovered
O. Basket Positions discovered
P. Layout candidates detected
Q. Layouts automatically built
R. Scoring Ready auto-layouts
S. Map Ready auto-layouts
T. Layout conflicts
U. review queue size
V. state-by-state coverage
W. queue health
X. source health
Y. parser versions
Z. map performance
AA. RLS/security/advisor findings
AB. remaining blockers.

Do not mark an automatically generated Layout as complete merely because a
record exists.

Report separately:

DETECTED
BUILT
SCORING READY
MAP READY
CADDY READY
PUBLISHED.