PHASE — UNIFY COURSE + LAYOUT OVERVIEW MAPS
ONE COURSE BASEMAP, CLEAN LAYOUT OVERLAYS

The current Course Overview has a serious map consistency problem.

Different Layouts for the SAME Course are visually showing what appears to be
different Courses / different map extents / different base geometry.

Example regression fixture:

ROGERS LAKEWOOD PARK

Layouts include:

Main 27
Blue Tees
Skip Derby + X,Y,Z
Skip X,Y,Z

Switching between these Layouts should NEVER make the physical Course itself
look different.

The Course has ONE physical structure.

Layouts only describe different ways to PLAY that structure.

==================================================
1. CORE RULE
==================================================

ONE COURSE = ONE CANONICAL PHYSICAL MAP.

Every Layout uses the same:

property geography

woods

water

roads

paths

fences

buildings

parking

restrooms

amenities

physical Tee Pads

physical Basket Positions

permanent Course features.

A Layout does NOT own another copy of those features.

==================================================
2. LAYOUT IS ONLY AN OVERLAY
==================================================

A Layout may change:

which Tee Pad is selected

which Basket Position is selected

which Tee → Basket pairing is played

route order

Layout Hole label

Par

distance

Layout-specific flight path

Layout-specific rules where explicitly required.

It must NOT change the underlying Course geography.

==================================================
3. REUSE THE NEW TEE → BASKET MODEL
==================================================

Preserve the simplified Layout model.

Each Layout Slot primarily references:

tee_id

basket_position_id

par

display_label

position

optional layout flight path

optional layout rule override.

The Tee and Basket may come from different physical Course Holes.

Example:

Layout Hole 1:

Hole 1 Blue Tee
→
Hole 7 Basket A.

That changes the PLAYABLE ROUTE.

It does NOT create a different physical Course map.

==================================================
4. BUILD ONE SHARED COURSE BASEMAP
==================================================

Create/reuse one canonical renderer:

COURSE BASEMAP

that is shared by every Layout.

It should render from the Course's canonical physical data.

Conceptually:

CourseBaseMap(course_id)

then:

LayoutOverlay(layout_version_id).

Do NOT build the entire map separately per Layout.

==================================================
5. NO PER-LAYOUT PHYSICAL MAP COPIES
==================================================

Audit existing architecture for things such as:

layout-specific Course geometry

layout-specific imported map snapshot

layout-specific water polygons

layout-specific fence geometry

layout-specific property bounds

layout-specific background imagery

duplicated Course features.

These should not exist unless they are genuinely Layout-specific playable
overrides.

Migrate toward shared Course-owned physical geometry.

==================================================
6. SAME MAP EXTENT FOR EVERY LAYOUT
==================================================

The default Course Overview should always open to the same:

center

bounds

orientation

zoom target

for that Course.

Store/reuse a canonical:

COURSE OVERVIEW EXTENT.

Example:

Rogers Lakewood Park
→ same whole-Course view

whether the user selects:

Main 27
Blue Tees
Skip Derby
Safari Layout.

==================================================
7. DO NOT FIT THE MAP TO THE LAYOUT BY DEFAULT
==================================================

Current behavior appears to allow different Layouts to change the visible map
extent dramatically.

Stop doing this.

DEFAULT:

FIT COURSE

Optional control:

[Fit Layout]

But switching layouts should NOT automatically zoom the user into a different
portion of the property.

==================================================
8. COURSE OVERVIEW EXTENT
==================================================

Determine whole-Course bounds from legitimate physical data such as:

Course boundary

or

all physical Tees/Baskets/features

with appropriate padding.

Use the same result for every Layout.

Do not derive the Course Overview bounds from selected Layout slots.

==================================================
9. COURSE MAP LAYERS
==================================================

Separate rendering into clear layers:

BASE GEOGRAPHY

Satellite/street imagery
Course boundary
woods
water
roads
paths
buildings
terrain.

PHYSICAL COURSE

Tees
Basket Positions
amenities
major physical features.

