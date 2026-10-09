PHASE — COURSE STUDIO + TEE SIGN PRECISION PASS
MAKE THE CURRENT SYSTEM CLEANER, MORE ACCURATE, AND PROFESSIONAL

DO NOT REBUILD THE CURRENT COURSE STUDIO OR SIGNAGE SYSTEM.

The current implementation is close.

This phase is a refinement pass focused on:

1. geographic accuracy
2. cartographic accuracy
3. visual cleanliness
4. correct readiness/data states
5. better use of sign space
6. much more professional rendering.

Use the current Marquette Park implementation as a regression fixture.

==================================================
1. PRIMARY DESIGN GOAL
==================================================

The current signs are readable but still look somewhat generated/cartoon-like.

Move the visual style toward:

PROFESSIONAL COURSE CARTOGRAPHY

instead of:

decorative illustrated fairway.

Every visible feature should have a reason to be where it is.

Trees should correspond to mapped trees/vegetation.

Fairways should correspond to mapped playable corridors.

Distance guides must be mathematically accurate.

Tees/Baskets must correspond to canonical coordinates.

Terrain should correspond to actual mapped/elevation data.

Do not add decorative geometry merely to make the sign look full.

==================================================
2. DO NOT REPLACE THE EXISTING ARCHITECTURE
==================================================

Keep:

Course
→ Physical Hole
→ Tee
→ Basket Position
→ Layout
→ Sign Renderer.

Keep the existing sign-generation workflow.

Improve rendering and editor behavior in place.

==================================================
3. FIX READINESS LOGIC FIRST
==================================================

The current screenshot shows:

18/18 Tees
18/18 Basket Positions
0/18 Pars confirmed

while also showing:

SCORING READY.

That is incorrect.

Fix readiness definitions.

MAP READY:

Required physical Tee/Basket geometry exists for the selected Layout.

SCORING READY:

Every scoring Hole has legitimate:

Hole sequence
+
Par.

SIGN MAP READY:

Required selected Tee/Basket geometry exists.

TEE SIGN READY:

selected Tee
selected Basket
Hole number
legitimate Par
distance

exist.

CADDY READY:

required geometry
+
rules/notes according to existing Caddy requirements.

Unknown Par is NULL.

Never treat unknown Par as:

Par 3.

==================================================
4. COURSE PROGRESS SHOULD REFLECT REAL DATA
==================================================

Current Course panel:

Property
Holes
Tees
Basket positions
Pars confirmed.

Keep this useful structure.

But make it compact.

Example:

COURSE MAP

18 / 18 Holes
18 / 18 Tees
18 / 18 Baskets
0 / 18 Pars

NEXT:
Confirm Hole 1 Par

[Continue]

Remove conflicting badges.

==================================================
5. MAP EDITOR CLEANUP
==================================================

The editor currently shows too many competing controls.

Simplify the default workspace.

TOP BAR:

Hole selector
Layout selector
Par
Distance
Undo
Redo
Saved state

LEFT TOOLBAR:

Select

Tee
Basket

Flight Path

Rules ▾
Terrain ▾
Amenities ▾

RIGHT PANEL:

ONLY selected-object details.

Do not permanently display every possible editor function.

==================================================
6. MOVE SECONDARY ACTIONS OUT OF THE MAP
==================================================

Actions such as:

Stand on Tee
Stand at Basket
Bring in map file
Lay course map over aerial

should not permanently occupy the top center of the map.

Move them into:

MAP ▾

or:

TOOLS ▾.

Keep the actual map as visually clean as possible.

==================================================
7. SELECTED HOLE SHOULD DOMINATE
==================================================

By default:

Selected Hole:
100% opacity.

Other Holes:
very faint.

Offer:

Other Holes
Hidden / Faded / Shown.

Current faded-state is useful but should be even less distracting.

==================================================
8. HIDE IRRELEVANT MAP OBJECTS
==================================================

When editing Hole 1:

do not show Course features that do not help edit Hole 1 unless the user asks
for them.

Use contextual visibility.

==================================================
9. FAIRWAY ACCURACY
==================================================

The current light-green corridor appears too generic.

Do NOT automatically generate a large capsule-shaped fairway merely from:

