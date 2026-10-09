PHASE — GEOMETRY HARVESTER 2.1
FIX FALSE COURSES + LARGE-PARK GEOMETRY MATCHING
THEN BEGIN PHYSICAL HOLE / TEE / BASKET CANONICALIZATION

We have now tested real OpenStreetMap regions.

Observed results:

INDIANA / BLOOMINGTON AREA
- 8 mapped Course sites
- 35 Tee pads
- 29 Baskets
- roughly half with Hole numbers

MASSACHUSETTS / WORCESTER AREA
- 18 mapped sites
- 26 Tee pads
- 54 Baskets
- 32 numbered pins

ILLINOIS
- source service failed to respond

TEXAS / COLORADO / CALIFORNIA
- source rate limited; require slower retry

The source reader works.

DO NOT expand feature scope until the two identified correctness problems are
fixed and retested:

1. Some individual Holes are being interpreted as whole Courses.
2. Large Courses/parks can have Tee/Basket features farther than the current
   Course-point search radius, causing valid geometry to be missed.

After those fixes pass real-region tests, continue into the physical Course
asset model.

==================================================
PART A — FIX FALSE "COURSES"
==================================================

Current bug example:

"Hole 1 of Disc Golf Course"

may be treated as a Course.

This must stop.

The ingestion system must distinguish:

COURSE
PHYSICAL HOLE
TEE
BASKET
PRACTICE BASKET
OTHER DISC GOLF FEATURE.

==================================================
1. STRONG COURSE CLASSIFICATION
==================================================

A source feature should become a SOURCE COURSE candidate only when source
semantics identify it as an actual disc golf Course/site/property.

Do not promote:

Hole paths
Hole relations
Tee nodes
Basket nodes
practice targets

to Courses merely because:

their name contains "disc golf"

or:

they are tagged with disc-golf-related metadata.

==================================================
2. SOURCE FEATURE CLASSIFIER
==================================================

Normalize source elements into explicit internal types:

SOURCE_COURSE

SOURCE_HOLE

SOURCE_TEE

SOURCE_BASKET

SOURCE_PRACTICE_BASKET

SOURCE_COURSE_BOUNDARY

SOURCE_UNKNOWN_DISC_GOLF_FEATURE.

Do this before canonical Course matching.

==================================================
3. HOLE FEATURES NEVER CREATE COURSE RECORDS DIRECTLY
==================================================

Example:

name:
Hole 1 of Disc Golf Course

feature classification:
PHYSICAL HOLE

Expected:

attempt to attach it to its parent Course.

NOT:

create a new canonical Course.

==================================================
4. COURSE RELATION / MEMBERSHIP FIRST
==================================================

Where source provides parent/member relationships:

use them before name/proximity matching.

Example:

Course
  ├ Hole 1
  ├ Hole 2
  ├ Tee
  └ Basket

The child features inherit Course context from the source relationship.

Do not independently match each child to a new Course.

==================================================
5. NAME HEURISTICS ARE SECONDARY
==================================================

Names such as:

Hole 1
Hole #1
Basket 7
Tee 12
Practice Basket

must strongly bias away from COURSE classification.

But do not rely entirely on name text.

Source feature semantics remain primary.

==================================================
6. PROTECT REAL COURSES WITH ODD NAMES
==================================================

Do not reject a legitimate Course merely because its name contains:

Hole
Basket
Tee.

Classification must combine:

source object type
tags/semantics
relationship
geometry
name.

==================================================
7. FALSE COURSE CLEANUP
==================================================

Audit current imported/source Course candidates.

Find likely false Courses created from:

individual Holes
Tees
Baskets
practice features.

Do NOT blindly delete canonical records.

Classify:

SOURCE-ONLY FALSE CANDIDATE

CANONICAL DUPLICATE CREATED BY IMPORTER

REAL COURSE.

If a false canonical Course has dependencies:

merge/relink safely before retirement.

==================================================
8. FALSE-COURSE REVIEW
==================================================

Add review type:

FEATURE MISCLASSIFIED AS COURSE.

Show:

source feature
source tags
name
location
nearby canonical Course
child/parent relation.

Actions:

Attach to Course
Keep as Course
Ignore Feature.

==================================================
PART B — FIX LARGE-PARK MATCHING
==================================================

Current behavior uses a relatively small radius around the Course's
representative map point.

This causes large parks/Courses to lose valid Tee/Basket geometry.