LAYOUT

selected Tee
selected Basket
hole order
route
flight path.

RULES

OB
Mando
Hazard
DZ
Island
relief.

CONDITIONS

temporary Course issues.

EVENT

temporary Event Overlay.

==================================================
10. DEFAULT COURSE OVERVIEW LAYERS
==================================================

The public Course Overview should DEFAULT to:

BASE GEOGRAPHY:
ON

SELECTED LAYOUT:
ON

AMENITIES:
minimal / useful

RULES:
OFF

CONDITIONS:
OFF unless important active condition

OTHER PHYSICAL TEES/BASKETS:
OFF or heavily muted.

The result should be visually clean.

==================================================
11. REMOVE OB CLUTTER FROM DEFAULT OVERVIEW
==================================================

The current map is overwhelmed by:

red OB lines

red OB polygons

rule boundaries.

Do NOT show all detailed OB geometry on the default Course Overview.

Players looking at the Course Overview primarily need to understand:

where the Holes are

how they flow

where the Course sits

major terrain/water

where they start/end.

Detailed competitive rules belong elsewhere.

==================================================
12. RULES TOGGLE
==================================================

Add a simple:

LAYERS

menu.

Suggested:

✓ Layout
○ Rules
○ Amenities
○ Conditions
○ All Tees/Baskets.

Rules default:

OFF.

When enabled:

show:

OB

Mando

DZ

Hazard

Island

relief.

==================================================
13. WATER IS PHYSICAL, OB IS A RULE
==================================================

Important distinction.

Water remains visible as physical geography.

If water is also OB:

do NOT cover the overview with repeated:

OB
OB
OB

labels.

Default Overview:

show the water.

Rules Layer:

show the OB rule boundary.

==================================================
14. FENCES
==================================================

Fence is physical Course geography.

Render it subtly.

Do not render every fence like a major competitive rule.

If fence defines OB:

Rules layer may emphasize that boundary.

Default Overview:

thin neutral fence representation.

==================================================
15. PATHS / ROADS
==================================================

Same principle.

Physical path/road:

visible but subdued.

OB rule associated with path:

hidden until Rules layer enabled.

==================================================
16. PROPERTY BOUNDARY
==================================================

Course boundary should be:

subtle

or hidden by default if it creates clutter.

Do not render it as a giant bright competitive rule line.

==================================================
17. CLEAN LAYOUT OVERLAY
==================================================

Default selected Layout should primarily show:

Layout Hole number

selected Tee

selected Basket

clean route/flight line.

Avoid unnecessary labels.

Example:

1
2
3
4
5...

with simple readable route flow.

==================================================
18. TEE / BASKET OVERVIEW SYMBOLS
==================================================

Do not display giant overlapping:

MAIN
MAIN
MAIN
H1
H2
H3

labels everywhere.

On whole-Course overview:

use compact cartographic markers.

Example:

1
2
3

with optional Tee/Basket indication.

Detailed Tee name / Basket position appears:

on hover

tap

selected Hole

Hole Detail.

==================================================
19. SELECTED LAYOUT ONLY
==================================================

If Blue Tees uses:

Hole 1 Blue Tee
→ Hole 1A

show that pairing.

Do not show:

Main Tee

Red Tee

Basket B

Basket C

unless:

user enables All Course Assets

or selects the Hole.

==================================================
20. OTHER COURSE ASSETS
==================================================

All unused Tees and Basket Positions still exist physically.

Do not delete/hide them from Course data.

Simply keep them out of the default overview.

Optional Layer:

ALL COURSE ASSETS.

==================================================
21. LAYOUT ROUTE COLORS
==================================================

Use one coherent route style for the entire Layout.

Do not assign every feature a competing bright color.

Selected Layout route should stand out.

Everything else recedes.

==================================================
22. HOLE FLIGHT PATH DETAIL
==================================================

Whole-Course Overview should use simplified route paths.

Do not render full Tee Sign-level:

fairway width

landing zones

distance arcs

OB labels