Tee
Flight Path
Basket.

Separate:

FLIGHT PATH

from:

FAIRWAY.

==================================================
10. FAIRWAY SOURCE
==================================================

Fairway should come from:

manually mapped fairway polygon

legitimate imported Course geometry

or an approved Course feature.

If no fairway polygon exists:

show the flight path over terrain.

Do NOT invent a broad artificial fairway shape.

==================================================
11. OPTIONAL FAIRWAY ASSIST
==================================================

The editor may offer:

[Generate fairway suggestion]

based on the current path.

But it must be:

DRAFT / SUGGESTED

and editable.

Never treat it as Course truth automatically.

==================================================
12. FLIGHT PATH REFINEMENT
==================================================

The current red dashed flight path is visually heavy.

Improve it.

Use:

clean directional chevrons

or:

thin route line with directional markers.

It should clearly communicate intended routing without dominating the map.

==================================================
13. MULTIPLE FLIGHT PATHS
==================================================

If different Tees legitimately have different routes:

store/render each Tee's route separately.

Example:

Blue Tee Route
White Tee Route.

Do not calculate one universal path for the physical Hole.

==================================================
14. DISTANCE GUIDE ACCURACY
==================================================

Rebuild the sign distance guides as true Tee-centered geodesic/radial
distances.

Default:

50 ft
100 ft
150 ft
200 ft
250 ft
etc.

The guide must represent actual physical distance from the selected Tee.

Do NOT space guides visually just to fill the map.

==================================================
15. DISTANCE GUIDE SHAPE
==================================================

Distance guides should naturally represent equal-distance loci from the Tee.

They may appear as clipped arcs through the visible map.

Do not distort them to follow:

fairway
flight path
map crop.

==================================================
16. DISTANCE LABEL POSITION
==================================================

Place distance labels near low-clutter map edges.

Avoid:

trees
Basket
flight path
Hole text
OB labels.

Use automatic collision detection.

==================================================
17. ADAPTIVE DISTANCE INTERVAL
==================================================

Suggested defaults:

Hole under 250 ft:
50-ft intervals.

250–600 ft:
50-ft intervals.

600–1,000 ft:
100-ft intervals where cleaner.

Very long Hole:
adaptive.

The user may override.

==================================================
18. TREE ACCURACY
==================================================

The current tree symbols are too generic.

Every individual tree shown as an important tree should correspond to an actual
mapped feature.

Support:

individual tree
large tree
tree cluster
woods polygon.

==================================================
19. INDIVIDUAL TREE SIZE
==================================================

Allow mapped trees to contain:

trunk coordinate
approximate canopy diameter
tree importance.

Renderer should scale canopy appropriately.

Example:

large guardian oak

should visibly look more significant than a small ornamental tree.

==================================================
20. TREE SYMBOL STYLE
==================================================

Improve tree artwork.

Current circular clover-like trees feel overly cartoonish.

Use cleaner top-down cartographic tree symbols:

subtle canopy
slight internal texture
minimal border.

They must remain readable in print.

==================================================
21. TREE GROUPS
==================================================

Do not represent dense woods using hundreds of repeated individual icons.

Use:

woods polygon

with subtle canopy texture.

Place individual large trees only where they materially affect play.

==================================================
22. WOODS EDGE ACCURACY
==================================================

The fairway/woods boundary is strategically important.

Make mapped woods edges clear.

Avoid giant artificial polygon borders.

Use:

natural fill transition
subtle stroke.

==================================================
23. TOPOGRAPHIC DETAIL
==================================================

Add actual elevation/topographic rendering when elevation data is available.

Include:

contour lines
subtle slope shading
Tee elevation
Basket elevation
net elevation change.

==================================================
24. DO NOT INVENT TERRAIN
==================================================

If elevation data is unavailable:

do not draw fake contour lines.

Show:

Elevation unavailable.

==================================================
25. CONTOUR VISUAL STYLE
==================================================

Contours:

thin
low opacity
earth-tone/neutral.

Index contours may be slightly stronger.

They should be visible when looking for them but nearly disappear when the
player focuses on the route.

==================================================
26. ELEVATION TEXT
==================================================

Example:

LONG TEE → PIN B
366 FT
+21 FT

