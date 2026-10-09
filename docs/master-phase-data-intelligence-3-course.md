MASTER PHASE — DGD DATA INTELLIGENCE 3.0
COURSE ATLAS CONTROL CENTER + INGESTION HEALTH + DIRECTORY MAP GUARANTEE

Rework the entire DGD Data Intelligence / Course ingestion administration
experience.

The primary objective of this phase is:

EVERY LEGITIMATE COURSE DGD KNOWS ABOUT WITH A VALID LOCATION SHOULD APPEAR
ON THE CANONICAL COURSE DIRECTORY MAP.

At the same time:

- external source records must reconcile correctly
- duplicate Courses must not produce duplicate pins
- missing locations must be repaired
- invalid/approximate locations must be identified
- real source-backed Layouts should be constructed automatically
- placeholder Layouts/Par must not masquerade as real data
- every important value must have provenance
- every ingestion failure must explain why
- background ingestion must be durable and observable
- all Data Intelligence pages must report the SAME canonical definitions

This is not merely a UI redesign.

Fix the DATA PIPELINE, DATA DEFINITIONS, MAP QUERY, INGESTION HEALTH,
and then redesign the admin experience around the repaired system.

==================================================
0. FIRST — DO NOT TRUST THE CURRENT COUNTS
==================================================

The current admin screens display several different numbers:

Data Intelligence currently shows approximately:

13,056 Courses
13,824 Layouts

PDGA processing currently shows approximately:

12,563 Courses known
12,004 Courses on map

Course Build-out currently shows approximately:

20,617 source Course listings
13,107 read
7,508 set aside

These numbers may represent different entity populations.

DO NOT try to force them to match artificially.

First identify precisely what every count represents.

Create a DATA DEFINITIONS audit such as:

SOURCE LISTING
A listing discovered on PDGA/UDisc/DGS/etc.

SOURCE COURSE
A parsed Course observation from one external source.

CANONICAL COURSE
One real-world Course represented by one DGD course_id.

DIRECTORY READY
Canonical Course that may appear publicly.

DIRECTORY PIN READY
Directory-ready Course with usable representative coordinates.

SCORING READY
Has at least one legitimate scoring-ready Layout.

HOLE MAP READY
Has sufficient Tee/Basket geometry for mapped play.

CADDY READY
Has sufficient map/rule information for full caddy functionality.

Do not use the word:

"Courses"

for all of these without qualification.

==================================================
1. REBUILD DATA INTELLIGENCE INFORMATION ARCHITECTURE
==================================================

Replace the fragmented current model:

Data Intelligence Overview
PDGA Knowledgebase
Course Build-out
Disc Intelligence

with one coherent administration product:

DATA INTELLIGENCE

Primary navigation:

OVERVIEW

COURSE ATLAS

EVENTS

PLAYERS

DISCS

SOURCES

JOBS & HEALTH

REVIEW QUEUE.

Course-specific sub-navigation:

Course Atlas
Directory Coverage
Layouts
Geometry
Provenance
Conflicts.

PDGA/UDisc/DGS are SOURCES.

They should not behave like separate data products.

==================================================
2. COURSE ATLAS BECOMES THE COURSE CONTROL CENTER
==================================================

The Course Atlas should answer:

How many real Courses does DGD know?

How many have locations?

How many should be visible in Directory?

How many are actually visible?

How many have source-backed Layouts?

How many are scoring ready?

How many are fully mapped?

What is preventing the rest?

==================================================
3. REPLACE MISLEADING TOP METRICS
==================================================

Recommended Course Atlas summary:

CANONICAL COURSES
13,xxx

DIRECTORY READY
xx,xxx

DIRECTORY PIN READY
xx,xxx

VISIBLE ON DIRECTORY MAP
xx,xxx

MISSING LOCATION
xxx

LOCATION REVIEW
xxx

SOURCE CONFLICTS
xxx

SCORING READY
xx,xxx

HOLE MAP READY
x,xxx

CADDY READY
x,xxx.

The exact values must be calculated from canonical definitions.

Do NOT hardcode numbers from the existing screens.

==================================================
4. MAP GUARANTEE
==================================================

Establish this invariant:

IF:

course is canonical
AND directory visibility is public
AND Course is not an unresolved duplicate
AND Course has valid representative coordinates

THEN:

that Course MUST be queryable from the Course Directory map.

A Course must NOT require:

a Layout
Par
Tee coordinates
Basket coordinates
Course rating
PDGA source link

to receive a Directory pin.

==================================================
5. DIRECTORY PIN READY ≠ HOLE MAP READY
==================================================

These two concepts currently risk being confused.

DIRECTORY PIN READY means:

we know where the Course is.

HOLE MAP READY means:

we know physical Tee/Basket geometry.

A Course can therefore be:

Directory Pin Ready ✓
Scoring Ready ✗
Hole Map Ready ✗