C1/C2

tree detail

for every Hole simultaneously.

That information belongs in the Hole view.

==================================================
23. MAP INFORMATION HIERARCHY
==================================================

At whole Course scale prioritize:

1. Layout Hole numbers
2. Layout flow
3. major terrain
4. water
5. roads/paths
6. important amenities.

De-prioritize:

exact OB
Mando
DZ
fine tree geometry
distance rings
minor hazards.

==================================================
24. SELECT A HOLE FOR DETAIL
==================================================

When user taps:

Hole 8

then show a focused detail panel or Hole view with:

Tee
Basket
Par
Distance
rules
flight path
hazards.

Do not force all 21/24/27 Holes' detailed rules into one map.

==================================================
25. COURSE HEADER VS LAYOUT HEADER
==================================================

Stop mixing Course-level stats with Layout-level stats.

COURSE:

Rogers Lakewood Park

Location
number of physical Course assets / available Layouts
general Course information.

SELECTED LAYOUT:

Blue Tees
24 Holes
Par 72
8,224 ft.

Do not present:

27 Holes

beside:

Blue Tees · 24 Holes

in a way that looks contradictory.

==================================================
26. LAYOUT STATS SHOULD CHANGE
==================================================

When changing Layout:

Hole count
Par
distance
selected Tee/Basket pairing

may change.

That is correct.

==================================================
27. BASE COURSE FEATURES MUST NOT CHANGE
==================================================

When changing Layout:

water

woods

roads

paths

Course boundary

fences

buildings

parking

restroom

Course entrance

must remain identical.

==================================================
28. VERIFY COURSE_ID RELATIONSHIPS
==================================================

Audit every Rogers Lakewood Layout.

Confirm they all reference:

THE SAME canonical course_id.

If any Layout is incorrectly linked to another Course:

repair it.

Do not simply mask it visually.

==================================================
29. VERIFY FEATURE QUERIES
==================================================

Audit current map queries.

Permanent physical features should be loaded by:

course_id

NOT:

layout_id.

Examples:

water

woods

fences

roads

paths

buildings

amenities

property.

==================================================
30. LAYOUT FEATURE QUERY
==================================================

Only Layout-specific data should load by:

layout_id / layout_version_id.

Examples:

slot order

selected tee_id

selected basket_position_id

Layout flight path

Layout-specific rules.

==================================================
31. EVENT OVERLAY
==================================================

Event-specific:

temporary OB

temporary Mando

temporary DZ

temporary Basket

temporary Tee

must NOT appear on the general Course Overview.

Only show when:

viewing that Event

and Event Overlay is enabled.

==================================================
32. PERMANENT RULES
==================================================

If a rule is permanently true for the Course:

store it as Course-owned rule geometry.

All Layouts can reference it.

Still keep the visual Rule layer OFF on default overview.

==================================================
33. LAYOUT-SPECIFIC RULE
==================================================

If rule applies only to one Layout:

store as Layout-specific rule overlay.

Do not mutate shared Course geography.

==================================================
34. OVERVIEW RENDERER
==================================================

Build one renderer conceptually:

renderCourseOverview({
  courseId,
  layoutVersionId,
  showRules: false,
  showAmenities: true,
  showConditions: false,
  showAllAssets: false,
  extentMode: "course"
})

All Course Overview layouts should use this.

==================================================
35. DO NOT SCREENSHOT THE EDITOR
==================================================

Public overview should be rendered from canonical geometry.

Do not simply display Course Studio's current editing layer state.

Editor draft objects should never leak onto public overview.

==================================================
36. OVERVIEW STYLE
==================================================

Target:

professional park/course map

not:

GIS editing workspace.

Use:

clean labels

small symbols

subtle physical features

clear route lines

good spacing.

==================================================
37. CLUSTER LABELS
==================================================

At whole-Course scale:

avoid dozens of labels overlapping.

Use collision detection.

Prioritize:

Hole number.

Hide subordinate labels until zoom/tap.

==================================================
38. TEE LABELS
==================================================