or:

-14 FT.

Use exact/derived elevation appropriately.

==================================================
27. OPTIONAL ELEVATION PROFILE
==================================================

For strongly sloped Holes:

allow a small profile:

TEE  ▂▃▄▆█  BASKET
+21 ft

Do not force this onto every sign.

==================================================
28. MULTIPLE TEES
==================================================

When multiple Tees exist:

show them accurately.

Primary Tee for this sign:

strong color.

Alternate Tee:

secondary color / muted.

Do not make both equally dominant.

==================================================
29. MULTIPLE BASKET POSITIONS
==================================================

Show:

A
B
C

at their exact canonical coordinates.

CURRENT Basket position:

strongest symbol
halo
CURRENT label where appropriate.

Alternates:

muted.

==================================================
30. CURRENT PIN PANEL
==================================================

For multi-pin Hole:

display clearly:

CURRENT PIN
B

Do not bury current Basket state inside a legend.

==================================================
31. TEE/BASKET DISTANCE MATRIX
==================================================

For complex Holes:

display compact accurate matrix.

Example:

          PIN A    PIN B

SHORT     300'     335'
LONG      355'     385'

Current:
LONG → B
385'
-6'.

Do not show unnecessary matrix rows/columns if they do not exist.

==================================================
32. TEE SIGN MAP SHOULD USE MORE SPACE
==================================================

The current left information panel is somewhat wide compared with the map.

Reduce the information panel width where possible.

Target:

approximately 25–32% information

68–75% map.

Complex Hole may adapt.

The Hole map is the main product.

==================================================
33. REMOVE PERMANENT LEGEND FROM SIMPLE SIGNS
==================================================

The current legend uses valuable space.

Do not show a legend by default when the visual symbols are self-explanatory.

Only display a compact legend when the Hole actually contains:

Mando
Hazard
OB
DZ
multiple uncommon symbols.

==================================================
34. DYNAMIC LEGEND
==================================================

Generate only the symbols used on the Hole.

Example:

OB
DZ
Mando.

Do not list:

Trees/Woods
Water
Path

unless clarification is actually necessary.

==================================================
35. COURSE NAME TREATMENT
==================================================

Keep Course name readable but more restrained.

Primary hierarchy should be:

HOLE NUMBER
PAR
CURRENT DISTANCE
MAP.

Course name is identity, not the dominant statistic.

==================================================
36. PAR PRESENTATION
==================================================

Never show:

PAR —

on a print-ready tee sign.

If Par is unknown:

sign status:

NEEDS PAR

and do not mark ready to print.

The editor preview may display:

PAR NOT CONFIRMED.

==================================================
37. DISTANCE SOURCE
==================================================

Use legitimate official/source distance when available.

Otherwise:

derive accurate map distance.

Internally preserve:

distance_type =
OFFICIAL
SOURCE
MAP_DERIVED
MANUAL_VERIFIED.

Do not silently mix them.

==================================================
38. CURRENT SIGN SCREEN
==================================================

Current Signage grid should become cleaner.

Each card:

HOLE 1
Par 3 · 260 ft

[sign preview]

Ready

[Preview]
[Customize]

Do not show:

POSITION 1 OF 18

unless it is genuinely helpful.

Layout order can appear subtly.

==================================================
39. SIGN STATUS
==================================================

Statuses:

READY

PARTIAL

NEEDS PAR

NEEDS MAP

NEEDS REVIEW.

Example:

Hole 1
NEEDS PAR

rather than:

Needs par confirmed
plus unrelated controls.

==================================================
40. SIGN GRID IMAGE CONSISTENCY
==================================================

All sign previews should use:

same physical output dimensions

same crop rules

same typography hierarchy

same visual margins.

The current three signs feel slightly inconsistent because map geometry fills
them differently.

Use adaptive map scaling inside a consistent page system.

==================================================
41. AUTO-CROP IMPROVEMENT
==================================================

Calculate the Hole visual envelope from:

primary Tee
alternate relevant Tees
all relevant Basket Positions
flight paths
critical obstacles
rules.

Add adaptive padding.

Do not leave excessive empty terrain.

Do not crop strategic objects.

==================================================
42. MAP ROTATION
==================================================

