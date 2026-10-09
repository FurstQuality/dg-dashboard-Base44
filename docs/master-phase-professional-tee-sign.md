MASTER PHASE — DGD PROFESSIONAL TEE SIGN RENDERER
DETAILED TOPOGRAPHIC DISC GOLF MAPS + MULTIPLE TEES/PINS + CURRENT PIN STATUS

Rework the DGD Tee Sign system around the attached approved reference concept.

IMPORTANT:

The reference image establishes the TARGET INFORMATION DESIGN and LEVEL OF
DETAIL.

Do not copy another company's artwork, branding, logo, proprietary template,
or exact visual design.

Build an original DGD tee-sign system with the same useful cartographic
concepts, but cleaner, more accurate, more modern, and generated directly from
DGD canonical Course data.

==================================================
1. PRODUCT GOAL
==================================================

DGD should automatically generate professional-grade tee signs that allow a
player standing on the Tee to immediately understand:

- What Hole am I playing?
- What is the Par?
- Which Tee am I standing on?
- What Tee alternatives exist?
- What Basket positions exist?
- Which Basket position is CURRENTLY active?
- How far is each Basket from each Tee?
- Is the Hole uphill or downhill?
- Where are the major trees?
- Where are the woods?
- Where is water?
- Where is OB?
- Where are Mandos / Hazards / Drop Zones?
- How far from the Tee are those obstacles?
- What is the intended fairway / flight corridor?
- How does the terrain rise and fall?

The sign must be useful to a player who has NEVER played the Course before.

==================================================
2. THIS MUST BE AUTOMATIC
==================================================

The user maps the Hole in Course Studio.

DGD automatically creates the tee sign.

Do NOT require users to manually redraw:

trees
fairways
tees
baskets
OB
distance guides
contours
flight paths
elevation
water
roads
paths.

Those should render from canonical Course data.

Customization comes AFTER the automatic professional result.

==================================================
3. ONE SOURCE OF TRUTH
==================================================

Tee signs read directly from:

COURSE
PHYSICAL HOLE
PHYSICAL TEES
BASKET POSITIONS
LAYOUT
LAYOUT VERSION
FLIGHT PATH
COURSE TERRAIN
STRUCTURED RULES
CURRENT PIN STATE
BRANDING
SPONSORS.

Signage does NOT own separate copies of:

Par
distance
Tee coordinates
Basket coordinates
OB
Mando
Drop Zone
Hazard
terrain geometry.

==================================================
4. TEE SIGN IS LAYOUT-AWARE
==================================================

A sign must always know:

course_id
physical_hole_id
layout_id
layout_version_id
selected tee_id
selected basket_position_id or current basket state.

Do not generate ambiguous Hole signs from arbitrary Course values.

Example:

CHAMPIONSHIP LAYOUT
Hole 7
Blue Tee
Basket B
Par 4.

==================================================
5. DEFAULT SIGN COMPOSITION
==================================================

Use a portrait-oriented professional sign.

Recommended structure:

LEFT / HEADER INFORMATION AREA
+
LARGE DETAILED HOLE MAP.

The map should receive the majority of visual space.

Information hierarchy:

COURSE NAME

HOLE NUMBER

PAR

TEE / BASKET DISTANCE MATRIX

ELEVATION

CURRENT PIN

then:

MAP.

Do not overcrowd the sign with secondary information.

==================================================
6. HOLE NUMBER
==================================================

Hole number must be immediately recognizable from a distance.

Support:

1
8A
15A
A
B
X

without assuming integer Hole numbering.

==================================================
7. MULTIPLE TEE PADS
==================================================

Show every relevant physical Tee used by the selected Layout family when
appropriate.

Examples:

SHORT
LONG

RED
WHITE
BLUE
GOLD

PRO
AM.

Each Tee receives:

- distinct map symbol
- distinct color
- readable name
- distances to available Basket positions.

The Tee for which the physical sign is installed should receive the strongest
visual emphasis.

==================================================
8. MULTIPLE BASKET POSITIONS
==================================================

Show all legitimate physical Basket Positions relevant to the Hole.

Examples:

A
B
C

SHORT
LONG.

