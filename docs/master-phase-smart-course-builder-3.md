MASTER PHASE — SMART COURSE BUILDER 3.0
COURSE-WIDE TEE SYSTEMS + CONNECTED FAIRWAY ROUTES + SEAMLESS LAYOUT BUILDING

The DGD Course Builder should now be rebuilt around a connected physical
Course model.

The current editor still requires too much manual configuration per Hole:

- Tee name/color is repeated Hole-by-Hole
- Alternate Tees are cumbersome
- Alternate Basket Positions are cumbersome
- Fairways are treated as isolated paths
- Shared fairways are not modeled correctly
- Layout building is disconnected from Course building

Replace this with one intelligent connected system.

==================================================
1. FINAL COURSE MODEL
==================================================

A Course is built ONCE.

The Course owns:

COURSE-WIDE TEE SETS
PHYSICAL TEE PADS
PHYSICAL BASKET POSITIONS
PHYSICAL HOLE GROUPINGS
PLAYABLE TEE → BASKET ROUTES
SHARED FAIRWAY SEGMENTS
PERMANENT COURSE FEATURES
COURSE RULES
AMENITIES
TERRAIN.

Layouts simply select:

TEE
→
BASKET
→
PAR

for every Layout Hole.

==================================================
2. COURSE-WIDE TEE SETS
==================================================

Tee colors/names should primarily be configured ONCE for the Course.

Example:

TEE SETS

Blue
Color: Blue
Order: Championship

Red
Color: Red
Order: Short

White
Color: White

Gold
Color: Gold.

Then physical Tee Pads reference a Tee Set.

Do NOT require the manager to type:

Blue
Blue
Blue
Blue

on every Hole.

==================================================
3. TEE SET ENTITY
==================================================

Use/reuse a canonical model conceptually like:

course_tee_sets

id
course_id
name
short_label
color
display_order
description
is_default
status.

Example:

Blue Tees
#2563eb.

Physical Tee Pad references:

tee_set_id.

==================================================
4. PER-HOLE TEE PAD
==================================================

A physical Tee remains a unique asset.

Example:

Hole 3 Blue Tee

tee_id
course_id
home_hole_id
tee_set_id = BLUE
coordinates
surface
dimensions
status
verification.

The COLOR and Tee Set identity come from:

course_tee_sets.

==================================================
5. OPTIONAL TEE OVERRIDE
==================================================

Allow an advanced explicit override if a Course genuinely has something
unusual.

But normally:

Hole 1 Blue
Hole 2 Blue
Hole 3 Blue

all inherit the same Course Blue Tee style.

Do not make override the standard workflow.

==================================================
6. COURSE TEE SET MANAGEMENT
==================================================

Course Studio should have:

COURSE
→ TEE SETS

or an equivalent compact configuration.

Example:

TEE SETS

● Blue
● Red

[+ Add Tee Set]

Change Blue color once:

every Blue Tee marker
every Blue route
every Layout selector
every Tee Sign
every Caddy Book

updates automatically.

==================================================
7. BASKET POSITION SYSTEM
==================================================

Do the same concept for Basket Position labels where useful.

Example Course defaults:

A
B
C

with optional default colors/styles.

A physical Basket Position still belongs to an individual Hole.

Example:

Hole 3 · A
Hole 3 · B
Hole 7 · A.

==================================================
8. ADDING A TEE SHOULD BE SIMPLE
==================================================

Inside selected Hole:

[+ ADD TEE]

Then ask:

TEE SET
Blue ▼

LOCATION
Tap map / use GPS

Optional:
Surface
Notes.

That should be enough.

Do NOT require the manager to rebuild a complicated form.

==================================================
9. ADDING A BASKET SHOULD BE SIMPLE
==================================================

Inside selected Hole:

[+ ADD BASKET POSITION]

Ask:

POSITION
A ▼

LOCATION
Tap map / use GPS

Optional:
Notes.

Save.