Do not solve this by simply increasing every Course match radius nationwide.

Build contextual geometry matching.

==================================================
9. COURSE REPRESENTATIVE POINT IS NOT THE COURSE BOUNDARY
==================================================

A Course's Directory point may represent:

parking
park center
first Tee
address
Course centroid.

It must NOT be treated as the maximum extent of the Course.

==================================================
10. MATCHING PRIORITY
==================================================

Use matching evidence in approximately this order:

1. explicit source Course relation/membership
2. source Course polygon/boundary membership
3. known canonical Course boundary
4. explicit source Course identity/link
5. source feature cluster strongly associated with Course
6. Course name/property/address
7. spatial proximity.

Distance is one signal.

Not the owner of the decision.

==================================================
11. COURSE BOUNDARY MATCHING
==================================================

If a source Course provides:

polygon
multipolygon
boundary
area

then Tee/Basket/Hole features inside that geometry are strong candidates for
that Course.

This should supersede distance from a single Course point.

==================================================
12. CANONICAL BOUNDARY MATCHING
==================================================

If DGD already has a canonical Course/property boundary:

use it.

Features inside or very near that boundary:

strong Course evidence.

==================================================
13. FEATURE CLUSTER MATCHING
==================================================

Where Course boundary does not exist:

group nearby source disc-golf features into clusters.

Example:

18 Tees
18 Baskets
18 Hole paths

spread across a 1.5 km park.

The cluster as a whole may clearly belong to one Course even when its farthest
Basket is >700 m from the canonical Course point.

==================================================
14. DYNAMIC SEARCH ENVELOPE
==================================================

Use an initial search envelope to locate candidate feature clusters.

Then expand based on:

source Course extent
Course boundary
feature cluster hull
known physical Hole geometry.

Do not use one permanent fixed maximum for every Course.

==================================================
15. SAFETY CAP
==================================================

There should still be a broad sanity cap to avoid associating geometry miles
away.

But exceeding the initial radius should mean:

evaluate further

not:

discard immediately.

==================================================
16. COURSE COMPLEX PROTECTION
==================================================

Expanded matching increases risk at multi-Course properties.

Example:

Park contains:

North Course
South Course.

Never assign all features to whichever Course center is closer.

Use:

source relations
boundaries
Hole labels
existing geometry
clusters.

If ambiguous:

COURSE COMPLEX REVIEW.

==================================================
17. LARGE COURSE EXAMPLE
==================================================

Canonical Course point:

parking lot.

Hole 18 Basket:

1.2 km away.

If:

source Course relation links it

or:

it lies inside source/canonical Course boundary

or:

it belongs to the same coherent disc-golf feature cluster

Expected:

retain and match it.

Do not drop it because it exceeds 700/900m.

==================================================
18. ORPHAN FEATURE RETENTION
==================================================

Even when Course match fails:

retain Tee/Basket observation.

State:

UNMATCHED COURSE.

Do not discard.

This lets improved matching recover it later.

==================================================
PART C — RETRY / SOURCE SERVICE BEHAVIOR
==================================================

We already observed:

Illinois failed to answer.

Texas/Colorado/California were rate limited.

Improve source scheduling before national scale.

==================================================
19. RATE LIMIT STATE
==================================================

Distinguish:

RATE_LIMITED

TIMEOUT

SOURCE_UNAVAILABLE

PARSER_ERROR

NO_DATA.

Do not classify all failures as:

no mapped Courses.

==================================================
20. SLOW RETRY
==================================================

Rate-limited regions should retry with increasing wait.

Do not immediately retry repeatedly.

==================================================
21. SOURCE CIRCUIT BREAKER
==================================================

If repeated regions start returning rate limits/errors:

pause new source requests temporarily.

Already stored source processing may continue.

==================================================
22. ONE SOURCE REQUEST PIPELINE
==================================================

Avoid multiple workers independently hammering the same free source.

Use centrally bounded source request concurrency.

==================================================
23. NATIONAL ETA MUST USE REAL THROUGHPUT
==================================================

Do not assume:

2 regions every 5 minutes forever.

Calculate actual:

successful regions/hour
rate-limited regions
retry backlog
estimated first-pass completion.

==================================================
24. REGIONS SHOULD NOT BLOCK EACH OTHER
==================================================

Illinois failure should not stop:

Indiana

Massachusetts

or another due region.