Do NOT treat alternate Basket positions as separate Holes.

==================================================
9. CURRENT PIN POSITION
==================================================

This is a required feature.

DGD should support a canonical/current Hole Basket state such as:

CURRENT PIN: B

On the map:

CURRENT Basket
= strongest highlight
= bright basket icon
= halo / target treatment
= clearly labeled.

Alternate Basket positions:

muted but visible.

Example:

A = white / muted

B = gold / highlighted
CURRENT.

==================================================
10. UNKNOWN CURRENT PIN
==================================================

Never guess.

If DGD does not know which Basket position is currently active:

show:

CURRENT PIN
UNCONFIRMED

or omit the current-pin emphasis.

Do NOT arbitrarily highlight Basket A.

==================================================
11. CURRENT PIN DATA OWNERSHIP
==================================================

Current Basket placement belongs to Course operational data.

Authorized:

Course Steward
Course Admin
trusted designated maintainer

may update:

Current Pin = A/B/C.

Players may report:

"Basket is currently in B"

as a confirmation/proposal according to Course permissions.

==================================================
12. PIN CHANGE PROPAGATION
==================================================

When current Basket changes from:

A → B

automatically update:

digital tee sign
public Course map
digital Caddy
current Hole preview.

Do NOT rewrite:

historical Event Layout Versions

or finalized historical Event signage.

==================================================
13. DISTANCE MATRIX
==================================================

For Holes with multiple Tees and Basket positions, automatically create a
compact distance matrix.

Example:

            SHORT TEE    LONG TEE

A              245 ft       320 ft
Elevation       +6 ft         +4 ft

B              275 ft       360 ft
Elevation       +8 ft         +6 ft

CURRENT PIN: B

Use actual canonical/source distances where available.

If distance is calculated from mapped geometry:

identify internally as MAP DISTANCE.

Do not falsely call it official distance.

==================================================
14. PRIMARY DISPLAY DISTANCE
==================================================

For the Tee where the sign is installed:

make the distance to CURRENT Basket most visually prominent.

Secondary Tee/Basket combinations remain available but should not dominate the
sign.

==================================================
15. ELEVATION
==================================================

Elevation is a major DGD improvement over the reference.

Show:

TEE ELEVATION where useful

BASKET ELEVATION where useful

NET ELEVATION CHANGE.

Example:

BASKET B
360 FT
+18 FT.

Player should immediately understand:

UPHILL

DOWNHILL

or relatively FLAT.

==================================================
16. TOPOGRAPHIC HOLE MAP
==================================================

Render actual topography.

Include subtle:

CONTOUR LINES

terrain shading

slope changes

ridges

valleys

where legitimate elevation data is available.

Do not invent contours.

If elevation data is unavailable:

omit contours rather than drawing fake terrain.

==================================================
17. CONTOUR INTERVAL
==================================================

Contour spacing should adapt to Hole terrain.

Possible examples:

2 ft
5 ft
10 ft.

Choose an interval that communicates the terrain without covering the map in
lines.

Include a subtle legend when appropriate:

Contour interval: 5 ft.

==================================================
18. TOPOGRAPHIC READABILITY
==================================================

Contours must remain secondary.

They should help the player understand terrain while allowing:

fairway

trees

flight path

OB

Tee

Basket

to remain dominant.

Use subtle opacity and thin strokes.

==================================================
19. DISTANCE GUIDE SYSTEM
==================================================

This is REQUIRED.

Generate subtle distance reference lines from the primary Tee.

Default:

every 50 ft.

Example:

50
100
150
200
250
300
350
400 ft.

These should appear as curved guide lines / arcs across the Hole map.

They must blend into the design.

Do NOT render them as giant dominant white lines.

==================================================
20. DISTANCE GUIDE PURPOSE
==================================================

The player should be able to look at an obstacle and estimate:

"That large tree is around 220 ft from the Tee."

or:

"The water begins about 285 ft out."

This is a major design requirement.

==================================================
21. DISTANCE GUIDE ORIGIN
==================================================

Distance guides should originate from the Tee associated with the physical
sign.

If generating a digital comparison map for another Tee:

the renderer may recalculate the guides from that Tee.

Do not create conflicting overlapping 50-ft grids from every Tee by default.

==================================================
22. SMART DISTANCE LABEL PLACEMENT
==================================================

Labels should appear at low-clutter edges of the fairway/map.

Do not place:

200 FT

directly on top of:

Basket
tree
flight path
Mando
OB text.

Use collision avoidance.

==================================================
23. MAJOR TREE DETAIL
==================================================

Large trees are a critical navigational feature.

Render important individual trees where Course data supports them.

Differentiate:

LARGE INDIVIDUAL TREE

SMALL TREE

TREE GROUP

DENSE WOODS.

Do not turn every vegetation point into an identical tree icon.

==================================================
24. TREE CANOPY
==================================================

Where tree/canopy size is known or can be reasonably represented from Course
mapping:

render an approximate canopy footprint.

This helps players understand:

gaps

guardians

landing zones

blocked routes.

==================================================
25. TREE DISTANCE
==================================================

Major individual trees naturally inherit their relative distance from the
distance-guide grid.

Optional future enhancement:

select major tree
→ inspector shows distance from Tee.

Do not clutter every tree with a numeric distance label.

==================================================
26. WOODS
==================================================

Dense wooded areas should render as:

clean forest masses

with subtle individual-tree texture near important fairway edges.

Avoid visual noise.

==================================================
27. FAIRWAY CORRIDOR
==================================================

Render a clear fairway / intended playable corridor.

This should visually differentiate:

open fairway

rough

dense woods.

Do not imply that the fairway corridor itself is an official rule boundary
unless it actually is.

==================================================
28. MULTIPLE FAIRWAYS / ROUTES
==================================================

Support Holes with legitimate alternate play lines.

Examples:

left fairway

right fairway

short Tee route

long Tee route.

Render different intended lines when canonical Course data contains them.

Do not fabricate strategic routes.

==================================================
29. FLIGHT PATHS
==================================================

Flight paths should be visually distinct from distance guides.

Recommended:

solid or dashed directional route

with directional chevrons/arrows.

Different Tees may use different accent colors.

Example:

Short Tee:
red.

Long Tee:
blue.

==================================================
30. FLIGHT PATH IS NOT GPS TRACK
==================================================

This represents intended Hole routing / designed line.

It does NOT claim every player's disc should follow the exact line.

==================================================
31. BASKET LANDING / GREEN AREA
==================================================

Render a subtle green/target area around Basket Positions.

Current Basket:

stronger highlight.

Alternate Basket:

lighter treatment.

If putting-circle geometry is intentionally displayed:

label it appropriately.

Do not imply an official Circle 1 boundary unless that geometry is actually
being represented accurately.

==================================================
32. WATER
==================================================

Water should be visually obvious.

Use consistent DGD blue styling.

Where water is OB:

render the OB boundary as the rule.

Do not assume:

all water = OB.

==================================================
33. OB
==================================================

Show precise OB geometry from canonical Course rules.

Use:

boundary line

subtle outside shading where useful

occasional OB labels.

Do NOT repeat:

OB
OB
OB
OB

every few feet.

Use intelligent label spacing.

==================================================
34. MANDOS
==================================================

Render:

Mando
Double Mando

with strong standardized DGD symbols.

Show required passing side clearly.

==================================================
35. DROP ZONES
==================================================

Render Drop Zone with:

DZ marker

shape

label.

If rule associates a specific violation with the DZ:

show concise structured rule text.

==================================================
36. HAZARD / ISLAND
==================================================

Support:

Hazard

Island Green

Relief Area

Casual Area

where canonical rules specify them.

Use one shared DGD symbol language across:

Course Studio

tee signs

Caddy Book

digital Caddy.

==================================================
37. ROADS / PATHS / FENCES / BUILDINGS
==================================================

Render important physical landmarks.

They are extremely useful for orientation.

But their RULE meaning is separate.

A road does not become OB unless the Course rule says it is OB.

==================================================
38. MAP ORIENTATION
==================================================

Automatic orientation:

TEE
near bottom.

CURRENT BASKET
toward top.

If alternate Basket positions exist:

crop/orient to keep them visible where practical.

Do not force north-up for Hole signs.

==================================================
39. NORTH ARROW
==================================================

Because the Hole map may be rotated:

show a small North indicator.

Keep it subtle.

==================================================
40. AUTO-CROP
==================================================

DGD automatically calculates the required map extent using:

selected Tee

other relevant Tee positions

all relevant Basket Positions

flight paths

critical rules

major obstacles

safe visual padding.

Important objects may NEVER be clipped.

==================================================
41. DETAIL ZONES
==================================================

Prioritize detailed terrain inside and immediately around the playable Hole.

Reduce detail farther away.

This keeps the sign readable.

==================================================
42. MAP VISUAL STYLE
==================================================

The final sign should look like a professionally illustrated Course map.

NOT:

raw satellite screenshot.

NOT:

Google Maps screenshot.

NOT:

GIS debug view.

The visual renderer should translate canonical geography into:

clean vector/cartographic artwork.

==================================================
43. TERRAIN STYLE
==================================================

Use a coherent DGD mapping language.

Suggested visual families:

Fairway:
light natural green.

Rough:
medium green.

Dense woods:
dark forest green.

Water:
blue.

Paths:
neutral earth/gray.

Road:
muted gray.

Contours:
subtle warm/brown/neutral line.

Distance guides:
thin low-opacity contrasting line.

==================================================
44. CURRENT PIN EMPHASIS
==================================================

Use the strongest map-state hierarchy:

CURRENT BASKET:
bright/highlighted.

ALTERNATE BASKET:
white/gray/muted.

Never force the user to hunt for the active Basket.

==================================================
45. TEE EMPHASIS
==================================================

Physical sign's Tee:

primary emphasis.

Alternate Tee:

secondary.

This prevents confusion when both Red/Blue/etc. appear on one sign.

==================================================
46. TEE SIGN INFORMATION PANEL
==================================================

Recommended hierarchy:

COURSE NAME

HOLE
1

PAR
3

CURRENT PLAY
Long Tee → Pin B
360 FT
+6 FT

then compact:

PIN / TEE MATRIX.

Then:

CURRENT PIN: B.

The player should not have to parse a spreadsheet before finding their actual
distance.

==================================================
47. PIN POSITION TABLE
==================================================

Keep alternative configurations visible.

Example:

        SHORT    LONG

A       245'     320'
        +6'      +4'

B       275'     360'
        +8'      +6'

Highlight:

B CURRENT.

==================================================
48. LAYOUT-SPECIFIC CURRENT PLAY
==================================================

If selected Layout says:

Blue Tee → Basket B

then emphasize exactly that pairing.

Another Layout might say:

White Tee → Basket A.

The signs generated for that Layout must update accordingly.

==================================================
49. SIGN INSTALLED AT SPECIFIC TEE
==================================================

Support associating a physical sign with:

tee_id.

This matters for Courses where:

Blue Tee sign

and

White Tee sign

are separate physical signs.

Each can generate a slightly different composition.

==================================================
50. SINGLE-TEE COURSE
==================================================

Do not waste space on a multi-Tee matrix if only one Tee exists.

Adapt automatically.

==================================================
51. SINGLE-BASKET COURSE
==================================================

Do not show:

CURRENT PIN A

if there is only one permanent Basket and no alternate positions unless that
adds value.

Adapt template automatically.

==================================================
52. SIMPLE HOLE
==================================================

For simple one-Tee/one-Basket Hole:

show a cleaner design.

For complex:

multi-Tee/multi-Basket Hole:

use richer information panel.

One renderer, adaptive composition.

==================================================
53. ELEVATION PROFILE
==================================================

Add an optional compact elevation profile.

Example:

TEE ──╱────╲── BASKET
      +18 ft

This can be shown when terrain makes it useful.

Do not require a large graph on every sign.

==================================================
54. ELEVATION PROFILE SOURCE
==================================================

Build the profile along:

stored flight/path centerline

or

direct Tee→Basket line if no custom route exists.

Use legitimate elevation data.

Do not fabricate elevation samples.

==================================================
55. SLOPE LANDMARKS
==================================================