Immediately usable everywhere.

==================================================
10. QUICK COURSE-WIDE SETUP
==================================================

When Course first gets configured:

"What Tees exist on this Course?"

[Blue]
[Red]
[White]
[Gold]
[+ Custom]

"What Basket Positions are commonly used?"

[A]
[B]
[C]
[Short]
[Long]
[+ Custom]

These become reusable Course configuration.

==================================================
11. SMART HOLE WORKFLOW
==================================================

For every physical Hole, Course Studio should show something like:

HOLE 3

TEES
● Blue ✓
● Red ✓
+ Add Tee

BASKETS
A ✓
B ✓
+ Add Basket

ROUTES
Blue → A
Red → A
Blue → B
Red → B

The user should immediately understand what physically exists.

==================================================
12. FAIRWAYS ARE NOT ONE LINE PER HOLE
==================================================

Replace the current isolated fairway-path concept.

A fairway should be modeled as a connected route network.

A playable route is:

TEE
→
ordered ROUTE SEGMENTS
→
BASKET.

==================================================
13. ROUTE NETWORK MODEL
==================================================

Conceptually support:

course_routes

id
course_id
tee_id
basket_position_id
status
source
confidence.

And:

route_segments

id
course_id
geometry
segment_type
source
confidence.

And:

route_segment_memberships

route_id
segment_id
sequence.

This allows multiple Tee→Basket routes to share the SAME segment.

==================================================
14. WHY SHARED SEGMENTS MATTER
==================================================

Example Hole:

Blue Tee starts 60 feet behind Red Tee.

Both throw down the exact same fairway.

Model:

BLUE START SEGMENT
↓
MERGE POINT
↓
SHARED FAIRWAY
↓
BASKET

RED START SEGMENT
↓
MERGE POINT
↓
SAME SHARED FAIRWAY.

Do NOT draw two duplicate fairways on top of one another.

==================================================
15. SHARED FAIRWAY RENDERING
==================================================

If a route segment is shared by:

BLUE
and
RED

render the shared centerline using:

alternating Blue / Red dashes

or equivalent clearly dual-colored segmented styling.

The user specifically needs to visually understand:

THIS FAIRWAY IS SHARED.

Do not simply make one color win.

==================================================
16. TWO-COLOR SHARED PATH
==================================================

For exactly two Tee Sets:

Blue + Red

preferred visual:

BLUE DASH
RED DASH
BLUE DASH
RED DASH

along the same centerline.

The fairway polygon/envelope remains one shared physical corridor.

==================================================
17. MORE THAN TWO SHARED TEE SETS
==================================================

If:

Blue
Red
White

share the same segment:

use a readable multi-color pattern or shared-neutral route with small Tee Set
indicators.

Avoid visually noisy triple parallel lines.

==================================================
18. DIFFERENT TEE SHOT SHAPES
==================================================

Sometimes Blue and Red are genuinely different shots.

Example:

Blue:
large hyzer around woods.

Red:
straight tunnel.

Then keep routes completely independent:

BLUE ROUTE

RED ROUTE.

Do not force them to merge.

==================================================
19. ROUTES MAY MERGE
==================================================

Sometimes:

Blue
Red

have different initial shots

but meet at a common landing zone.

Allow manager to:

[JOIN ROUTE HERE]

Then both routes share the downstream segment.

==================================================
20. ROUTES MAY SPLIT
==================================================

This is also required for alternate Basket Positions.

Example:

Blue Tee

same fairway to landing zone

then:

Basket A branches left

Basket B branches right.

Model:

SHARED SEGMENT

then split:

→ A

→ B.

==================================================
21. MERGE + SPLIT GRAPH
==================================================

The connected route engine must therefore support:

branching

merging

shared segments

alternate finishes.

Do not limit the Course to one polyline per Hole.

==================================================
22. SMART ADD TEE WORKFLOW
==================================================

When adding a new Tee to an existing Hole:

Step 1:
Place Tee.