and still appear correctly in the Course Directory.

==================================================
6. AUDIT THE DIRECTORY MAP QUERY
==================================================

Find the exact database query/RPC/view currently supplying Course Directory
map pins.

Inspect whether it accidentally requires joins to:

Layouts
Course holes
PDGA source records
ratings
builder status
images
Course completeness

that eliminate legitimate Courses.

Avoid INNER JOIN behavior that makes valid Courses disappear merely because
secondary information is absent.

==================================================
7. MAP QUERY SOURCE
==================================================

Create/reuse ONE canonical Directory map query layer.

Conceptually:

get_courses_in_view(
    min_lat,
    min_lng,
    max_lat,
    max_lng,
    zoom,
    filters
)

It reads canonical Course records.

Not PDGA Course rows.

Not UDisc rows.

Not source listings.

Not Builder records.

==================================================
8. POSTGIS
==================================================

Use PostGIS for canonical Course representative location.

Use an indexed geographic Point.

Do not rely on nationwide client-side filtering of decimal lat/lng columns.

Use spatial index/bounding-box queries.

==================================================
9. NO GLOBAL FETCH
==================================================

Never fetch all ~13,000+ Courses into React and filter them in the browser.

Directory behavior:

wide zoom:
clusters

closer zoom:
Course pins

Course selected:
detailed Course data

Course Studio:
physical geometry.

==================================================
10. AVOID DATA API ROW CAPS
==================================================

Audit whether Course Directory is accidentally relying on:

a fixed PostgREST row limit
a `.limit()`
a first page only
an unpaginated query

that causes valid Courses to disappear.

The map must use:

viewport queries
clustering
pagination where necessary.

Do not solve the problem by raising a client query to:

50,000 rows.

==================================================
11. MAP CONSISTENCY CHECK
==================================================

Create a server-side health check:

DIRECTORY ELIGIBLE COURSES
vs
DIRECTORY QUERYABLE COURSES.

Expected difference:

0

unless a Course has an explicit documented exclusion.

If difference > 0:

Data Intelligence shows:

MAP COVERAGE ERROR.

==================================================
12. "WHY IS THIS COURSE NOT ON THE MAP?"
==================================================

For every canonical Course provide:

DIRECTORY DIAGNOSTIC.

Possible result:

✓ Canonical identity
✓ Public
✓ United States
✗ Missing location

Reason:
No source provided coordinates.

or:

✓ Valid location
✗ Duplicate pending review

or:

✓ Directory eligible
✓ Should be visible
✗ Directory query failed

This final case is a BUG.

==================================================
13. ONE-CLICK REPAIR
==================================================

Admin action:

REPAIR COURSE DATA

may enqueue relevant jobs:

refresh sources
resolve location
re-match source links
detect Layouts
recalculate readiness.

Do not mutate facts blindly.

==================================================
14. COURSE IDENTITY PIPELINE
==================================================

Final pipeline:

SOURCE LISTING

↓

SOURCE SNAPSHOT

↓

PARSED SOURCE COURSE

↓

CANONICAL MATCH

↓

CANONICAL COURSE

↓

LOCATION RESOLUTION

↓

DIRECTORY PIN READY

↓

DETAIL ENRICHMENT

↓

LAYOUT DETECTION

↓

AUTO-LAYOUT DRAFT

↓

SCORING READY

↓

PHYSICAL MAPPING

↓

HOLE MAP READY

↓

CADDY READY.

Every Course should have a visible location in this pipeline.

==================================================
15. SOURCE LISTINGS ARE NOT COURSES
==================================================

The current Course Build-out screen reports:

20,000+ Course listings.

Do NOT describe this as:

20,000 DGD Courses.

A source listing may be:

duplicate listing
foreign Course
Layout listing
unreadable page
closed Course
same Course from another source
invalid/non-Course record.

Label clearly:

SOURCE LISTINGS DISCOVERED.

==================================================
16. FIX "SET ASIDE"
==================================================

The current Course Build-out combines thousands under something similar to:

Set Aside
Outside the US, or the page could not be read.

This is too broad.

Split into explicit categories:

NON_US
SOURCE_PARSE_FAILED
NOT_A_COURSE
DUPLICATE_SOURCE_LISTING
COURSE_VS_LAYOUT_REVIEW
INVALID_LOCATION
SOURCE_REMOVED
MATCH_AMBIGUOUS
OTHER.

Never mix:

legitimate foreign Course

with:

parser failure.

==================================================
17. COURSE SOURCE LINKS
==================================================

Canonical Course should support:

PDGA source link
UDisc source link
Disc Golf Scene source link
DGD-native evidence
other approved sources.

Unique external source identity must not link to multiple canonical Courses
without explicit conflict.

==================================================
18. ONE SOURCE LINK TABLE / MODEL
==================================================

Conceptually:

course_source_links