Tee near bottom.

Current Basket near top.

But choose rotation intelligently so long lateral objects such as:

water edge
OB
alternate Tee

remain visible.

==================================================
43. MAP ROTATION SHOULD NOT ROTATE LABELS
==================================================

Geography rotates.

Text/icons render upright afterward.

==================================================
44. NORTH INDICATOR
==================================================

Add a small North arrow/compass.

Especially important because the map is rotated.

Keep it subtle.

==================================================
45. WATER ACCURACY
==================================================

Water geometry should follow mapped water boundaries accurately.

Do not smooth away critical shorelines.

If water is OB:

render both physical water

and rule boundary

without confusing them.

==================================================
46. PATHS / ROADS
==================================================

Use actual geometry.

Render visually lighter than play/rule information.

If path/road is OB:

rule styling should make that clear.

==================================================
47. OB LABEL CLEANUP
==================================================

Only label OB at useful intervals.

Do not repeat OB excessively.

==================================================
48. C1/C2
==================================================

Do not draw C1/C2 circles automatically unless:

they are specifically useful

and spatially accurate for the intended product.

A generic target halo is acceptable.

Do not make a decorative halo look like an official putting circle.

==================================================
49. TERRAIN LAYERS
==================================================

Editor Layers:

Satellite
Course Terrain
Play
Rules
Amenities
Contours
Distance Guides
Other Holes.

Allow quick visibility control.

==================================================
50. EDITOR OBJECT VISUALS VS PRINT VISUALS
==================================================

The Course editor can use functional bright markers.

The printed sign should use polished cartographic symbols.

Do not directly screenshot editor markers into signs.

==================================================
51. COURSE FEATURE PLACEMENT
==================================================

When a user places:

Tree
Woods
Water
Road
Path

that exact geometry should be what the renderer consumes.

Avoid renderer-side decorative substitutions that shift position.

==================================================
52. SNAP / MEASUREMENT
==================================================

Provide accurate measurement tools in Course Studio.

Selecting a mapped object may show:

Distance from Tee:
218 ft

Distance to Basket:
42 ft

where useful.

This helps validate major obstacles.

==================================================
53. COURSE DATA QUALITY TOOL
==================================================

Add optional:

CHECK HOLE MAP.

Run validations:

Tee exists
Basket exists
Par legitimate
distance reasonable
flight path endpoints correct
current pin valid
rules linked
terrain within bounds.

Return actionable warnings.

==================================================
54. NO FAKE TREE DETAIL
==================================================

Important:

Do not make a sign appear more detailed by inventing trees from a generic
pattern.

Accuracy is more important than visual density.

If the mapped Course has only 4 important trees:

show 4 accurate trees.

==================================================
55. OPTIONAL TERRAIN ASSIST
==================================================

If the app can derive candidate terrain from permitted source data:

show:

TERRAIN SUGGESTIONS.

Examples:

woods polygon
water
path
building.

Require acceptance before protected canonical Course geometry changes.

==================================================
56. COURSE STUDIO NEXT ACTION
==================================================

For Marquette currently:

18/18 Tees
18/18 Baskets
0/18 Pars.

The correct NEXT action should be:

Confirm Hole 1 Par

not:

Place Tees & Baskets.

Make completion guidance data-aware.

==================================================
57. DO NOT SHOW COMPLETED STEPS AS CURRENT TASKS
==================================================

If Tees/Baskets are complete:

the global Course progress should advance.

Do not keep telling the user:

Place Tees & Baskets.

==================================================
58. COURSE PROGRESS ENGINE
==================================================

Recommended:

1. Course identity/location
2. Physical Holes
3. Tees/Baskets
4. Par/Layout
5. Rules/Terrain
6. Publish

Current step determined automatically.

==================================================
59. SIGN PREVIEW SHOULD UPDATE LIVE
==================================================

Change:

Par
Tree
Basket
Flight Path
Current Pin
OB
Contour configuration

→ sign preview updates immediately.

==================================================
60. PRINT RENDER QUALITY
==================================================

Continue using true vector output.

No raster screenshot exports.

Verify:

tree symbols
contours
distance guides
text
rules

remain crisp at large sign sizes.