Step 2:
Ask:

HOW DOES THIS TEE PLAY?

[ Same fairway as... ]

[ Joins another fairway ]

[ Completely different route ]

Recommended options based on existing Hole routes.

==================================================
23. SAME FAIRWAY OPTION
==================================================

Example:

Add Red Tee.

Choose:

Same fairway as:
Blue Tee

DGD automatically:

creates Red Tee start segment

finds appropriate connection/merge point

reuses the existing Blue route after merge.

User can drag the merge point if needed.

==================================================
24. JOINS FAIRWAY OPTION
==================================================

Choose:

Joins existing fairway.

User taps the point where Red route joins Blue.

DGD creates:

Red Tee → merge point

then shares everything downstream.

==================================================
25. DIFFERENT ROUTE OPTION
==================================================

Choose:

Completely different route.

DGD creates an independent route.

User can:

draw bends

drag control points

define fairway width.

==================================================
26. SMART ADD BASKET WORKFLOW
==================================================

When adding Basket B:

ask:

HOW DOES B PLAY?

[ Same fairway, different finish ]

[ Shares part of route ]

[ Completely different route ]

Most alternate Pins will use:

Same fairway, different finish.

==================================================
27. SAME FAIRWAY DIFFERENT FINISH
==================================================

User taps where route separates.

DGD reuses:

Tee → split point

then creates:

split point → Basket B.

No duplicated upstream fairway.

==================================================
28. AUTOMATIC ROUTE SUGGESTION
==================================================

When new Tee/Basket is created:

DGD may suggest route configuration based on:

existing nearby route geometry

proximity to existing Tee/Basket

direction of play

known flight-path geometry.

But suggestions must remain editable.

Do not silently guess and call it verified.

==================================================
29. ROUTE STATUS
==================================================

Use clear states:

MAPPED
PROVISIONAL
NEEDS ROUTE
VERIFIED.

A straight fallback line should be:

PROVISIONAL.

Not:

mapped/verified.

==================================================
30. FAIRWAY POLYGON
==================================================

Separate:

ROUTE CENTERLINE

from:

FAIRWAY / PLAYABLE CORRIDOR.

The centerline describes intended flight/play.

The fairway envelope describes the visible playable corridor.

Shared routes may reuse both.

==================================================
31. EASY FAIRWAY DRAWING
==================================================

Default behavior:

place Tee
place Basket

DGD creates straight provisional centerline.

Then:

drag centerline
add bend
adjust width.

Do not require complicated polygon editing for basic Courses.

==================================================
32. SMART FAIRWAY SHAPE
==================================================

For a bend:

click/drag route to create control point.

Fairway envelope should smoothly follow centerline.

Avoid forcing user to redraw entire polygon.

==================================================
33. EDIT SHARED SEGMENT ONCE
==================================================

If Blue and Red share the last 250 ft:

editing that shared fairway segment should update BOTH routes.

This is the point of canonical shared geometry.

==================================================
34. EDIT PRIVATE SEGMENT ONLY
==================================================

If manager edits Blue's unique opening line:

Red must not change.

Membership determines which routes are affected.

==================================================
35. VISUAL ROUTE EDITOR
==================================================

When a Hole is selected:

show:

TEE ROUTES

Blue → A
Red → A
Blue → B
Red → B

with checkboxes/toggles.

Selecting:

Blue → A

highlights that exact connected route.

==================================================
36. SHOW SHARED SEGMENTS
==================================================

Shared sections should visibly indicate:

SHARED WITH RED

or:

Blue + Red.

Do not make managers guess why editing a segment affects multiple routes.

==================================================
37. ROUTE SEGMENT INSPECTOR
==================================================

When clicking a segment:

SEGMENT

Used by:
Blue → A
Red → A
Blue → B
Red → B

[Edit Geometry]

[Split Segment]

[Detach Route]

This should remain secondary/advanced.

==================================================
38. SIMPLE MODE FIRST
==================================================