course_id
source
external_id
external_url
match_method
match_confidence
verified
first_seen_at
last_seen_at.

Reuse an existing valid model where available.

Do not create another duplicate architecture unnecessarily.

==================================================
19. SOURCE LINK COVERAGE
==================================================

Course Atlas should show:

PDGA LINKED
xx%

UDISC LINKED
xx%

DGS LINKED
xx%

MULTI-SOURCE
xx%

SINGLE-SOURCE
xx%.

A legitimate single-source Course is still valid.

==================================================
20. MATCHING
==================================================

Course reconciliation should use:

external ID

normalized Course name

coordinates

park/property

address

city/state

postal code

Hole count

established year

Event relationships.

Store matching explanation.

==================================================
21. DO NOT OVER-MERGE
==================================================

Explicitly protect:

multiple Courses at same park

North / South

Course A / Course B

Championship / Short Course.

Same address is not enough.

==================================================
22. COURSE COMPLEX
==================================================

If useful:

property / Course complex

may contain multiple canonical Courses.

This makes Course matching much safer.

==================================================
23. COURSE VS LAYOUT
==================================================

Detect when a source listing is likely:

real separate Course

vs

Layout of another Course.

States:

COURSE

LAYOUT_CANDIDATE

SAME_PROPERTY_COURSE

REVIEW.

Do not automatically merge ambiguous records.

==================================================
24. LOCATION COVERAGE
==================================================

Create dedicated:

LOCATION COVERAGE

screen.

Metrics:

Valid exact/high-confidence
Approximate
Missing
Invalid
Conflicting.

==================================================
25. LOCATION RESOLUTION
==================================================

For every missing-location Course:

1. inspect existing linked source coordinates
2. inspect source address
3. inspect Course/park name
4. geocode legitimate street address
5. geocode property/park where appropriate
6. compare against city/state
7. save provenance/confidence
8. otherwise send to review.

==================================================
26. DO NOT CREATE FAKE PINS
==================================================

Do not publish:

city centroid
state centroid
ZIP centroid

as though it were the Course.

Approximate points must remain explicitly:

APPROXIMATE.

==================================================
27. LOCATION VALIDATION
==================================================

Reject/flag:

0,0

outside stated country

state mismatch

ocean coordinates

obviously repeated city-center coordinates

impossible latitude/longitude

coordinates far from listed city.

==================================================
28. LOCATION PROVENANCE
==================================================

Store:

VERIFIED GPS

DGD STEWARD

SOURCE EXACT

MULTI-SOURCE CONSENSUS

ADDRESS GEOCODE

PROPERTY GEOCODE

APPROXIMATE

UNKNOWN.

==================================================
29. LOCATION CONFIDENCE
==================================================

Use:

VERIFIED
HIGH
MEDIUM
APPROXIMATE
UNRESOLVED.

Do not imply certainty that does not exist.

==================================================
30. FIX CURRENT MAP DIFFERENCE
==================================================

Current screens suggest a gap between:

Courses known

and:

Courses on map.

Calculate exact current reasons.

Example report:

559 not currently on Directory map

421 missing location
53 invalid coordinates
24 duplicate review
18 private/draft
11 query bug
32 other.

These are EXAMPLE categories.

Use real project data.

==================================================
31. STATE-BY-STATE COVERAGE
==================================================

Build:

COURSE ATLAS → STATES.

Columns:

State
Canonical Courses
Directory Ready
Pin Ready
Visible on Map
Missing Location
PDGA Linked
UDisc Linked
DGS Linked
Scoring Ready
Hole Map Ready
Review Needed.

==================================================
32. STATE DRILLDOWN
==================================================

Click:

Indiana

shows:

all canonical Indiana Courses

Map status

Source coverage

Layout status

Geometry status

Problems.

==================================================
33. STATE MAP VALIDATION
==================================================

Admin action:

VERIFY STATE DIRECTORY.

Run consistency check for every Course in state.

Expected:

eligible canonical count == map-queryable count.

==================================================
34. NATIONAL DIRECTORY VALIDATION
==================================================

Run state checks across all United States regions.

Summarize failures.

Do not rely solely on one national count.

==================================================
35. COURSE READINESS DEFINITIONS
==================================================

Define:

DISCOVERED
Canonical identity exists.

DIRECTORY_READY
Can appear publicly.

PIN_READY
Has usable location.

LAYOUT_DETECTED
Source-backed Layout evidence exists.

LAYOUT_BUILT
Canonical Layout Draft exists.

SCORING_READY
At least one Layout has valid Hole sequence and Par.

HOLE_MAP_READY
Required Tee/Basket positions have coordinates.

CADDY_READY
Enough geometry/rules for full Caddy.

VERIFIED
Required facts have approved verification.

==================================================
36. FIX "COURSES READY TO SCORE"
==================================================

The current Course Build-out reports nearly every Course as:

ready to score.

Audit this aggressively.

A Course is NOT scoring ready merely because:

a Layout row exists

or:

a generic Main Layout was generated.

SCORING READY requires a legitimate playable Layout.

==================================================
37. GENERIC PLACEHOLDER AUDIT
==================================================

Find suspicious legacy Layouts such as:

Main Layout

18 holes

Par 54

every Hole Par 3

zero/blank distances

no source provenance.

Classify them as:

LEGACY_PLACEHOLDER

unless actual evidence supports them.

==================================================
38. DO NOT DESTROY HISTORICAL DATA
==================================================

Do not remove a historical Layout snapshot needed by an existing Round/Event.

Separate:

current canonical truth

from:

historical snapshots.

==================================================
39. NO FAKE PAR
==================================================

Hole count:

18

does NOT imply:

Par 54.

Unknown stays:

NULL / —.

==================================================
40. PAR PROVENANCE
==================================================

Every current Hole/Layout Par should eventually be classifiable:

DGD VERIFIED

SOURCE PROVIDED

SOURCE CONSENSUS

EVENT SNAPSHOT

LEGACY PLACEHOLDER

UNKNOWN.

==================================================
41. PAR AUDIT PAGE
==================================================

Course Atlas:

PAR QUALITY

show:

source-backed
verified
unknown
placeholder suspected
conflicting.

==================================================
42. AUTO-LAYOUT ENGINE
==================================================

Integrate the Course ingestion system with the previously specified
Auto-Layout Builder.

For each source-backed Layout candidate:

detect

normalize

match

build Draft

validate.

==================================================
43. AUTO-LAYOUT STATES
==================================================

DETECTED

BUILT

SCORING READY

DISTANCE READY

HOLE MAP READY

CADDY READY

PUBLISHED.

Do not call all of these:

Layout complete.

==================================================
44. SOURCE-BACKED ONLY
==================================================

Auto-layout builder may use:

explicit source Hole list

explicit source Par

explicit source distance

explicit source Tee

explicit source Basket position.

It must not invent missing values.

==================================================
45. LAYOUT CONFLICTS
==================================================

Example:

PDGA Main:
Par 57

UDisc Main:
Par 58.

Expected:

CONFLICT.

Never:

57.5
or arbitrary source overwrite.

==================================================
46. SOURCE CHANGE → VERSION PROPOSAL
==================================================

If published Layout exists and source changes:

create:

PROPOSED NEW LAYOUT VERSION.

Do not rewrite old published version.

==================================================
47. PHYSICAL ASSET EXTRACTION
==================================================

Where legitimately provided, ingest:

Physical Hole identities

Tee names

Basket Position names

Tee coordinates

Basket coordinates.

No coordinate:

asset may exist

location remains NULL.

==================================================
48. GEOMETRY PAGE
==================================================

Course Atlas → Geometry:

Courses:
xx

Physical Holes:
xx

Tees:
xx

Basket Positions:
xx

Holes with both Tee + Basket:
xx

Courses fully Hole-mapped:
xx.

==================================================
49. HELP MAP WORK QUEUE
==================================================

Generate useful community work:

Closest to Complete

Missing one Basket

Missing one Tee

Layout scoring-ready but map incomplete

No physical geometry.

Link directly into canonical Course Studio.

==================================================
50. DATA INTELLIGENCE OVERVIEW
==================================================

Rebuild Overview around system health rather than miscellaneous totals.

Suggested sections:

COURSE ATLAS

EVENT DATA

PLAYER DATA

DISC INTELLIGENCE

SOURCE HEALTH

PIPELINE HEALTH

REVIEW REQUIRED.

==================================================
51. REMOVE AMBIGUOUS SOURCE MATRIX
==================================================

Current:

"What each source provides"

uses values like:

Linked to DGD · owner

Stored · owner

Parser built.

Clarify this.

Use statuses:

SUPPORTED

INGESTING

STORED

LINKED

CANONICAL SOURCE

NOT AVAILABLE

NOT IMPLEMENTED

FAILED.

Separate:

what a source can provide

from:

who owns the canonical field.

==================================================
52. SOURCE CAPABILITY MATRIX
==================================================

Example rows:

Course identity
Course location
Course details
Course layouts
Hole Par
Hole distance
Tee names
Basket positions
Event identity
Event results
Player identity
Player rating.

Columns:

PDGA
UDisc
DGS
DGD.

Cell may show:

Available

Parser implemented

Coverage %

Freshness.

==================================================
53. SOURCE HEALTH
==================================================

Create:

SOURCES

with a card per adapter.

For each:

STATUS

Last successful request

Last successful parse

Parser version

Objects discovered

Fetched today

Parsed today

Matched today

Created today

Updated today

Unresolved

Failed

429 count

5xx count.

==================================================
54. SOURCE STATUS
==================================================

Use:

HEALTHY