==================================================
PART D — RETEST BEFORE CONTINUING
==================================================

After Parts A–C:

rerun real tests.

==================================================
25. INDIANA RETEST
==================================================

Verify:

Hole objects are not counted as Courses.

Compare:

old mapped Course-site count

new legitimate Course count.

Inspect Tee/Basket retention.

==================================================
26. MASSACHUSETTS RETEST
==================================================

Same.

Specifically inspect the high Basket count and verify:

practice baskets

alternate basket positions

Hole baskets

are classified appropriately.

==================================================
27. ILLINOIS RETRY
==================================================

Use slower retry path.

Expected:

successful processing eventually

or explicit source health failure.

Not silent zero.

==================================================
28. TEXAS / COLORADO / CALIFORNIA
==================================================

Process with rate-limited schedule.

Do not accelerate requests simply for testing.

Confirm geographically distributed functionality.

==================================================
29. PASS CONDITION
==================================================

Only continue to physical-model expansion when:

- false Hole-as-Course issue is fixed
- large Course geometry is retained
- Course complexes do not show obvious overmatching
- rate limits are handled safely
- real regions still return legitimate Tee/Basket data.

==================================================
PART E — PHYSICAL COURSE MODEL
==================================================

Once the fixes pass:

begin implementing physical Course assets separately from Layouts.

==================================================
30. REQUIRED MODEL
==================================================

COURSE

contains:

PHYSICAL HOLES.

Each Physical Hole may contain:

0..N TEES

0..N BASKET POSITIONS.

Layouts reference those assets.

==================================================
31. PHYSICAL HOLE
==================================================

Conceptually:

physical_hole_id
course_id
canonical_label
status
verification
history.

Do not require:

Par

Layout

distance

for physical identity.

==================================================
32. PHYSICAL TEE
==================================================

Conceptually:

tee_id
physical_hole_id
name
color
coordinate
coordinate_accuracy
surface
verification state
history.

Support multiple Tees.

==================================================
33. BASKET POSITION
==================================================

Conceptually:

basket_position_id
physical_hole_id
name
coordinate
coordinate_accuracy
verification state
history.

Support:

A
B
C
Short
Long
etc.

==================================================
34. SOURCE OBSERVATIONS
==================================================

External source elements remain linked as observations.

One canonical Tee may have:

OSM observation
DGD GPS observation
file-import observation.

Do not create three physical Tees automatically.

==================================================
35. MATCH SOURCE TO PHYSICAL ASSET
==================================================

Use:

source relationship
Hole
name/color
position label
geometry proximity
existing source link

to reconcile.

==================================================
36. EXISTING LAYOUTS
==================================================

Existing Layouts should progressively migrate to reference:

physical_hole_id
tee_id
basket_position_id.

Do not break historical Layout Versions.

==================================================
37. NO LAYOUT REQUIRED
==================================================

Critical acceptance case:

Course has no Layout.

Source gives:

18 explicit Holes
18 Tees
18 Baskets.

Expected:

physical Course assets are created/matched.

No Layout is required first.

==================================================
38. AUTO-LAYOUT HANDOFF
==================================================

After physical geometry exists:

send source-backed structure to Auto-Layout Builder.

If Hole order known:

build Layout Draft.

If Par unknown:

do not mark Scoring Ready.

==================================================
PART F — REVIEW MAP FOUNDATION
==================================================

Begin the next review surface during this phase.

==================================================
39. COURSE GEOMETRY REVIEW MAP
==================================================

Display:

canonical Course boundary/point

existing physical Holes

existing Tees/Baskets

source candidates

unassigned features

conflicts.

==================================================
40. SYMBOL STATES
==================================================

Use distinct states:

VERIFIED

CANONICAL

SOURCE CANDIDATE

UNASSIGNED

CONFLICT.

==================================================
41. MAP REVIEW ACTIONS
==================================================

Select source Tee/Basket.

Actions:

Assign to Hole

Match Existing Asset

Create Tee

Create Basket Position

Mark Practice

Ignore

Needs Field Check.

==================================================
42. REVIEW IS NOT THE NORMAL COURSE MAP
==================================================

Source internals remain:

Course Studio/admin/reviewer UI.

Normal players see approved canonical geometry only.

==================================================
PART G — DATA INTELLIGENCE COUNTS
==================================================

Update Course Atlas Geometry metrics.

==================================================
43. CORRECT COUNTS
==================================================

Show separately:

SOURCE COURSE FEATURES FOUND

LEGITIMATE SOURCE COURSES

SOURCE HOLES

SOURCE TEES

SOURCE BASKETS

CANONICAL COURSES MATCHED

CANONICAL PHYSICAL HOLES

CANONICAL TEES

CANONICAL BASKET POSITIONS

UNMATCHED SOURCE FEATURES

REVIEW REQUIRED.

==================================================
44. DO NOT CALL EVERY "SITE" A COURSE
==================================================

Replace ambiguous:

Mapped courses found

if it currently includes arbitrary disc-golf feature groups.

Use:

SOURCE COURSE SITES

only after Course classifier passes.

==================================================
45. QUALITY METRICS
==================================================

Track:

Course classification rejection rate

Course match rate

Tee assignment rate

Basket assignment rate

Hole-number coverage

unassigned feature rate

Course-complex review rate.

==================================================
PART H — SECURITY / SUPABASE
==================================================

Before schema changes:

verify current Supabase changelog/docs.

Reuse existing tables where appropriate.

Do not create duplicate physical asset systems.

==================================================
46. SOURCE TABLES
==================================================

Raw source observations/jobs:

server/admin only unless a specific client need exists.

Do not broadly expose them.

==================================================
47. CANONICAL GEOMETRY
==================================================

Published Course geometry may be publicly readable according to Course
visibility.

Structural writes remain capability-controlled.

==================================================
48. RLS
==================================================

RLS on exposed tables.

Do not use:

TO authenticated

alone to authorize Course edits.

==================================================
49. VIEWS
==================================================

Use current RLS-preserving view practices.

Do not accidentally expose source/admin information through a convenience
view.

==================================================
50. DATA API GRANTS
==================================================

Review explicit Data API grants separately from RLS.

==================================================
51. VERIFY DATABASE CHANGES
==================================================

After implementation:

test SQL behavior

run security/database advisors

verify policies

verify source workers

verify Course Studio reads new assets correctly.

==================================================
52. ACCEPTANCE — FALSE COURSE
==================================================

Input/source:

Hole 1 of Disc Golf Course.

Expected:

SOURCE_HOLE.

NOT canonical Course.

==================================================
53. ACCEPTANCE — LARGE PARK
==================================================

Course point >700m from legitimate Basket.

Source relation/boundary/cluster establishes membership.

Expected:

Basket retained and matched.

==================================================
54. ACCEPTANCE — COURSE COMPLEX
==================================================

Two Courses share park.

Expanded search finds features from both.

Expected:

correct separation

or review.

Never arbitrary nearest-center assignment.

==================================================
55. ACCEPTANCE — RATE LIMITED REGION
==================================================

Source returns rate limit.

Expected:

RATE_LIMITED

scheduled retry

no source hammering

no false "0 geometry" conclusion.

==================================================
56. ACCEPTANCE — NO LAYOUT
==================================================

Course with source physical geometry but no DGD Layout.

Expected:

physical Holes/Tees/Basket Positions imported.

==================================================
57. ACCEPTANCE — MULTIPLE TEES
==================================================

Hole has Red + Blue Tee.

Expected:

two canonical Tee assets.

==================================================
58. ACCEPTANCE — MULTIPLE BASKETS
==================================================

Hole has A + B positions.

Expected:

two canonical Basket Positions.

==================================================
59. ACCEPTANCE — UNMATCHED FEATURE
==================================================

Valid Tee but Course uncertain.

Expected:

feature retained for review.

No deletion.

==================================================
60. COMPLETION REPORT
==================================================

Return:

A. false Course records identified
B. false source Course candidates rejected
C. any existing canonical false Courses repaired

D. Indiana retest results
E. Massachusetts retest results
F. Illinois retry results
G. Texas results
H. Colorado results
I. California results

J. large-Park features recovered
K. features still outside Course matching
L. Course-complex reviews

M. canonical Physical Holes created/matched
N. canonical Tees created/matched
O. canonical Basket Positions created/matched
P. alternate Tees
Q. alternate Basket Positions

R. unassigned Tees
S. unassigned Baskets

T. source request rate
U. rate-limited regions
V. retry backlog
W. observed regions/hour
X. estimated first-pass duration

Y. RLS/security results
Z. advisor findings
AA. blockers before Hole-order review / GPS phase.

Do not continue to a national fast scan until the real-region acceptance
tests above pass.