Do NOT expose graph terminology to normal Course builders.

Normal UI says:

Same fairway

Join fairway

Different fairway

Split toward Basket.

The graph implementation remains behind the scenes.

==================================================
39. ONE TRUE COURSE BUILD
==================================================

Everything from previous phases still applies.

There is ONE:

Course

Tee inventory

Basket inventory

route network

feature set.

Course Studio and Edit Course must never show different versions.

==================================================
40. LAYOUTS USE THESE ASSETS
==================================================

Once the Course is physically built:

Layout creation becomes extremely simple.

Example:

NEW LAYOUT

Name:
Blue 18

Holes:
18.

For each route slot:

TEE
Hole 1 · Blue

BASKET
Hole 1 · A

PAR
3.

==================================================
41. LAYOUT MAY MIX EVERYTHING
==================================================

A Layout may use:

Blue Tee on Hole 1

Red Tee on Hole 2

Blue Hole 3 Tee
→ Hole 7A Basket

etc.

No restrictions based on Tee Set.

==================================================
42. LAYOUT ROUTE RESOLUTION
==================================================

When Layout selects:

tee_id
+
basket_position_id

DGD should look for an existing canonical:

Course Route.

If one exists:

use it.

If multiple exist:

allow selection.

If none exists:

mark:

ROUTE NOT MAPPED

and optionally create Layout-specific provisional route.

==================================================
43. NORMAL PAIRING
==================================================

Example:

Hole 3 Blue
→ Hole 3A.

Existing canonical route found.

Use:

shared segments automatically.

==================================================
44. SAFARI PAIRING
==================================================

Example:

Hole 3 Blue
→ Hole 7A.

If no canonical Course route exists:

create a Layout route override.

Do NOT alter the normal Hole 3 Course route.

==================================================
45. LAYOUT BUILDING SHOULD NOT EDIT PHYSICAL COURSE
==================================================

Layout editor chooses:

existing Tee

existing Basket.

If asset does not exist:

[+ Add Tee to Course]

or

[+ Add Basket to Course].

Then return to Layout.

==================================================
46. TEE SET AUTO-LAYOUT
==================================================

Offer:

CREATE LAYOUT FROM TEE SET.

Example:

[Blue]

DGD tries:

Hole 1 Blue
→ Hole 1 default Basket

Hole 2 Blue
→ Hole 2 default Basket

etc.

Then user reviews exceptions.

==================================================
47. RED LAYOUT EXAMPLE
==================================================

Create:

Red Layout.

DGD finds:

Red Tee on 17/18 Holes.

Automatically assigns those.

Hole 12:

No Red Tee.

Show only:

Hole 12 needs attention.

==================================================
48. BASKET POSITION AUTO-LAYOUT
==================================================

Same concept:

USE BASKET:
B.

Apply where available.

Only genuine missing B positions need manual review.

==================================================
49. COURSE-WIDE CURRENT PIN CONFIGURATION
==================================================

Allow managers to maintain current Basket Positions.

Example:

Hole 1:
A

Hole 2:
C

Hole 3:
B.

Casual/current layouts may use:

CURRENT.

Event Layout Versions resolve exact Basket Position.

==================================================
50. CURRENT PIN VISUAL
==================================================

Course Studio should visually distinguish:

CURRENT BASKET

from:

alternate Basket Positions.

Example:

A
CURRENT ✓

B
Alternate.

==================================================
51. TEE SIGN INTEGRATION
==================================================

Tee Signs must consume this connected model.

If sign is generated for:

Blue Tee
→ A

show Blue route.

If Red merges with Blue:

shared fairway segment may show appropriate shared styling.

==================================================
52. TEE SIGN MULTI-TEE DISPLAY
==================================================

For Course signs showing multiple Tee Sets:

Blue route:
Blue.

Red route:
Red.

Shared section:
alternating Blue + Red dashed centerline.

This matches the user's desired professional Tee Sign behavior.