DEGRADED

RATE LIMITED

PARSER FAILURE

OFFLINE

PAUSED.

Queue empty does NOT automatically mean:

HEALTHY.

==================================================
55. PDGA SCREEN
==================================================

Move current PDGA Knowledgebase functionality under:

Data Intelligence
→ Sources
→ PDGA.

Preserve legitimate operational controls.

Do not maintain a separate "knowledgebase" product.

==================================================
56. UDISC SCREEN
==================================================

Give UDisc equivalent operational visibility.

Show:

Course jobs

Event jobs

source pages

match rates

parser failures.

Do not hide it behind Overview metrics.

==================================================
57. DISC GOLF SCENE
==================================================

Same.

Show:

Course coverage

Event coverage

organizer identity coverage where applicable

parse status

matching.

==================================================
58. DGD NATIVE
==================================================

Show DGD-native data separately:

user-created Courses

steward-verified data

Course Studio geometry

native Events

native Rounds.

==================================================
59. INGESTION PIPELINE HEALTH
==================================================

Create:

JOBS & HEALTH.

Metrics:

WAITING

RUNNING

RETRYING

FAILED

DEAD LETTER

STUCK

COMPLETED LAST HOUR

COMPLETED TODAY

OLDEST WAITING JOB

MEDIAN PROCESS TIME

P95 PROCESS TIME.

==================================================
60. THE CURRENT "PENDING 1033" IS NOT ENOUGH
==================================================

A queue count by itself is not health.

Example:

1,033 jobs waiting.

Need to know:

oldest job age

throughput

whether queue is moving

failure rate

expected drain time.

==================================================
61. JOB DETAIL
==================================================

Each job should show:

type

source

external ID

canonical entity if matched

created

available

attempts

last attempt

last error

next retry

worker

status.

==================================================
62. STUCK JOB
==================================================

Define stuck explicitly.

Example:

leased/running longer than expected visibility timeout

or repeated failed attempts.

Provide:

Retry

Cancel

Inspect.

==================================================
63. DEAD LETTER
==================================================

After bounded attempts:

move to review/dead-letter state.

Do not retry malformed data forever.

==================================================
64. JOB TYPES
==================================================

Separate jobs such as:

COURSE_DISCOVERY

COURSE_DETAIL

COURSE_MATCH

COURSE_LOCATION

COURSE_ENRICH

LAYOUT_DETECT

LAYOUT_BUILD

GEOMETRY_IMPORT

EVENT_DISCOVERY

EVENT_DETAIL

PLAYER_DETAIL

SOURCE_REPARSE.

==================================================
65. PRIORITY VIA QUEUE SEPARATION
==================================================

Do not pretend a FIFO queue supports arbitrary numeric priority.

Use separate queues/workflows for:

HOT / USER-REQUESTED

EVENT-NEEDED

NORMAL

NATIONAL BACKFILL

where needed.

==================================================
66. EVENT-NEEDED COURSE
==================================================

If a Course is needed for an upcoming Event:

queue it through HOT processing.

Do not let it wait behind thousands of national backfill records.

==================================================
67. CRON
==================================================

Cron seeds bounded work.

It does NOT perform the entire national crawl itself.

Use workers/Edge Functions/database jobs to consume bounded batches.

==================================================
68. INGESTION MUST CONTINUE WITHOUT BROWSER
==================================================

The current admin UI must NOT need to stay open for ingestion to continue.

Buttons:

Run batch

Queue work

Refresh source

initiate server-side work.

Closing the browser does not cancel it.

==================================================
69. "RUN A BATCH NOW"
==================================================

Make this deterministic.

Show what it queued.

Example:

Queued:
50 PDGA Course detail
25 Event detail
10 location repairs.

Not merely:

Processing...

with no explanation.

==================================================
70. AUTO-RUN
==================================================

Auto-run should mean:

scheduler enabled.

Clearly display:

Enabled

Next scheduled pass

Last successful pass.

==================================================
71. FRESHNESS
==================================================

Replace vague freshness card with entity-specific information:

PDGA Courses last discovery

PDGA Course details

UDisc Courses

DGS Courses

Events

Players

Layouts.

==================================================
72. FRESHNESS TARGETS
==================================================

Different data needs different refresh cadence.

Examples:

upcoming Event Course:
high priority

stable Course details:
lower frequency

finished old Event:
very low frequency.

Do not refresh everything equally.

==================================================
73. CHANGE DETECTION
==================================================

Use source content hash / normalized diff.

If unchanged:

do not trigger unnecessary:

canonical updates

Layout rebuild

notifications.

==================================================
74. REPARSE STORED DATA
==================================================

Add:

REPARSE

workflow.

When parser improves:

reprocess stored source snapshot.

Do not refetch external page unless necessary.

==================================================
75. PARSER HEALTH
==================================================

For every source parser:

version

last deployment

parse success %

