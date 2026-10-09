PHASE — NATIONAL COURSE MAP COVERAGE
BREADTH-FIRST COURSE MAPPING + COMMUNITY IMPROVEMENT

Change the Course Atlas strategy.

We are NOT trying to create a perfectly verified map of every Course before
players can use it.

The objective is:

GET MOST UNITED STATES COURSES TO A USEFUL STARTER MAP

then allow:

players
trusted contributors
Course stewards
clubs
admins

to progressively improve the data.

==================================================
1. NEW DEFINITION OF SUCCESS
==================================================

A Course does NOT need perfect data to become useful.

We want three practical map states:

UNMAPPED

STARTER MAP

VERIFIED MAP.

STARTER MAP is the national coverage target.

VERIFIED MAP is the long-term community improvement target.

==================================================
2. STARTER MAP
==================================================

A Course qualifies for a Starter Map when DGD has enough legitimate source
data to provide useful physical Course context.

Examples:

- most primary Tees/Baskets found
- explicit source Hole paths
- reliable Tee/Basket pairings
- known Layout/Hole sequence with partial coordinates
- imported official map geometry
- combination of multiple legitimate sources.

Starter Maps MAY be incomplete.

Example:

18-hole Course

16 Tees known
15 Baskets known
14 complete Tee→Basket Hole pairs.

This is useful.

Publish it as:

COMMUNITY MAP
Needs verification

rather than hiding the entire map.

==================================================
3. DO NOT REQUIRE 100%
==================================================

Do NOT block a Course map because:

1 Basket is missing

2 Tees are unknown

alternate positions are incomplete

flight paths are missing

Course rules are incomplete

one Hole number needs confirmation.

Partial maps should still be usable.

==================================================
4. CONFIDENCE LABELS
==================================================

Every physical asset can be:

VERIFIED

SOURCE MAPPED

INFERRED

NEEDS REVIEW.

Public player map should distinguish only where useful.

Example Course status:

COMMUNITY MAP
15/18 Holes mapped

rather than exposing complicated internal confidence metadata.

==================================================
5. NO INVENTED COORDINATES
==================================================

Breadth-first does NOT mean fabricating coordinates.

Never generate fake Tee or Basket coordinates.

Instead:

known coordinate → display it

unknown coordinate → leave it missing.

==================================================
6. BE MORE PERMISSIVE WITH PARTIAL SOURCE DATA
==================================================

Do not discard useful source geometry because the entire Course cannot be
resolved perfectly.

Keep:

partial Tee sets

partial Basket sets

source Hole paths

unassigned features

alternate features.

Use whatever can be matched safely.

==================================================
7. NATIONAL BREADTH PASS
==================================================

Run the Harvester across the entire United States.

For each Course:

1. identify source Course
2. collect every Tee
3. collect every Basket
4. collect Hole paths
5. match high-confidence geometry
6. retain medium-confidence candidates
7. create/update Starter Map
8. move on.

Do not spend excessive processing time trying to perfect one Course while
thousands remain untouched.

==================================================
8. COMPLETION PRIORITY
==================================================

National processing priority:

FIRST:
Courses with zero map data

SECOND:
Courses where source geometry can immediately create a Starter Map

THIRD:
Courses nearly complete

FOURTH:
complex/conflicting Courses requiring manual review.

This gets broad national coverage quickly.

==================================================
9. USE EXISTING LAYOUT DATA
==================================================

Combine harvested geometry with existing DGD Course information.

If DGD already knows:

18-hole Layout
Hole numbers
Par
distance

and source geometry contains Tee/Basket points:

match those together.

Do not make OpenStreetMap independently provide every fact.

==================================================
10. USE MULTIPLE SOURCES TO BUILD ONE STARTER MAP
==================================================

Example:

PDGA:
Course identity
18 holes
Par

UDisc:
Layout name
Hole sequence/distances

Open map data:
15 Tees
16 Baskets

DGD:

combine these into ONE canonical Course map.

Do not require one source to provide everything.