==================================================
53. ALTERNATE PIN SIGNAGE
==================================================

Tee sign can show:

A
B
C

Basket Positions.

Clearly indicate:

CURRENT PIN:
C

with highlighted Basket.

Other Basket Positions remain visible but subdued.

==================================================
54. DISTANCE TABLE
==================================================

Because every Tee/Basket pair is canonical, automatically calculate:

BLUE → A
BLUE → B
RED → A
RED → B.

Do not manually maintain duplicate distance values.

==================================================
55. PAR MATRIX
==================================================

Optionally support known par for exact pairing.

Example:

             A      B
Blue         3      4
Red          3      3

Layouts select final Par.

Course data may provide recommendation/default.

==================================================
56. COURSE BUILDER SIDEBAR CLEANUP
==================================================

The current left sidebar is too fragmented.

For selected Hole, restructure around:

HOLE 3

TEES
Blue
Red
+ Add Tee

BASKETS
A
B
+ Add Basket

ROUTES
Blue → A
Red → A
Blue → B
Red → B

RULES & FEATURES
3

That is the core.

==================================================
57. REMOVE DUPLICATE COLOR INPUTS
==================================================

Do NOT display:

Tee Name
Tee Color

for every physical Tee by default.

Instead:

TEE SET
Blue.

Clicking Blue Tee Set settings controls color Course-wide.

==================================================
58. BASKET COLOR INPUTS
==================================================

Same philosophy.

If Course uses standard Basket-position colors:

inherit from Course configuration.

Allow explicit override only when needed.

==================================================
59. QUICK ADD FROM MAP
==================================================

Map toolbar:

+ TEE
+ BASKET

Select:

Hole
Tee Set / Basket Position

then place.

Fast enough for field mapping on mobile/tablet.

==================================================
60. GPS FIELD MODE
==================================================

When user is physically mapping:

ADD BLUE TEE

[Use my location]

Save

ADD RED TEE

[Use my location]

Save

ADD BASKET A

[Use my location].

Route setup may follow immediately or later.

==================================================
61. SMART NEXT ACTION
==================================================

Course Studio should always tell user the next useful thing.

Example:

Hole 3

✓ Blue Tee
✓ Red Tee
✓ Basket A
○ Basket B route incomplete

NEXT:
Map Red → B route.

==================================================
62. DO NOT CALL COURSE INCOMPLETE BECAUSE OPTIONAL ROUTE IS MISSING
==================================================

Separate:

SCORING READY

MAP READY

FULLY MAPPED.

A Hole can be playable/scorable with one valid Tee/Basket pair even if
optional alternate routes remain unfinished.

==================================================
63. COURSE COMPLETENESS
==================================================

Course-level progress should use physical truth.

Example:

TEES:
39 mapped

BASKETS:
32 mapped

PLAYABLE PAIRS:
52

ROUTES:
47 mapped
5 provisional.

Do not use selected Layout hole count as Course mapping progress.

==================================================
64. LAYOUT COMPLETENESS
==================================================

Layout separately says:

18/18 Tee assignments

18/18 Basket assignments

18/18 Par

18/18 playable.

==================================================
65. AUTO-BUILD MAIN LAYOUT
==================================================

Once Course has enough data:

suggest:

CREATE MAIN LAYOUT.

Use:

default Tee Set

default/current Basket Position

for every physical Hole group.

User reviews.

==================================================
66. AUTO-BUILD OTHER LAYOUTS
==================================================

If Course has:

Blue + Red

suggest:

CREATE BLUE LAYOUT
CREATE RED LAYOUT.

Do NOT silently create public Layouts.

Generate Drafts for review.

==================================================
67. MAP OVERVIEW
==================================================

Default whole-Course map remains clean.

Show:

selected Layout

major geography

water

roads

Course flow.

Do not show every alternate Tee/Basket/route unless enabled.

==================================================
68. COURSE STUDIO MAP MODE
==================================================