Where appropriate, topographic map should make features such as:

ridge

valley

steep uphill

downhill green

visually understandable.

Do not add speculative labels unless Course data identifies them.

==================================================
56. RULE SUMMARY
==================================================

Include concise structured Hole rules where space allows.

Example:

OB — Road and beyond right.
Mando — Pass left of marked tree.
DZ — Use marked DZ after missed Mando.

Do not duplicate a paragraph of prose onto the map.

==================================================
57. PLAYER NOTES
==================================================

Optional caddy note:

"Landing zone is short-left of the guardian oak."

Keep visually separate from official rules.

==================================================
58. QR CODE
==================================================

Optional QR in consistent position.

Links to:

Course
Layout
Hole.

Digital destination can show:

current pin
conditions
full Caddy
updated rules.

The printed QR does NOT encode those changing facts directly.

==================================================
59. SPONSOR AREA
==================================================

Optional sponsor region.

Must never overlap:

map
Hole stats
rules
QR.

==================================================
60. PROFESSIONAL DEFAULT TEMPLATE
==================================================

DGD must provide ONE excellent automatic default before offering extensive
customization.

The default should already be print-worthy.

Do not require the Course owner to be a graphic designer.

==================================================
61. CUSTOMIZATION
==================================================

Allow optional:

Course logo

primary color

accent color

background style

sign dimensions

sponsor

QR

rule display

topographic detail level

distance-guide interval.

Do NOT allow customization to break basic readability.

==================================================
62. DISTANCE GUIDE OPTIONS
==================================================

Default:

50-ft intervals.

Allow Course/sign setting:

25 ft
50 ft
100 ft

where appropriate.

Auto-select reasonable default from Hole length.

Example:

150-ft Hole:
25-ft or 50-ft.

800-ft Hole:
100-ft may be cleaner.

==================================================
63. LABEL DENSITY
==================================================

Automatically reduce labels on long/complex Holes.

Do not display 16 separate distance labels if they make the map unreadable.

==================================================
64. VECTOR RENDERER
==================================================

This must be a true vector/cartographic renderer.

Do not generate tee signs as screenshots of the Course editor.

Required high-quality outputs:

SVG

PDF

high-resolution PNG.

==================================================
65. PRINT QUALITY
==================================================

Text

lines

contours

tree symbols

Basket/Tee icons

must stay sharp on:

8×12
12×18
18×24
24×36

and custom sign sizes.

==================================================
66. LIVE PREVIEW
==================================================

Course Studio:

SIGNAGE
→ Hole 7

should immediately show the generated professional sign.

Primary actions:

PREVIEW

CUSTOMIZE

EXPORT.

Not:

DESIGN FROM SCRATCH.

==================================================
67. MAP EDIT → SIGN UPDATE
==================================================

Move a large tree.

Expected:

Sign updates.

Move Basket B.

Expected:

distances
elevation
current-pin map
flight path/crop
distance relationships

update.

Change OB.

Expected:

sign updates.

==================================================
68. CURRENT PIN CHANGE
==================================================

Course Steward changes:

Current Basket:
A → B.

Expected:

digital sign preview instantly highlights B.

Printable sign package is marked:

UPDATE AVAILABLE

if it contains old pin-state rendering.

==================================================
69. STATIC VS CHANGEABLE CURRENT PIN
==================================================

A physical printed sign cannot dynamically update itself.

Therefore support TWO presentation options:

OPTION A
print all Basket Positions and include:
Current pin marker using replaceable insert/sticker/slider field.

OPTION B
generate new printable artwork when pin changes.

Design the software so either workflow is possible.

==================================================
70. REPLACEABLE CURRENT PIN AREA
==================================================

For Courses that move baskets frequently:

support a dedicated:

CURRENT PIN

zone that can be physically updated separately.

Example:

CURRENT PIN:
[A] [B] [C]

or a small replaceable insert.

This is important for permanent signs.

==================================================
71. DIGITAL CURRENT PIN
==================================================

QR/digital Hole view always displays live current Basket placement.

Printed map still shows all positions.

==================================================
72. COURSE OVERVIEW CONSISTENCY
==================================================