Do NOT permanently render:

MAIN

under every Tee.

If selected Layout uses:

Main Tee

the player already understands the route.

Show Tee name only when:

selected

hovered

different/important.

==================================================
39. BASKET LABELS
==================================================

Same.

Do not render Basket position label under every Basket at overview scale unless
needed.

==================================================
40. BLUE TEES EXAMPLE
==================================================

BLUE TEES

The Overview should use EXACTLY the same Rogers Lakewood base map as:

Main 27.

Differences:

Blue Tee locations selected

different Basket selections if applicable

24 Hole route

different route lines

different stats.

Nothing else.

==================================================
41. SKIP DERBY EXAMPLE
==================================================

SKIP DERBY + X,Y,Z

Same Course map.

Different:

21 Layout slots

selected Tee → Basket routes

special X/Y/Z routes

Par

distance.

No different physical property map.

==================================================
42. SAFARI ROUTES
==================================================

If a Layout contains:

Hole 1 Blue Tee
→ Hole 7A Basket

show the custom route on the SAME Course basemap.

The map may show that line crossing physical areas differently.

That is expected.

Do not create an alternate Course environment.

==================================================
43. FIT COURSE BUTTON
==================================================

Provide:

[Fit Course]

as the primary reset control.

Optional:

[Fit Layout]

for users who want to focus on only the selected route.

==================================================
44. REMEMBER VIEW LOCALLY
==================================================

User pan/zoom may persist during session.

But changing Layout should NOT reset to a completely different Course viewport.

If user selects another Layout:

keep current Course map position where practical.

==================================================
45. PUBLIC COURSE OVERVIEW
==================================================

Default desktop composition:

LEFT:

Course/Layout information

RIGHT:

clean whole-Course map.

The map should be readable without requiring zoom.

==================================================
46. MOBILE OVERVIEW
==================================================

Mobile:

Layout selector

compact stats

large clean map

Course Conditions

actions.

Do not attempt to display every rule/feature label on a phone.

==================================================
47. LAYER MENU MOBILE
==================================================

Single button:

LAYERS

Bottom sheet:

Layout ✓
Rules
Amenities
Conditions
All Course Assets.

==================================================
48. COURSE CONDITIONS
==================================================

Important active conditions may show:

small caution marker.

Do not automatically display the entire conditions editing layer.

==================================================
49. COURSE OVERVIEW GENERATED IMAGE
==================================================

The same cleaned renderer should also power the automatically generated:

Course map sign

Caddy Book overview

Event Course overview.

Do not maintain separate Course-overview engines.

==================================================
50. TEE SIGNS REMAIN DETAILED
==================================================

Do NOT remove detailed rule rendering from:

TEE SIGNS

HOLE CADDY PAGES

focused Hole maps.

Those products SHOULD show:

OB

Mando

DZ

Water

trees

distance guides

elevation

etc.

This cleanup applies specifically to whole-Course overview presentation.

==================================================
51. THREE DETAIL LEVELS
==================================================

Create explicit rendering levels.

LEVEL 1 — COURSE OVERVIEW

Layout route
Hole numbers
major geography
water
roads
amenities.

LEVEL 2 — HOLE OVERVIEW

Tee
Basket
flight route
important terrain
important rules.

LEVEL 3 — TEE SIGN / CADDY DETAIL

full OB
Mando
DZ
distance guides
topography
trees
hazards
current Basket.

Do not use one clutter level for every product.

==================================================
52. DATA MODEL CLEANUP
==================================================

Audit for physical Course feature rows accidentally associated directly with
layout_id.

Where legitimate permanent data:

reassociate with canonical Course.

Preserve provenance/history.

Do not duplicate rows to every Layout.

==================================================
53. DON'T BREAK HISTORICAL VERSIONS
==================================================

Published historical Layout Versions still preserve exact playable setup.

But shared permanent Course geography should be resolved from the correct
version/snapshot mechanism where required for historical Events.

Do not rewrite historical Event truth.