Editing mode may show more:

all Tees

all Baskets

all routes

shared-route styling.

But use filters:

TEE SETS

Blue ✓
Red ✓

BASKETS

A ✓
B ✓.

==================================================
69. ROUTE FILTER
==================================================

Allow manager to display:

All

Blue only

Red only

Shared routes

Unmapped routes.

Useful for complex Courses.

==================================================
70. SHARED ROUTE LEGEND
==================================================

Map Key:

Blue route
Red route
Blue + Red shared route.

No ambiguity.

==================================================
71. COLLISION / OVERLAP
==================================================

Do not draw:

Blue dotted line
and Red dotted line

directly over each other as separate geometry.

Recognize shared segments and render one combined representation.

==================================================
72. MIGRATE CURRENT ROUTES
==================================================

Audit existing Course fairways.

For existing Blue and Red paths:

identify geometrically identical or near-identical portions.

Suggest:

MERGE SHARED SEGMENT.

Do NOT auto-merge ambiguous geometry without review.

==================================================
73. SMART MIGRATION UI
==================================================

Example:

Hole 3

Blue and Red routes overlap for 81% of their path.

[Share overlapping fairway]

[Keep separate].

This helps clean existing Courses.

==================================================
74. DO NOT DESTROY EXISTING GOOD FAIRWAYS
==================================================

Existing proper curved fairway geometry is valuable.

Preserve it.

Convert it into the connected route network.

Do not regenerate everything as straight lines.

==================================================
75. MIGRATE TEE COLORS
==================================================

Detect repeated Tee names/colors across Course.

Example:

27 physical Tees named Main with Blue color.

Offer:

CREATE TEE SET

Blue / Main

and link matching Tee Pads.

Do not require manual relinking.

==================================================
76. MIGRATE BASKET POSITIONS
==================================================

Same.

Repeated:

A
B
C

become consistent Course Basket naming defaults.

Physical Basket IDs remain unique.

==================================================
77. DATA INTEGRITY
==================================================

A Tee belongs to one canonical Course.

A Basket Position belongs to one canonical Course.

A Course Route's Tee and Basket must belong to the same Course.

A shared route segment may be used by multiple routes within that Course.

==================================================
78. NO CROSS-COURSE ROUTE BY ACCIDENT
==================================================

Layout picker should never offer assets from another Course.

Prevent bad references server-side.

==================================================
79. ROUTE DELETE SAFETY
==================================================

Before deleting a route or segment:

show what depends on it.

Example:

"This shared segment is used by 4 routes and 3 published Layouts."

Options:

Edit
Detach one route
Cancel.

Do not accidentally break Layouts.

==================================================
80. TEE DELETE SAFETY
==================================================

Before deleting Tee:

show:

used in 4 Layouts
used in 2 Events
used in 3 Route definitions.

Prefer:

Retire Tee

instead of hard-delete if historical references exist.

==================================================
81. BASKET DELETE SAFETY
==================================================

Same.

Retire historical Basket Position rather than destroying Event truth.

==================================================
82. VERSIONING
==================================================

Publishing material Course changes creates a Course version where needed.

Published Layout Versions remain immutable.

Historical Events stay reproducible.

==================================================
83. PERMISSIONS
==================================================

Course Owner/Admin/authorized Steward:

may alter canonical Course.

Contributors:

suggest.

Players:

report conditions / suggest corrections.

Do not expose physical Course mutation simply because user is authenticated.

==================================================
84. SUPABASE IMPLEMENTATION RULES
==================================================

Before making Supabase changes:

review the current Supabase changelog and relevant current docs.

Inspect existing tables first.

Reuse canonical structures where possible.

Do NOT create another disconnected Course Builder schema.

Enable appropriate RLS on every exposed table.

`TO authenticated` is not sufficient authorization.

UPDATE requires proper SELECT, USING and WITH CHECK rules.

Do not use editable user metadata for Course permissions.