==================================================
11. AUTO-BUILD PARTIAL LAYOUTS
==================================================

If Course Layout is known and physical assets can be matched:

build/update the Layout.

Example:

Hole 1
✓ Tee
✓ Basket

Hole 2
✓ Tee
✓ Basket

Hole 3
✓ Tee
? Basket

Hole 4
✓ Tee
✓ Basket.

Do not refuse to build the Layout because Hole 3 is incomplete.

==================================================
12. PARTIAL MAP UI
==================================================

Course page:

MAP COVERAGE

15 / 18 Holes mapped

Missing:
3 Basket Positions

[Help Improve Map]

Do not show:

Map unavailable.

==================================================
13. COMMUNITY EDITING
==================================================

Make improvement extremely easy.

On Course map:

Wrong Tee?
[Suggest correction]

Basket moved?
[Update Basket]

Missing Hole?
[Add missing Hole]

Wrong Hole number?
[Fix Hole]

Course changed?
[Report redesign].

==================================================
14. LOW-RISK ADDITIONS
==================================================

Normal authenticated users should be able to propose:

missing Tee

missing Basket

Hole label correction

new alternate Tee

new alternate Basket.

These become proposals according to Course permissions.

==================================================
15. TRUSTED CONTRIBUTORS
==================================================

Trusted contributors may directly handle appropriate low-risk missing-data
changes.

Large structural changes still require approval.

==================================================
16. COURSE STEWARD
==================================================

Course Steward can efficiently maintain:

Tee coordinates

Basket positions

Hole order

Layout configuration

Course rules

according to existing Course permissions.

==================================================
17. MOBILE MAP FIX
==================================================

From Course page:

HELP MAP THIS COURSE.

Open simplified mobile editor.

Not the full desktop Course Studio.

Show:

Hole 7 Basket Missing

[Use My Location]

or:

[Place on Map].

==================================================
18. ONE-TAP FIELD IMPROVEMENT
==================================================

Player physically standing at missing Basket:

tap:

BASKET IS HERE.

Capture GPS.

Submit.

That is enough.

Do not require the player to understand Course Studio architecture.

==================================================
19. WRONG LOCATION
==================================================

Existing point:

Is this Tee correct?

[Yes]
[Move it]
[Not a Tee].

Community confirmations help improve confidence.

==================================================
20. COMMUNITY CONFIRMATION
==================================================

Allow appropriate verification:

Still correct

Moved

Wrong feature.

Do not use generic likes.

==================================================
21. MAP STATUS
==================================================

Course cards may show:

MAP READY

COMMUNITY MAP

PARTIAL MAP

MAP NEEDED.

Suggested:

MAP READY
Most primary Holes mapped.

COMMUNITY MAP
Useful map exists but needs verification/improvement.

PARTIAL MAP
Some geometry exists.

MAP NEEDED
No useful Hole geometry yet.

==================================================
22. NATIONAL COVERAGE METRIC
==================================================

Primary metric should become:

COURSES WITH A USABLE MAP.

Not:

100% of physical assets verified.

Example:

8,350 / 13,056 Courses have a usable Starter Map.

This is the number we want to grow rapidly.

==================================================
23. STARTER MAP THRESHOLD
==================================================

Do not hardcode one simplistic percentage.

Determine Starter Map readiness using practical evidence.

Possible rule:

Course has known Layout/Hole structure

AND

enough physical geometry to be useful.

For a normal Course this might mean:

a majority of primary Holes have at least Tee or Basket geometry

with several complete Tee→Basket pairs.

Tune threshold using real Course samples.

==================================================
24. MAP USEFULNESS SCORE
==================================================

Internally calculate a transparent readiness score from:

Hole sequence known

Tee coverage

Basket coverage

complete Hole pair coverage.

Do not make this a mysterious AI score.

==================================================
25. DO NOT REQUIRE ALTERNATES
==================================================

Alternate:

Tees

Basket Positions

seasonal layouts

should NOT block Starter Map status.

Primary Course geometry first.