==================================================
61. CADDY BOOK USES EXACT SAME MAP
==================================================

The polished Hole map should become the canonical player-facing Hole renderer.

Tee sign:
compact composition.

Caddy Book:
larger composition.

Digital Caddy:
interactive composition.

No three different visual engines.

==================================================
62. COURSE OVERVIEW USES SAME VISUAL LANGUAGE
==================================================

Course overview should inherit:

terrain colors
tree style
water style
paths
tee/basket icons
flight paths
rules.

But reduce Hole-level detail.

==================================================
63. MARQUETTE REGRESSION TEST
==================================================

Use the current Marquette Park Main Layout as a full regression fixture.

For Holes 1–3 verify:

1. Tee/Basket positions exactly match Course Studio coordinates.
2. Flight Path exactly follows stored path.
3. Distance guides are true distances.
4. Tree positions correspond to canonical features.
5. No fake trees are generated.
6. Fairway exists only if mapped/approved.
7. Sign Par state matches database truth.
8. Map distance matches physical coordinates.
9. No object is clipped.
10. Labels do not collide.

==================================================
64. COMPLEX HOLE TEST
==================================================

Create/test one Hole with:

2 Tees
3 Basket positions
Current Pin B
large guardian trees
woods
water
OB
Mando
DZ
30-ft elevation change.

Expected:

clean professional sign

not visual chaos.

==================================================
65. SIMPLE HOLE TEST
==================================================

One Tee
one Basket
few trees
no rules.

Expected:

very clean minimal sign.

Do not force complex-Hole UI onto simple Holes.

==================================================
66. READABILITY TEST
==================================================

At normal printed viewing distance:

player should identify in under 5 seconds:

Hole
Par
current distance
current Basket
intended route
major obstacle
OB.

==================================================
67. VISUAL QUALITY TARGET
==================================================

The desired result should feel closer to:

professionally commissioned course cartography

than:

an automatically generated game map.

Clean.

Precise.

Subtle.

Data-driven.

==================================================
68. IMPLEMENTATION ORDER
==================================================

1. Fix readiness/status logic.
2. Fix Course progress/next-action logic.
3. Clean Course Studio toolbar.
4. Remove permanent secondary map buttons.
5. Separate Fairway from Flight Path.
6. Fix true-distance guide geometry.
7. Improve distance-label collision logic.
8. Improve tree/woods model and renderer.
9. Improve water/path/road renderer.
10. Add topographic contours/elevation.
11. Add current Basket position rendering.
12. Add multiple Tee/Basket rendering.
13. Add accurate Tee/Basket matrix.
14. Reduce sign information-panel footprint.
15. Replace permanent legend with dynamic legend.
16. Improve automatic crop/rotation.
17. Add North indicator.
18. Build Hole-map validation.
19. Apply renderer to Caddy Book.
20. Apply renderer style to Course Overview.
21. Run Marquette regression.
22. Run complex-Hole regression.
23. Verify print output.
24. Verify permissions/RLS if schema changes are required.
25. Run database/security advisors after any database changes.

==================================================
69. DO NOT CONSIDER COMPLETE UNTIL
==================================================

The current Marquette screenshots have been re-tested and:

- Scoring Ready is no longer shown with missing Par.
- Course progress no longer asks for already-completed Tee/Basket mapping.
- sign geometry matches Course Studio exactly.
- distance arcs represent true distances.
- trees appear at correct coordinates.
- fairways are not artificially invented.
- topographic information is accurate where available.
- signs no longer waste space on unnecessary legends.
- maps use more of the available sign area.
- multi-Tee/multi-pin rendering is clean.
- current Basket is immediately obvious.
- simple Holes remain visually simple.
- complex Holes remain readable.

==================================================
70. CORE RULE
==================================================

DO NOT ADD DETAIL FOR THE SAKE OF DETAIL.

EVERY LINE, TREE, CONTOUR, DISTANCE GUIDE, TEE, BASKET, RULE AND LABEL ON A
DGD TEE SIGN SHOULD CORRESPOND TO REAL COURSE INFORMATION.

THE GOAL IS NOT TO MAKE THE MAP BUSIER.

THE GOAL IS TO MAKE IT MORE TRUSTWORTHY.