Run database/security advisors after implementation.

==================================================
85. DATA ACCESS
==================================================

All of these products must consume the SAME Course data layer:

Course Studio
Layout Studio
Course Overview
Scorecard
Digital Caddy
Tee Signs
Caddy Book
Event Manager
Trackers.

Do not create independent geometry copies.

==================================================
86. REQUIRED ROGERS LAKEWOOD TEST
==================================================

Use Rogers Lakewood Park as the primary fixture.

Example Hole with:

Blue Tee

Red Tee

Basket A

Basket C.

Test:

Blue and Red use different opening shots.

Routes merge halfway down the fairway.

From merge point to A:

shared fairway.

Basket C:

route branches near green.

Expected:

one connected route graph.

==================================================
87. SHARED VISUAL TEST
==================================================

Enable Blue + Red.

Expected:

Blue unique segment:
Blue.

Red unique segment:
Red.

Shared segment:
alternating Blue + Red dashes.

Not:

two overlapping lines.

==================================================
88. TEE SET UPDATE TEST
==================================================

Change Course Tee Set:

Red
color

from red to orange.

Expected:

every Red Tee marker

route segment

Layout representation

Tee Sign

Caddy Book

updates.

No Hole-by-Hole editing.

==================================================
89. ADD TEE TEST
==================================================

Hole 9 has Blue only.

Add Red Tee.

Select:

Same fairway as Blue.

Place Red Tee.

Expected:

DGD creates only the unique Red approach to merge.

Downstream Blue route is reused.

==================================================
90. ADD BASKET TEST
==================================================

Hole 9 has Basket A.

Add B.

Choose:

Same fairway, different finish.

Select split point.

Place Basket B.

Expected:

upstream path reused.

Only finish branch added.

==================================================
91. LAYOUT TEST
==================================================

Create:

RED 18.

DGD automatically assigns:

Red Tee
→ current/default Basket

for every Hole where available.

User only handles exceptions.

==================================================
92. MIXED LAYOUT TEST
==================================================

Create:

Tournament Layout.

Layout Hole 1:
Hole 1 Blue → 1A

Layout Hole 2:
Hole 2 Red → 2C

Layout Hole 3:
Hole 3 Blue → 7A.

All valid.

Physical Course unchanged.

==================================================
93. SIGNAGE TEST
==================================================

Generate Tee Sign for Hole with:

Blue
Red
A
B.

Expected:

both Tee Pads

both Basket Positions

proper route branches

shared fairway visually shared

current Basket clearly identified

distance information generated from actual geometry.

==================================================
94. MOBILE TEST
==================================================

A Course Steward standing on the Course should be able to:

select Hole

Add Tee

use GPS

choose Tee Set

save

Add Basket

use GPS

save

define Same/Join/Different Fairway

without navigating away through multiple screens.

==================================================
95. USER EXPERIENCE TARGET
==================================================

Building a Course should feel like:

IDENTIFY WHAT EXISTS
→
PLACE IT
→
SHOW HOW IT CONNECTS.

Not:

fill out a database form.

==================================================
96. FINAL PRODUCT RULE
==================================================

DEFINE TEE COLORS ONCE FOR THE COURSE.

PLACE EACH PHYSICAL TEE ONCE.

PLACE EACH PHYSICAL BASKET ONCE.

BUILD CONNECTED ROUTES BETWEEN THEM.

SHARE FAIRWAY SEGMENTS WHEN SHOTS SHARE THE SAME CORRIDOR.

SPLIT ROUTES WHEN TEES OR BASKETS REQUIRE DIFFERENT SHOT SHAPES.

THEN BUILD LAYOUTS BY SIMPLY SELECTING:

TEE
→
BASKET
→
PAR.

EVERYTHING — MAPS, SCORECARDS, CADDY GUIDES, TEE SIGNS, EVENTS AND LAYOUTS —
MUST CONSUME THAT SAME CONNECTED COURSE BUILD.