The same topographic/cartographic visual language should also power:

Course overview map.

Course Overview should show:

all Holes
major trees/woods
terrain
water
roads
paths
amenities
current routing

with less Hole-level detail.

==================================================
73. CADDY BOOK CONSISTENCY
==================================================

The exact same Hole renderer should generate Caddy Book Hole pages.

Caddy Book may contain:

larger map
elevation profile
more notes
more rule detail.

Do not redraw.

==================================================
74. DIGITAL CADDY CONSISTENCY
==================================================

Digital Caddy also reads the same:

Tee
Basket
flight path
topography
rules
current pin.

==================================================
75. MAP DATA QUALITY STATES
==================================================

A Hole sign may be:

READY

PARTIAL

NEEDS DATA.

Example:

READY:
Tee, Basket, Par, distance known.

PARTIAL:
alternate pin geometry missing.

NEEDS DATA:
selected Tee or Basket missing.

Do not invent missing information merely to produce artwork.

==================================================
76. AUTOMATIC OBSTACLE DETAIL
==================================================

When important mapped objects fall within/near the playable corridor:

include them.

Examples:

large tree

tree cluster

creek

pond

road

building

fence.

Do not manually require the user to toggle every obvious major feature.

==================================================
77. OBSTACLE DISTANCE ANALYSIS
==================================================

Because every feature has coordinates, internally calculate approximate
distance from primary Tee to important obstacle landmarks.

Use this for:

map placement
future Caddy intelligence
inspector data.

The printed sign generally communicates these through the 50-ft guide system
rather than labeling every obstacle numerically.

==================================================
78. MAP LEGEND
==================================================

Prefer self-explanatory symbols.

Only render a legend for symbols actually present.

For simple Hole:

no giant legend.

For complex Hole:

compact legend.

==================================================
79. ACCESSIBILITY
==================================================

Do not rely solely on red vs blue to distinguish Tees/routes.

Also use:

labels

line pattern

symbols.

Ensure readable contrast.

==================================================
80. NO DUPLICATE SIGN FACTS
==================================================

Audit current Signage implementation.

If it stores independent:

par
distance
pin
tee
rules

remove that ownership.

The renderer reads canonical Course/Layout data.

==================================================
81. DATABASE / STATE NEEDS
==================================================

Reuse existing structures wherever possible.

Only add data structures where truly missing, such as:

current Basket-position state

sign installation Tee relationship

render configuration

render/export version metadata.

Do not create a parallel Hole database.

==================================================
82. CURRENT PIN HISTORY
==================================================

Track current Basket position changes:

hole
basket_position
effective time
changed by
source
optional note.

This enables:

current digital map
history
event verification.

==================================================
83. PERMISSIONS
==================================================

Only authorized Course roles may directly change official/current Basket state.

Normal users may submit:

Basket currently appears to be in B.

This becomes a report/confirmation according to existing permissions.

==================================================
84. SUPABASE / SECURITY
==================================================

Before database changes:

verify current Supabase changelog/docs.

For exposed tables:

RLS required.

Do not use `TO authenticated` alone as authorization.

Use Course ownership/role/capability predicates.

Data API grants are separate from RLS.

Views exposed to clients must preserve underlying security.

Avoid SECURITY DEFINER as a shortcut.

==================================================
85. IMPLEMENTATION ORDER
==================================================

PHASE A — DATA AUDIT

1. Audit current Hole Sign data ownership.
2. Audit physical Tee model.
3. Audit Basket Position model.
4. Audit current pin-state support.
5. Audit terrain/elevation data.
6. Audit tree/woods/water/feature geometry.
7. Audit structured rules.

PHASE B — CARTOGRAPHIC ENGINE

8. Build reusable vector Hole renderer.
9. Build Tee-oriented map rotation.
10. Build adaptive crop.
11. Build fairway rendering.
12. Build major-tree rendering.
13. Build woods rendering.
14. Build water/road/path rendering.
15. Build structured rule rendering.
16. Build current/alternate Basket styling.

PHASE C — DISTANCE SYSTEM

17. Build Tee-centered distance guides.
18. Add adaptive 25/50/100-ft spacing.
19. Add collision-aware distance labels.
20. Add obstacle-distance calculations.