==================================================
26. DO NOT REQUIRE RULES
==================================================

OB

Mando

Hazards

Drop Zones

should not block mapping coverage.

Those improve Caddy quality later.

==================================================
27. DO NOT REQUIRE PERFECT PAR
==================================================

If geometry is usable but some Par data is unknown:

map may still be published.

Scoring readiness remains separate.

==================================================
28. AUTO-MATCH MORE AGGRESSIVELY — BUT SAFELY
==================================================

For Starter Maps, allow high-confidence automatic matches using:

explicit source relationships

Hole refs

Course boundaries

existing Layout

feature clusters

coordinate relationships.

Medium-confidence:

store as candidate.

Do not publish obviously ambiguous Course-complex matches.

==================================================
29. COURSE COMPLEXES
==================================================

Do not let complex parks block the entire national scan.

Mark:

NEEDS REVIEW

and continue.

Come back after broad coverage is established.

==================================================
30. UNNUMBERED SOURCE GEOMETRY
==================================================

If Course has unnumbered source Tee/Basket geometry:

attempt to match against existing DGD Layout/Hole data.

If still uncertain:

retain the geometry.

Do not prevent other properly identified Holes from appearing.

==================================================
31. PARTIAL HOLE ORDER
==================================================

It is acceptable to know:

Holes 1–11
13–18

while Hole 12 is unresolved.

Build the usable portion.

==================================================
32. NATIONAL SCAN SHOULD KEEP MOVING
==================================================

Do not stop nationwide processing for every ambiguity.

Each Course should be processed into:

STARTER_MAP_CREATED

PARTIAL_MAP_CREATED

NO_GEOMETRY_FOUND

REVIEW_NEEDED.

Then continue to next Course/region.

==================================================
33. RATE LIMITING
==================================================

Continue respecting source rate limits.

Use durable background processing.

Failed/rate-limited regions retry later.

Do not make one failed state stop national processing.

==================================================
34. AFTER FIRST NATIONAL PASS
==================================================

Do NOT immediately start another identical full scan.

Instead prioritize:

Courses with partial geometry

Courses near completion

popular Courses

Courses with upcoming Events

Courses with active users

Courses explicitly requested by users.

==================================================
35. POPULAR COURSE PRIORITY
==================================================

Use existing DGD activity:

Rounds

Events

saves

Course views

to prioritize map improvements.

A frequently played Course should reach useful-map status before an inactive
Course with difficult data.

==================================================
36. EVENT PRIORITY
==================================================

Upcoming Event Course:

ensure map gets immediate geometry processing.

If map remains partial:

surface missing pieces to TD/staff.

==================================================
37. USER REQUEST
==================================================

Course page:

REQUEST MAP UPDATE.

This moves Course up completion queue.

Prevent spam/duplicate requests.

==================================================
38. COURSE MAP CONTRIBUTION BOARD
==================================================

Play/Courses may eventually show:

HELP IMPROVE COURSES

Rogers Lakewood
2 Baskets missing

Riverside
Hole 15 Tee needs verification

Countryside
1 Hole needs mapping.

==================================================
39. AUTO-CLOSE WORK
==================================================

Once a missing asset is supplied:

remove corresponding task automatically.

==================================================
40. KEEP VERIFIED DATA PROTECTED
==================================================

Starter Map flexibility must never mean:

random users can overwrite verified Course geometry.

Existing approved/verified coordinates remain protected.

==================================================
41. ADDITIONS VS CHANGES
==================================================

Adding a missing Basket:

lower risk.

Moving a verified Basket 300 ft:

large structural change.

Use different approval rules.

==================================================
42. PUBLIC PLAYER EXPERIENCE
==================================================

Do not overwhelm players with data-quality terminology.

Course map should simply say:

Community mapped

and:

Help improve.

Internal Data Intelligence carries detailed provenance/confidence.

==================================================
43. NATIONAL DASHBOARD
==================================================

Course Atlas:

U.S. COURSES
13,xxx

DIRECTORY MAP
12,xxx