==================================================
54. COURSE FEATURE VERSIONING
==================================================

If physical Course geography changes materially:

preserve Course version history as already designed.

Current Course Overview:

current physical Course version.

Historical Event:

the pinned historical Course/Layout state as applicable.

==================================================
55. ROGERS LAKEWOOD REGRESSION
==================================================

MANDATORY TEST.

Open:

Rogers Lakewood Park.

Capture default Course Overview map extent.

Switch:

Main 27
→ Blue Tees
→ Skip Derby + X,Y,Z
→ Skip X,Y,Z
→ Main 27.

Expected:

same base Course

same property position

same water

same roads

same woods

same fence locations

same buildings

same general zoom/extent.

Only Layout route/assets/stats change.

==================================================
56. MAP VISUAL REGRESSION
==================================================

Compare screenshots.

The outline/shape of Rogers Lakewood itself should remain visually identical
across all Layouts.

If not:

FAIL.

==================================================
57. RULE CLUTTER REGRESSION
==================================================

Default overview:

OB lines:
hidden.

OB labels:
hidden.

Mando:
hidden unless critical overview marker is intentionally enabled.

DZ:
hidden.

Detailed rules appear after:

Rules ON.

==================================================
58. WATER REGRESSION
==================================================

Water remains visible in both:

Rules OFF

Rules ON.

Rules ON may add its OB relationship.

==================================================
59. ASSET SELECTION REGRESSION
==================================================

Main:

show Main Layout Tee/Basket selections.

Blue:

show Blue Layout Tee/Basket selections.

Skip Derby:

show exact selected Tee/Basket pairings.

Do not display every Course Tee simultaneously.

==================================================
60. COURSE DATA REGRESSION
==================================================

Changing selected Layout must NEVER:

move water

move fence

change property boundary

change parking

change Course entrance

change woods

change Course location.

==================================================
61. CLEAN MAP SUCCESS TARGET
==================================================

At first glance a player should be able to understand:

Where is Hole 1?

How does the Course flow?

Where does the Layout finish?

Where are major water/terrain features?

Where is parking/start area?

They should NOT be forced to decipher:

dozens of red polygons

dozens of MAIN labels

every OB segment

every alternate Tee

every alternate Basket.

==================================================
62. IMPLEMENTATION ORDER
==================================================

1. Audit Layout → Course relationships.
2. Repair any wrong course_id relationships.
3. Identify duplicated physical map data.
4. Move permanent geometry ownership to Course.
5. Create canonical Course Overview extent.
6. Build shared CourseBaseMap.
7. Build LayoutOverlay separately.
8. Default Overview to Fit Course.
9. Hide detailed Rules layer by default.
10. Reduce Tee/Basket label clutter.
11. Add Layer menu.
12. Add Fit Layout optional control.
13. Reuse renderer in Caddy Book Course Overview.
14. Reuse renderer for Course Map Sign.
15. Run Rogers Lakewood regression.
16. Verify mobile.
17. Verify historical Layout/Event integrity.
18. If DB changes are made, audit RLS/grants and run security/database advisors.

==================================================
63. DO NOT CREATE A SECOND MAP SYSTEM
==================================================

This is critical.

DO NOT solve this by creating:

layout_map_v2

new Course overview geometry

another Course renderer

another imported map snapshot.

Reuse and simplify the canonical Course architecture.

==================================================
64. FINAL PRODUCT RULE
==================================================

THE COURSE IS THE PLACE.

THE LAYOUT IS HOW YOU PLAY THROUGH THAT PLACE.

CHANGING THE LAYOUT MUST NEVER MAKE THE PLACE ITSELF CHANGE.

EVERY ROGERS LAKEWOOD LAYOUT SHOULD VISIBLY BE ROGERS LAKEWOOD.

THE DEFAULT COURSE OVERVIEW SHOULD BE CLEAN ENOUGH TO UNDERSTAND THE ENTIRE
COURSE AT A GLANCE.

DETAILED RULES BELONG ONE LEVEL DEEPER.