PHASE D — TOPOGRAPHY

21. Integrate legitimate elevation source/data.
22. Build contour generation/rendering.
23. Build slope shading.
24. Build Tee→Basket elevation change.
25. Build optional elevation profile.

PHASE E — MULTIPLE CONFIGURATIONS

26. Render all relevant Tees.
27. Render alternate Basket positions.
28. Build Tee/Basket distance matrix.
29. Add current pin state.
30. Add installed-sign Tee state.
31. Add layout-specific emphasis.

PHASE F — SIGN COMPOSITION

32. Create professional default DGD sign template.
33. Build adaptive info panel.
34. Add Course branding.
35. Add QR.
36. Add sponsor area.
37. Add compact legend.
38. Add concise structured rules.

PHASE G — EXPORT

39. SVG.
40. vector PDF.
41. high-resolution PNG.
42. size presets.
43. bleed/safe area.
44. current-pin replaceable-area option.

PHASE H — INTEGRATION

45. Use same renderer in Caddy Book.
46. Use same renderer in digital Caddy.
47. Use compatible style in Course Overview.
48. Use Event Overlay for Event signs.
49. Invalidate/update renders after canonical changes.

PHASE I — TEST

50. single Tee / single Basket
51. multiple Tees
52. A/B/C Basket positions
53. uphill Hole
54. downhill Hole
55. wooded tunnel
56. large guardian trees
57. water-heavy Hole
58. OB-heavy Hole
59. Mando + DZ
60. very short Hole
61. very long Hole
62. current pin known
63. current pin unknown
64. layout-specific variations
65. Event Overlay
66. print-size verification
67. RLS/permission verification
68. database/security advisors.

==================================================
86. ACCEPTANCE TEST — REFERENCE QUALITY
==================================================

Create a Hole containing:

Short Tee
Long Tee

Basket A
Basket B

Current Basket = B

several large individual trees

dense woods

water

OB

flight path

elevation change.

Expected tee sign automatically shows:

- large Hole number
- Par
- Short/Long distances to A/B
- elevation for each configuration
- Current Pin B
- Short and Long Tee positions
- Basket A muted
- Basket B highlighted
- separate flight paths
- 50-ft distance guides
- major tree positions
- woods
- water
- OB
- topographic contours
- north indicator
- professional automatic crop.

NO manual redraw.

==================================================
87. ACCEPTANCE TEST — CURRENT PIN
==================================================

Change:

Current Pin B → A.

Expected:

highlight moves to A.

Distance emphasis changes to A.

Digital outputs update.

No Hole geometry duplication.

==================================================
88. ACCEPTANCE TEST — TREE
==================================================

Map a large tree approximately 220 ft from the Tee.

Expected:

tree appears in correct position.

200-ft and 250-ft distance guides make its approximate range visually obvious.

No need to manually label:

TREE 220 FT.

==================================================
89. ACCEPTANCE TEST — ELEVATION
==================================================

Hole climbs 28 ft from Tee to Basket.

Expected:

+28 FT

and topographic contours clearly communicate the climb.

No invented elevation.

==================================================
90. ACCEPTANCE TEST — MULTIPLE TEES
==================================================

Long Tee has a different route around a tree cluster.

Expected:

each Tee receives its own correctly stored/rendered flight path.

Both can appear on one complex sign without becoming visually confusing.

==================================================
91. PRODUCT RULE
==================================================

THE TEE SIGN SHOULD BE A PLAYER'S COMPLETE VISUAL EXPLANATION OF THE HOLE.

A PLAYER SHOULD BE ABLE TO STAND AT THE TEE, LOOK AT THE SIGN FOR FIVE
SECONDS, AND UNDERSTAND:

WHERE TO THROW

HOW FAR

WHICH BASKET IS ACTIVE

WHAT THE TERRAIN DOES

WHERE THE MAJOR OBSTACLES ARE

AND WHAT IS OUT OF BOUNDS.

MAP THE HOLE ONCE.

DGD SHOULD DESIGN THE PROFESSIONAL SIGN AUTOMATICALLY.