USABLE COURSE MAP
x,xxx

PARTIAL MAP
x,xxx

MAP NEEDED
x,xxx

VERIFIED MAP
x,xxx.

Use actual database values.

==================================================
44. STATE COVERAGE
==================================================

Show:

Indiana
Courses: xxx
Usable Maps: xxx
Partial: xx
Needed: xx

Texas
...

This lets us identify weak geographic regions.

==================================================
45. USABLE MAP MAP
==================================================

Admin Atlas map may visualize:

green:
usable

yellow:
partial

gray:
map needed

red:
conflict.

This makes national gaps obvious.

==================================================
46. SUCCESS TARGET
==================================================

Do not make the engineering target:

100% verified.

Target something like:

MOST ACTIVE / PUBLIC U.S. COURSES HAVE A USABLE STARTER MAP

and:

EVERY REMAINING COURSE CAN BE EASILY IMPROVED BY THE COMMUNITY.

Do not freeze a specific percentage until actual first-pass coverage is known.

==================================================
47. FIRST-PASS REPORT
==================================================

After national geometry pass report:

Courses checked

Courses with useful source geometry

Starter Maps created

Partial Maps created

No geometry found

Review required

Source rate-limited

False Course features rejected.

==================================================
48. SECOND-PASS STRATEGY
==================================================

After first pass:

Do not simply repeat by state.

Rank individual Courses using:

1. Almost Starter Map
2. Upcoming Event
3. Player activity
4. Community request
5. No map but source candidates available
6. No source data.

==================================================
49. COURSE WITHOUT AUTOMATIC DATA
==================================================

Do not spend endless crawler effort.

Show:

MAP NEEDED

and make:

GPS mapping / manual satellite placement / import

the completion path.

==================================================
50. USER CAN BUILD FROM SATELLITE
==================================================

Course Studio:

Map missing Hole.

User may:

Use GPS

or:

Place Tee/Basket directly on high-detail satellite map.

This is important because a knowledgeable local player can often complete a
Course quickly from aerial imagery.

==================================================
51. COMPLETION FLOW
==================================================

Ideal Course lifecycle:

DISCOVERED

→ DIRECTORY VISIBLE

→ AUTOMATIC GEOMETRY HARVEST

→ PARTIAL MAP

→ STARTER MAP

→ COMMUNITY IMPROVEMENT

→ VERIFIED MAP.

==================================================
52. IMPLEMENT NOW
==================================================

Build in this order:

1. Finish the Harvester false-Course / large-Course matching fixes.
2. Store physical Holes/Tees/Basket Positions independently from Layouts.
3. Allow partial physical Course maps.
4. Define Starter Map state.
5. Run national source geometry scan.
6. Auto-build partial/source-backed maps where safe.
7. Display partial maps publicly.
8. Add Help Improve Map.
9. Add simplified GPS/missing-feature mapping.
10. Add satellite/manual placement.
11. Add contributor proposals/approval.
12. Build state coverage dashboard.
13. Prioritize most-played / Event Courses after first pass.
14. Build automatic Layouts from mapped physical assets.
15. Continue community improvement indefinitely.

==================================================
53. COMPLETION REPORT
==================================================

Return:

A. canonical U.S. Courses
B. Courses processed by geometry harvester

C. Starter Maps created
D. Partial Maps created
E. Verified Maps
F. Maps Needed

G. primary Tees mapped
H. primary Baskets mapped
I. complete Tee→Basket Hole pairs

J. Courses almost Starter Map
K. Courses with no source geometry
L. Course-complex reviews

M. community mapping tasks generated
N. GPS/manual contributions
O. accepted corrections

P. state-by-state Starter Map coverage
Q. most-played Courses still unmapped
R. upcoming Event Courses still incomplete

S. remaining technical blockers.

The product goal is NOT perfect national geometry.

The product goal is:

GET USERS A USEFUL COURSE MAP QUICKLY,
THEN MAKE THAT MAP EASY TO CORRECT AND IMPROVE.