fields recovered

sudden drop alerts.

==================================================
76. PARSER REGRESSION ALERT
==================================================

Example:

Yesterday:
92% Course pages yielded coordinates.

Today:
7%.

Do not let ingestion continue silently.

Flag:

PARSER REGRESSION.

==================================================
77. CONFLICT CENTER
==================================================

Data Intelligence → Review Queue.

Tabs:

Possible Duplicates

Course vs Layout

Location Conflict

Par Conflict

Hole Count Conflict

Source Match

Geometry

Parser Failures.

==================================================
78. REVIEW SHOULD SHOW EVIDENCE
==================================================

Example:

ROGERS LAKEWOOD

PDGA
Name...
Location...
Holes...

UDisc
Name...
Location...
Holes...

DGS...

Canonical...

Actions:

Merge

Keep Separate

Use Source Value

Keep Canonical

Needs Field Review.

==================================================
79. PROVENANCE
==================================================

Every canonical important value should have:

Source

Observed date

Confidence

Verification.

Admin can inspect:

WHY DOES DGD KNOW THIS?

==================================================
80. COURSE DETAIL INTELLIGENCE
==================================================

From Course Atlas:

open Course.

Show:

Canonical identity

Directory state

Map state

Source links

Location evidence

Metadata

Layouts

Physical assets

Conflicts

History

Jobs.

==================================================
81. DIRECTORY DIAGNOSTIC CARD
==================================================

Example:

COURSE DIRECTORY

✓ Public

✓ Valid location

✓ Spatial index

✓ Directory Ready

✓ Directory API queryable

✓ Map pin visible.

If failure:

show exact reason.

==================================================
82. DATA PIPELINE HISTORY
==================================================

Per Course:

Discovered PDGA

Matched canonical

UDisc linked

Location upgraded

Layout detected

Layout built

Hole geometry mapped

Steward verified.

==================================================
83. REPAIR ALL CURRENT COURSES
==================================================

After infrastructure is corrected:

run a full existing-data reconciliation pass.

Do NOT only process new Courses going forward.

==================================================
84. EXISTING DATA RECONCILIATION
==================================================

For every canonical Course:

validate:

identity

duplicate state

location

location confidence

state/country

source links

directory eligibility

map queryability

Layout status

Par provenance

physical geometry.

==================================================
85. DIRECTORY BACKFILL
==================================================

Any canonical Course with legitimate valid coordinates but missing Directory
eligibility for no legitimate reason:

repair it.

==================================================
86. LOCATION BACKFILL
==================================================

Any Course missing coordinates:

run Location Resolution pipeline.

==================================================
87. SOURCE LINK BACKFILL
==================================================

Attempt matching against currently known:

PDGA
UDisc
DGS

source observations.

==================================================
88. LAYOUT BACKFILL
==================================================

Run Layout Detector against existing stored source data.

Do not create fake Main Layout.

==================================================
89. PROVENANCE BACKFILL
==================================================

Existing values lacking provenance:

attempt to infer from trusted historical source records.

If impossible:

mark:

LEGACY_UNKNOWN

not:

verified.

==================================================
90. COURSE DIRECTORY PUBLIC QUERY
==================================================

Public Course Directory should read from canonical public projection.

Only include fields needed for browsing.

Do not expose:

raw scraper payloads

internal match scoring

admin review state

queue information.

==================================================
91. SECURE VIEW
==================================================

If public Directory is supplied by a Postgres view:

ensure it obeys current secure view/RLS practices.

Do not accidentally bypass Course visibility through a view.

==================================================
92. DATA API GRANTS
==================================================

Audit explicit Data API grants for:

every client-facing table/view/function.

Do not assume RLS alone makes new objects available.

This must be fixed now, before the upcoming platform enforcement.

==================================================
93. ADMIN TABLES
==================================================

Raw source snapshots

ingestion jobs

parser internals

review evidence

should normally remain:

server/admin only.

Do not grant general authenticated users broad access.

==================================================
94. RLS
==================================================

Enable RLS on exposed data.

Public:

approved/public Course projection.

Contributor:

owned/submitted changes according to existing Course permission model.

Admin:

trusted Data Intelligence access.

Do not use:

TO authenticated

alone as authorization.

==================================================
95. SECURITY DEFINER
==================================================

Avoid SECURITY DEFINER just to make Data Intelligence queries work.

If genuinely needed:

non-exposed schema

explicit auth validation

restricted execute

advisor review.

==================================================
96. DATA INTELLIGENCE UI SHOULD BE DIAGNOSTIC
==================================================

Avoid giant static metric grids.

Every metric should generally be clickable.

Example:

MISSING LOCATION
559

click

→ exact 559 Courses.

==================================================
97. STOP SHOWING DEAD-END NUMBERS
==================================================

A metric that says:

Layouts to correct: 8

must open those eight Layouts.

A metric:

90 Hole counts out of step

must open those 90 Courses.

==================================================
98. SOURCE COUNT TO CANONICAL COUNT
==================================================

Overview should make the funnel visually understandable.

Example:

20,617 SOURCE LISTINGS

↓ parsed

13,8xx SOURCE COURSE RECORDS

↓ matched/deduped

13,056 CANONICAL COURSES

↓ valid location

12,xxx DIRECTORY PIN READY

↓ mapped Holes

x,xxx HOLE MAP READY.

Use actual values.

==================================================
99. NEVER CALL DEDUPLICATION "LOST"
==================================================

A reduction from:

source listings

to:

canonical Courses

is often correct.

Make this clear.

==================================================
100. ALL COURSES MAP SCREEN
==================================================

Add administrative Course Atlas map.

Visual filters:

Directory Ready

Missing Location

Approximate Location

Conflict

Scoring Ready

Map Ready

Needs Layout.

==================================================
101. MISSING LOCATION ON MAP
==================================================

Obviously an unresolved Course cannot be positioned.

Show those in a side queue instead of inventing pins.

==================================================
102. APPROXIMATE PINS
==================================================

If approximate Course points are allowed publicly:

visually distinguish and allow contributors to:

Improve location.

Do not present approximate coordinate as verified.

==================================================
103. MAP CLUSTER HEALTH
==================================================

At national zoom:

show clusters.

Click state/region:

drill in.

Do not crash browser rendering 10,000+ DOM/map markers.

==================================================
104. DIRECTORY MAP TEST — NO LAYOUT
==================================================

Create/identify canonical Course:

valid location
public
zero Layouts.

Expected:

Course appears in Directory.

This is a critical regression test.

==================================================
105. DIRECTORY MAP TEST — UDISC ONLY
==================================================

Canonical Course linked only to UDisc:

valid location.

Expected:

appears.

Directory must not require PDGA.

==================================================
106. DIRECTORY MAP TEST — DGS ONLY
==================================================

Same.

Expected:

appears.

==================================================
107. DIRECTORY MAP TEST — DGD NATIVE
==================================================

Approved DGD-native Course:

no external source

valid location.

Expected:

appears.

==================================================
108. DIRECTORY MAP TEST — DUPLICATE
==================================================

Two source listings match same canonical Course.

Expected:

ONE pin.

==================================================
109. DIRECTORY MAP TEST — TWO COURSES SAME PARK
==================================================

Two legitimate Courses.

Expected:

TWO Courses.

==================================================
110. DIRECTORY MAP TEST — INVALID LOCATION
==================================================

Course with invalid coordinate.

Expected:

not silently displayed at wrong location.

Appears in Location Review.

==================================================
111. LAYOUT TEST — REAL SOURCE DATA
==================================================

Source provides explicit:

Hole 1–18
Par
distance.

Expected:

source-backed Layout Draft.

No manual duplicate entry required.

==================================================
112. LAYOUT TEST — ONLY HOLE COUNT
==================================================

Source says:

18 holes.

Expected:

NO fake 18-hole Par 54 scoring Layout.

==================================================
113. LAYOUT TEST — EXISTING PUBLISHED LAYOUT
==================================================

Source updates data.

Expected:

proposal/new version.

Historical Event Layout remains unchanged.

==================================================
114. QUEUE TEST
==================================================

Seed 1,000 background Course jobs.

Expected:

processing continues without browser.

Metrics show:

throughput

age

errors.

==================================================
115. FAILURE TEST
==================================================

Parser breaks.

Expected:

source becomes DEGRADED

failure count rises

jobs do not disappear

admin sees parser error.

==================================================
116. RATE LIMIT TEST
==================================================

Source returns 429.

Expected:

bounded backoff

no hammering

other sources continue.

==================================================
117. MAP CONSISTENCY AUTOMATION
==================================================

Schedule recurring health check:

canonical Directory-pin-ready count

vs

map-queryable count.

If mismatch:

create high-priority admin issue.

==================================================
118. STATE CONSISTENCY AUTOMATION
==================================================

Also calculate this by state.

This makes it possible to identify:

Illinois missing 14

Indiana missing 0

Michigan missing 3

instead of diagnosing nationally.

==================================================
119. HEALTH SCORE
==================================================

Optional:

Course Atlas Health

but only if derived transparently from:

Directory coverage

source health

queue health

conflicts.

Do not invent an opaque AI score.

==================================================
120. DISC INTELLIGENCE
==================================================

Keep Disc Intelligence under Data Intelligence.

Do not mix Disc survey processing into Course Atlas metrics.

It should have its own:

source

freshness

parser/jobs

coverage.

==================================================
121. EVENT / PLAYER INGESTION
==================================================

Use the same shared Data Intelligence principles for:

Events

Players.

But do not let this phase balloon into redesigning all Event/Player features.

Primary execution focus:

COURSES + DIRECTORY MAP.

==================================================
122. CURRENT SUPABASE PLATFORM CHECK
==================================================

Before schema/security implementation:

review current Supabase changelog and docs.

In particular verify:

Data API exposure behavior

RLS

Queues

Cron

PostGIS

views/functions.

Do not implement from stale assumptions.

==================================================
123. MIGRATION SAFETY
==================================================

Do not immediately delete:

PDGA Knowledgebase components

Course Build-out components.

First:

replace their data ownership

migrate controls into new Data Intelligence

verify parity

then retire legacy screens.

==================================================
124. OLD ROUTES
==================================================

Legacy admin routes may redirect to relevant new tabs:

PDGA Knowledgebase
→ Data Intelligence / Sources / PDGA

Course Build-out
→ Data Intelligence / Course Atlas

Disc Intelligence
→ Data Intelligence / Discs.

==================================================
125. IMPLEMENTATION ORDER
==================================================

PHASE A — DEFINITIONS

1. Inventory current Course tables/views/RPCs.
2. Inventory every source-count query.
3. Define Source Listing vs Source Course vs Canonical Course.
4. Define all readiness states.
5. Produce count reconciliation.

PHASE B — MAP CORRECTNESS

6. Find canonical Directory pin query.
7. Remove improper joins/filters.
8. Add/verify PostGIS Point/index.
9. Build viewport query.
10. Add clustering.
11. Build Directory eligibility diagnostic.
12. Compare eligible vs queryable.
13. Fix every unexplained mismatch.

PHASE C — LOCATION QUALITY

14. Audit coordinates.
15. Build missing-location queue.
16. Build location resolver.
17. Validate state/country.
18. Upgrade approximate positions.
19. Process all current missing locations.

PHASE D — SOURCE RECONCILIATION

20. Consolidate source link model.
21. Backfill PDGA links.
22. Backfill UDisc links.
23. Backfill DGS links.
24. Identify duplicate/source conflicts.
25. Separate Course vs Layout candidates.

PHASE E — LAYOUT QUALITY

26. Audit current Layouts.
27. Identify legacy placeholders.
28. Audit Par provenance.
29. Build Layout Detector.
30. Build source-backed Layout Drafts.
31. Build validation/readiness.
32. Preserve published history.

PHASE F — PIPELINE HEALTH

33. Consolidate source adapters.
34. Add parser versions.
35. Add snapshot reparse.
36. Build durable job queues.
37. Build bounded workers.
38. Add retry/backoff.
39. Add dead-letter state.
40. Add Cron scheduling.
41. Add source health.
42. Add parser health.

PHASE G — ADMIN UX

43. Build new Data Intelligence Overview.
44. Build Course Atlas.
45. Build state coverage.
46. Build source pages.
47. Build Jobs & Health.
48. Build Review Queue.
49. Build Course diagnostic Inspector.
50. Redirect legacy admin pages.

PHASE H — VERIFY

51. Full United States Course reconciliation.
52. Map consistency check.
53. State-by-state spot tests.
54. Random Course QA.
55. Source adapter QA.
56. Layout QA.
57. RLS/Data API audit.
58. Run database/security advisors.
59. Fix failures.
60. Production-readiness report.

==================================================
126. HARD STOP CONDITION
==================================================

DO NOT declare this complete because:

the build succeeds

or:

the queues are running.

Completion requires:

EVERY PUBLIC CANONICAL COURSE WITH A VALID LOCATION IS QUERYABLE FROM THE
COURSE DIRECTORY MAP

OR

there is an explicit documented reason why it is excluded.

Difference with no explanation must equal:

ZERO.

==================================================
127. FINAL COMPLETION REPORT
==================================================

Return:

A. source listings discovered
B. parsed source Courses
C. canonical Course count
D. duplicates merged
E. duplicate reviews remaining

F. Directory-ready Courses
G. Directory-pin-ready Courses
H. map-queryable Courses
I. unexplained map mismatch count

J. missing-location Courses
K. approximate-location Courses
L. invalid-location Courses
M. repaired locations

N. PDGA-linked Courses
O. UDisc-linked Courses
P. DGS-linked Courses
Q. multi-source Courses

R. Layouts detected
S. Layouts built
T. scoring-ready Layouts
U. Hole-map-ready Layouts
V. Caddy-ready Layouts
W. placeholder Layouts found
X. Par provenance issues

Y. jobs waiting
Z. oldest waiting job
AA. throughput/hour
AB. failed jobs
AC. dead-letter jobs
AD. source health
AE. parser health

AF. state-by-state Course coverage
AG. PostGIS/map performance
AH. RLS/security findings
AI. Data API grant findings
AJ. database advisor findings

AK. every remaining Course not on Directory map
    grouped by exact reason.

Do not report only aggregate percentages.

Give exact unresolved Course counts and actionable reasons.