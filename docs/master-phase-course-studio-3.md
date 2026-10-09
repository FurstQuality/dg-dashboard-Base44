MASTER PHASE — DGD COURSE STUDIO 3.0
SIMPLE VISUAL COURSE EDITOR + AUTOMATIC TEE SIGNS + CADDY BOOKS

Rework DGD Course Studio around a dramatically simpler interaction model.

Use the attached/reference Course editor screenshots as UX inspiration:

- extremely clear navigation
- large map workspace
- minimal tools
- visual editing instead of forms
- generated tee signs directly from Hole geometry
- generated caddy books directly from the same Course/Layout data
- simple sequential Course-building workflow.

DO NOT copy external branding, styling, artwork or proprietary assets.

Use the interaction philosophy and workflow only.

The DGD implementation must use our canonical architecture:

COURSE
→ PHYSICAL HOLES
→ PHYSICAL TEES
→ BASKET POSITIONS
→ LAYOUTS / LAYOUT VERSIONS
→ EVENT OVERLAYS

There must never be separate copies of Hole geometry for:

Course editor
Tee sign
Caddy book
Caddy
Event Director.

Everything is generated from the same canonical data.

==================================================
1. PRIMARY PRODUCT GOAL
==================================================

Course Studio should feel like:

A SIMPLE INTERACTIVE COURSE DESIGN APPLICATION

not:

a GIS administration dashboard.

A new user should be able to understand the basic workflow without
documentation:

1. Course
2. Map
3. Layouts
4. Signs
5. Caddy Book
6. Publish

Advanced functions remain available through contextual tools rather than
covering the screen permanently.

==================================================
2. SIMPLIFY THE COURSE STUDIO NAVIGATION
==================================================

Replace fragmented Course Builder / Course Editor / Signage / layout pages
with ONE Course Studio.

Primary navigation:

COURSE
MAP
LAYOUTS
SIGNAGE
CADDY BOOK
SPONSORS
PUBLIC PAGE

Optional EVENT configuration remains in Event Director.

Do not create a second Course map editor for Events.

==================================================
3. COURSE PAGE
==================================================

The Course page should be simple.

Show:

Course name
City / state
Course status
Course map readiness
Hole count
Primary layout
Course location
Course boundary/area
Sources / verification status.

Sections:

COURSE AREA

PHYSICAL HOLES

LAYOUTS

MAP STATUS.

Avoid giant configuration forms.

==================================================
4. COURSE BUILDING PROGRESS
==================================================

At the top show a compact Course completion workflow.

Example:

● Course
● Location
● Holes
● Tees & baskets
○ Layouts
○ Publish

Or:

4 / 6 complete — Build layouts

This is informational and actionable.

Do not block editing because another step is incomplete.

==================================================
5. MAP EDITOR — CORE EXPERIENCE
==================================================

The Map Editor should become the centerpiece.

Desktop:

large map occupies approximately 75–85% of usable workspace.

Minimal vertical tool palette on left.

Small contextual inspector on right.

Top bar:

Hole selector
Layout selector
Par
distance
save state
undo/redo.

No giant permanent settings sidebar.

==================================================
6. MAP EDITOR TOOL PALETTE
==================================================

Default palette should remain intentionally small.

SELECT

PLAY
- Tee
- Basket
- Flight path / landing point

RULES
- Mando
- Double mando
- OB line
- OB area
- Hazard
- Drop zone
- Island

TERRAIN
- Tree / woods
- Water
- Path / road
- Building
- Fence
- Landmark

More advanced tools:

[ MORE ]

Do not show every possible Course object at once.

==================================================
7. CONTEXTUAL INSPECTOR
==================================================

The right panel displays ONLY the selected item.

Nothing selected:

show Hole summary.

TEE selected:

name
color
coordinate
surface
verification
layout usage.

BASKET selected:

position name
coordinate
verification
layout usage.

OB selected:

rule text
scope
style.

This eliminates the enormous permanent Course editor sidebar.

==================================================
8. DIRECT MAP INTERACTION
==================================================

Primary interactions:

Click Tee tool
→ click map.

Click Basket tool
→ click map.

DGD immediately connects them visually.

Distance calculates automatically.

Drag:
moves asset.

Select:
opens inspector.

Delete:
contextual delete with dependency checks.

Do not make the user fill out a form before placing an object.

==================================================
9. AUTOMATIC HOLE MAP
==================================================

Once Tee + Basket exist:

automatically display:

Tee marker
Basket marker
direct line
map distance.

Allow user to bend/create a visual Flight Path separately.

Do not equate:

direct map line

with:

designed Flight Path.

==================================================
10. FLIGHT PATH
==================================================

Flight Path should be visually editable.

User can:

click line to add control point

drag point

remove point.

This path becomes the primary rendered path used in:

tee sign
caddy book
player caddy map.

==================================================
11. HOLE ORIENTATION
==================================================

For generated player-facing maps:

automatically rotate/crop Hole so:

TEE IS NEAR THE BOTTOM

BASKET IS TOWARD THE TOP.

This is extremely important.

Do not simply screenshot north-up satellite imagery.

The player should instantly understand:

Where do I throw?

==================================================
12. GENERATED VECTOR MAP
==================================================

Build a reusable DGD Hole Renderer.

INPUT:

physical Hole
selected Tee
selected Basket Position
Layout
rules
flight path
terrain/features
branding settings.

OUTPUT:

clean vector Hole graphic.

This renderer powers:

Tee Sign
Caddy Book
Player Guide
Event Guide
digital Caddy
shareable Hole image.

ONE renderer.

Not separate implementations.

==================================================
13. MAP STYLE
==================================================

Player-facing Hole artwork should simplify real geography.

Represent:

fairway
woods
water
roads
paths
OB
Mando
hazard
drop zone
Tee
Basket
flight line.

Do not reproduce raw satellite imagery for printed signs.

The map should look like a designed Course map.

==================================================
14. SATELLITE REMAINS EDITING REFERENCE
==================================================

Course editor may use:

Satellite
Hybrid
Street
Terrain.

Printed output uses:

DGD Illustrated Map

unless user specifically chooses aerial style later.

==================================================
15. SIGNAGE WORKSPACE
==================================================

SIGNAGE should no longer feel like a completely separate design application.

Landing page:

COURSE MAP SIGN

HOLE SIGNS

For each Hole show:

Hole number
selected Layout
Par
distance
Map status
Sign status

[ EDIT SIGN ]

==================================================
16. DEFAULT TEE SIGN
==================================================

Every sufficiently mapped Hole automatically receives a good-looking default
DGD Tee Sign.

User should NOT need to design every sign from scratch.

Generated from canonical data.

Example structure:

COURSE NAME

HOLE 7

PAR 4

438 FT

[large illustrated Hole map]

optional:
rules

QR code

sponsor area.

==================================================
17. TEE SIGN AUTO-CROP
==================================================

Renderer automatically:

1. finds selected Tee
2. finds selected Basket
3. calculates Hole bounds
4. adds visual padding
5. rotates Tee→Basket direction toward top
6. keeps relevant OB/rules visible
7. produces printable artwork.

No manual screenshot cropping.

==================================================
18. LAYOUT-AWARE SIGNS
==================================================

A Hole may have:

Blue Tee
White Tee

and:

Basket A
Basket B.

The sign is generated for:

LAYOUT SLOT

not merely physical Hole.

Example:

Championship Layout Hole 7

Blue Tee
→ Basket B
Par 4
438 ft.

This prevents the wrong Tee/Basket from appearing.

==================================================
19. SIGN VARIANTS
==================================================

Support:

ONE SIGN PER PHYSICAL TEE

or

ONE SIGN PER LAYOUT CONFIGURATION

depending on Course needs.

Avoid duplicate geometry.

==================================================
20. LIVE SIGN PREVIEW
==================================================

When user edits:

Tee
Basket
Flight path
OB
Mando
Hole rules

the sign preview automatically updates.

Do not require re-entering information.

==================================================
21. SIGN CUSTOMIZATION
==================================================

Keep customization intentionally simple.

Allow:

Course color
accent color
background/artwork
logo
sponsor area
QR toggle
rule text toggle
distance units
page/sign size.

Do NOT make this Canva.

The geometry/layout should remain professionally constrained.

==================================================
22. COURSE-WIDE STYLE
==================================================

Default styling is Course-wide.

Example:

Dark green
Lime accent
Course logo
bottom sponsor strip.

Changes automatically apply to all Hole signs.

==================================================
23. PER-HOLE OVERRIDES
==================================================

Allow limited per-Hole overrides:

custom subtitle
specific sponsor
rule emphasis
background variation.

Do not create independent visual design state unnecessarily.

==================================================
24. QR CODE
==================================================

Generated sign can contain QR code.

QR should link to canonical DGD Hole/Course page.

Player scans:

Hole map
Caddy info
current conditions
Layout/rules.

QR should not encode changing Course data directly.

==================================================
25. COURSE MAP SIGN
==================================================

Automatically generate a whole-Course map sign from the selected Layout.

Show:

Course name
Hole routes
Tee/Basket locations
Hole numbers
parking
practice basket
restroom
Tournament Central if Event overlay selected
walking routes where known.

==================================================
26. CADDY BOOK
==================================================

CADDY BOOK is generated from the SAME renderer.

User chooses:

Course
Layout

Optional:
Event Overlay.

Then generate:

Cover

Course overview

Hole 1

Hole 2

...

final information page if desired.

==================================================
27. CADDY BOOK DEFAULT
==================================================

A Course with a complete Layout should be able to produce a professional Caddy
Book with essentially:

ONE CLICK.

[ GENERATE CADDY BOOK ]

==================================================
28. CADDY BOOK HOLE PAGE
==================================================

Default page:

HOLE 7
PAR 4
438 FT

large illustrated Hole map

rules

description / caddy notes

optional:
elevation
Mando
OB
drop zone

sponsors.

Do not overload pages.

==================================================
29. EVENT CADDY BOOK
==================================================

Event Director can choose:

GENERATE EVENT CADDY BOOK.

It uses:

pinned Layout Version
+
Event Overlay.

Example:

temporary OB
temporary Hole
event DZ
special Mando

appear in Event book.

The permanent Course remains unchanged.

==================================================
30. PRINT OUTPUT
==================================================

Support:

PDF

print-safe bleed

crop marks

standard sign dimensions.

But hide technical print settings under:

PRINT SETTINGS.

Default should simply work.

==================================================
31. DIGITAL OUTPUT
==================================================

Same Hole Renderer can produce:

PNG
share card
digital caddy view.

Avoid maintaining separate graphics engines.

==================================================
32. PLAYER DESCRIPTION
==================================================

Every Layout Hole can have:

PLAYER NOTES / CADDY NOTES.

Use a simple rich-text field.

Example:

"OB right along water.
Mando left of marked tree.
Ideal landing zone is short-left of bend."

This appears in:

Caddy Book
digital Caddy
Player Guide.

==================================================
33. STRUCTURED RULES
==================================================

Do not rely entirely on prose.

Rules should also be structured objects:

OB
Hazard
Mando
DZ
Relief
Island.

Text descriptions are supplementary.

==================================================
34. SIGN RULE GENERATION
==================================================

Automatically generate concise sign language from structured rules.

Example:

OB:
Road and beyond right.

Mando:
Pass left of marked tree.

DZ:
Proceed to marked Drop Zone after missed Mando.

Allow human override.

==================================================
35. COURSE SPONSORS
==================================================

Keep Sponsors as a lightweight Course Studio module.

Sponsor:

Name
Logo
Category
URL
optional description.

==================================================
36. SPONSOR ASSIGNMENT
==================================================

Sponsors may be:

Course-wide

Hole-specific.

Example:

Hole 7 sponsored by:
XYZ Disc Golf.

==================================================
37. EVENT SPONSORS
==================================================

Course sponsors and Event sponsors remain separate canonical relationships.

Event Caddy Book can optionally include:

Event sponsors

Course sponsors

or both.

==================================================
38. PUBLIC PAGE
==================================================

Public Course page consumes the same data.

Tabs:

Overview
Map
Layouts
Conditions
Stats
Events.

No Course editing controls for normal players.

==================================================
39. LAYOUTS WORKSPACE
==================================================

Course Studio must retain dedicated Layout functionality.

Simplify it visually.

List:

MAIN
SHORT
LONG
BLUE
WHITE
etc.

Each Layout card:

18 Holes
Par 58
6,421 ft
Published / Draft.

==================================================
40. EDIT LAYOUT
==================================================

Layout editor shows Hole sequence.

Each row:

Position 1
Physical Hole 1
Blue Tee
Basket A
Par 3
342 ft.

Drag rows to reorder.

Select Tee/Basket using compact selectors.

==================================================
41. PHYSICAL HOLE VS LAYOUT HOLE
==================================================

Do not regress architecture.

Physical Hole geometry remains independent.

Layout only selects:

Hole
Tee
Basket
Par/rules override where legitimate.

==================================================
42. SPECIAL HOLES
==================================================

Support:

8A
15A
A
B
X

and arbitrary route order.

==================================================
43. EVENT-ONLY HOLES
==================================================

Temporary Event Hole belongs in Event Overlay.

Do not permanently modify Course unless promoted through appropriate Course
change process.

==================================================
44. COURSE STUDIO HOME
==================================================

When opening a Course Studio, show a useful home rather than editor overload.

Example:

ROGERS LAKEWOOD PARK

27 Holes

Main Layout
27/27 Tees
25/27 Baskets

MAP
25/27 Holes ready

LAYOUTS
3

SIGNAGE
24/27 ready

CADDY BOOK
Ready after 2 missing baskets

NEXT:
Map Hole 18 Basket.

[ CONTINUE COURSE ]

==================================================
45. NEXT ACTION
==================================================

Course Studio should always identify ONE useful next action.

Examples:

Place Hole 18 Basket

Review Hole 14 OB

Publish Main Layout

Generate signage.

Do not present 40 equal-priority controls.

==================================================
46. REMOVE DUPLICATED BUILDERS
==================================================

The following must all use the same editor/renderer:

New Course

Edit Course

Course Directory → Edit

Course Atlas → Open Course

Event Director → Edit permanent Course

Help Map Course.

No alternative editor/map implementation.

==================================================
47. MOBILE COURSE EDITOR
==================================================

Mobile is not the full desktop design workspace.

Primary mobile actions:

Walk Course

Map Missing Features

Verify Existing Map

Suggest Correction.

Desktop/tablet handles advanced drawing.

==================================================
48. MOBILE WALK COURSE
==================================================

Extremely simple:

HOLE 8

✓ Tee mapped

Basket missing

[ STAND AT BASKET ]

accuracy ±11 ft

[ SAVE BASKET ]

Next missing feature.

==================================================
49. COMMUNITY EDIT FLOW
==================================================

From public Course page:

[ Suggest Map Correction ]

Then:

Wrong Tee

Wrong Basket

Missing Tee/Basket

Wrong Hole

Course redesign.

Do not dump normal players into advanced Course Studio.

==================================================
50. PERMISSIONS
==================================================

Maintain existing smart Course permissions.

Viewer:
read.

Contributor:
proposal.

Trusted Contributor:
appropriate low-risk edits.

Course Steward:
Course maintenance.

Course Admin:
structural approval.

Global Admin:
platform override.

==================================================
51. PROTECT PUBLISHED ASSETS
==================================================

Moving a verified Tee/Basket can require approval.

Adding an obviously missing Draft Tee may have lower friction.

Backend enforces this.

==================================================
52. SAVE MODEL
==================================================

Map edits should autosave safely as Draft changes.

Top status:

Saved

Saving...

Offline

Conflict.

Do not require constant manual Save clicks.

==================================================
53. UNDO / REDO
==================================================

Visual editing must support:

Undo

Redo

for current draft editing session.

==================================================
54. HISTORY
==================================================

Major published changes retain history.

Who
What
When
Why.

==================================================
55. SIGNAGE DOES NOT OWN COURSE DATA
==================================================

Critical:

Signage must never store its own independent:

Par
Distance
OB
Tee coordinate
Basket coordinate.

It renders Course/Layout data.

==================================================
56. CADDY BOOK DOES NOT OWN COURSE DATA
==================================================

Same.

It may own:

cover configuration

branding

optional editorial pages.

Hole facts remain canonical.

==================================================
57. DISTANCE RULE
==================================================

Display source/official distance when legitimately known.

If only Tee/Basket coordinates are known:

derive:

MAP DISTANCE.

Do not silently relabel it Official Distance.

==================================================
58. UNITS
==================================================

DGD primary U.S. presentation:

feet.

Optional metric display/export.

Avoid awkward duplicated distance like:

68 M
225 ft

unless user explicitly chooses dual units.

==================================================
59. TEE SIGN INFORMATION HIERARCHY
==================================================

Tee signs should make the following instantly readable:

1. Hole
2. Par
3. Distance
4. Tee/Basket route
5. OB/Mando/DZ
6. Course identity

Everything else secondary.

==================================================
60. DON'T OVERLABEL OB
==================================================

The current reference sign demonstrates useful visual boundary labeling, but
DGD should avoid repeating "OB" excessively.

For long boundaries:

label at logical intervals.

Keep map readable.

==================================================
61. RULE SYMBOL LIBRARY
==================================================

Use a shared DGD vector symbol library for:

Tee
Basket
Mando
Double Mando
Drop Zone
OB
Hazard
Island
Parking
Restroom
Practice Basket.

Same visual language everywhere.

==================================================
62. PRINT RENDERER QUALITY
==================================================

Generated signs must be true high-resolution/vector output.

Do not generate them from a browser screenshot.

Text and lines must remain crisp at print scale.

==================================================
63. MAP ROTATION QUALITY
==================================================

Text labels and icons must remain upright after Hole rotation.

Only geography/path geometry rotates.

Labels render in final screen orientation.

==================================================
64. MAP CLIPPING
==================================================

Automatically prevent:

Tee
Basket
Mando
DZ
important OB labels

from being clipped by the print crop.

==================================================
65. DEFAULT SIGN DESIGN
==================================================

Create one excellent DGD default template.

Do not start with 30 themes.

Initial template should feel:

modern
outdoors
professional
easy to print
high contrast.

Later template library can be added.

==================================================
66. DGD BRANDING
==================================================

Use DGD visual identity.

Do not mimic the exact green/orange typography or visual branding from the
reference product.

The UI workflow may be similar while DGD remains visually distinct.

==================================================
67. DARK APP / LIGHT PRINT
==================================================

Course Studio may remain consistent with DGD's dark product UI.

Print output does not have to inherit app theme.

Tee sign/Caddy Book renderer uses dedicated print styling.

==================================================
68. SIGNAGE STATUS
==================================================

Each Hole:

READY

NEEDS MAP

NEEDS PAR

NEEDS REVIEW.

Do not simply say:

NOT DESIGNED

when the artwork can be automatically generated.

==================================================
69. AUTOMATIC SIGN READINESS
==================================================

If sufficient data exists:

sign is automatically ready.

The user does not need to manually "design" every Hole.

The button becomes:

PREVIEW / CUSTOMIZE.

==================================================
70. CADDY BOOK READINESS
==================================================

Likewise:

READY

PARTIAL

NEEDS DATA.

Example:

25 of 27 Hole pages ready.

==================================================
71. PREVIEW MODE
==================================================

Provide real visual preview.

Desktop:

page on left

settings on right.

But settings should remain concise.

==================================================
72. COURSE-WIDE CHANGES
==================================================

Course logo/color/sponsor strip changes update:

all signs

Caddy Book

Course map sign.

==================================================
73. HOLE-SPECIFIC PREVIEW
==================================================

Map editor action:

[ PREVIEW TEE SIGN ]

without leaving current Hole.

==================================================
74. BIDIRECTIONAL WORKFLOW
==================================================

From Sign preview:

[ EDIT HOLE MAP ]

returns directly to selected Hole.

From Map Editor:

[ PREVIEW SIGN ]

same Hole.

No navigation hunting.

==================================================
75. CADDY BOOK → HOLE
==================================================

If Caddy preview finds an error on Hole 12:

[ EDIT HOLE 12 ]

opens map editor directly.

==================================================
76. COURSE MAP SIGN → COURSE MAP
==================================================

Same contextual linking.

==================================================
77. DATA INGESTION INTEGRATION
==================================================

Course Atlas automatic ingestion feeds this exact Course Studio.

Imported:

Tees
Baskets
Layouts
Par
distance

appear immediately as canonical Draft/source-backed data.

No separate ingestion editor.

==================================================
78. PARTIAL IMPORT
==================================================

If Atlas finds only:

14 Tees
13 Baskets

Course Studio should still render those immediately.

User can finish remaining features.

==================================================
79. SOURCE CANDIDATES
==================================================

Advanced map layer:

Source candidates.

Normal default editor:

approved/current Course geometry.

Do not clutter everyday Course editing.

==================================================
80. COURSE COMPLETION
==================================================

Do not require full completion before creating signs.

If Hole 1 is ready:

Hole 1 tee sign can generate.

Even if Hole 18 is unfinished.

==================================================
81. EVENT INTEGRATION
==================================================

Event Director should expose:

Course & Layout

then actions:

OPEN COURSE STUDIO

GENERATE EVENT CADDY BOOK

GENERATE EVENT TEE SIGNS.

Use pinned Layout Version + Event Overlay.

==================================================
82. NO EVENT DATA DUPLICATION
==================================================

Permanent rules remain Course/Layout-owned.

Temporary Tournament rules remain Event Overlay-owned.

Renderer combines them.

==================================================
83. COURSE CONDITIONS
==================================================

Temporary Course Conditions do not automatically appear on permanent signs.

Digital Caddy may show current conditions.

Event guide may optionally include relevant active conditions.

==================================================
84. PERFORMANCE
==================================================

Opening one Course loads:

that Course's geometry.

Not nationwide geometry.

Opening one Hole loads/render only relevant nearby details where practical.

==================================================
85. MIGRATION SAFETY
==================================================

Do not destroy current Course geometry.

Audit existing:

Course features
holes
tees
basket positions
layouts
rules
sign configuration
Caddy Book configuration.

Map them into unified ownership.

==================================================
86. REMOVE DUPLICATE FACT OWNERS
==================================================

Audit every place storing:

Par
Hole distance
Hole rules
description
Tee/Basket coordinates.

For each fact establish ONE owner.

Other features reference/render it.

==================================================
87. IMPLEMENTATION ORDER
==================================================

PHASE A — UX SHELL

1. Consolidate Course Studio routes.
2. Build simplified Course navigation.
3. Build Course Studio home.
4. Simplify Map Editor shell.
5. Add contextual inspector.
6. Add compact tool palette.

PHASE B — CANONICAL MAP

7. Connect physical Holes.
8. Connect multiple Tees.
9. Connect multiple Basket Positions.
10. Connect Layout selection.
11. Simplify flight-path editing.
12. Ensure permanent structured rules are canonical.

PHASE C — RENDERER

13. Build shared Hole vector renderer.
14. Add automatic Tee→Basket orientation.
15. Add automatic crop/padding.
16. Add woods/water/terrain.
17. Add OB/Mando/DZ/Hazard rendering.
18. Add readable labeling.
19. Add print-safe vector output.

PHASE D — SIGNAGE

20. Build automatic default Hole sign.
21. Build live preview.
22. Add Course-wide branding.
23. Add QR code.
24. Add Sponsors.
25. Build Course map sign.
26. Add PDF export.

PHASE E — CADDY BOOK

27. Build cover.
28. Build Course overview.
29. Generate one page per Layout Hole.
30. Add Player Notes.
31. Add Sponsor rendering.
32. Build PDF preview/export.

PHASE F — EVENT

33. Add Event Overlay rendering.
34. Generate Event Caddy Book.
35. Generate Event signage.
36. Preserve pinned Layout Version.

PHASE G — MOBILE

37. Build Walk Course.
38. Build Map Missing.
39. Build Verify Map.
40. Build public Suggest Correction.

PHASE H — CLEANUP

41. Remove old duplicate builder/editor routes.
42. Redirect old links into unified Course Studio.
43. Audit duplicate data ownership.
44. Regression-test existing Courses.
45. Verify permissions/RLS.
46. Run database/security advisors.
47. Fix remaining issues.

==================================================
88. ACCEPTANCE TEST — SIMPLE HOLE
==================================================

Create/map:

Hole 1

Tee
Basket
Flight path
OB
Drop Zone

Expected:

Tee sign generates automatically.

No separate sign-map drawing.

==================================================
89. ACCEPTANCE — MAP EDIT
==================================================

Move Basket.

Expected:

Map distance updates.

Tee Sign updates.

Caddy Book updates.

Digital Caddy updates.

ONE geometry change.

==================================================
90. ACCEPTANCE — MULTIPLE TEES
==================================================

Hole has:

White
Blue.

Two Layouts select different Tees.

Expected:

each Layout's sign/book shows correct Tee and distance.

==================================================
91. ACCEPTANCE — MULTIPLE BASKETS
==================================================

Basket A/B.

Expected:

Layout-specific render.

==================================================
92. ACCEPTANCE — EVENT OVERLAY
==================================================

Tournament adds temporary OB and DZ.

Expected:

Event Caddy Book includes them.

Permanent Course sign remains unchanged.

==================================================
93. ACCEPTANCE — PARTIAL COURSE
==================================================

18 Hole Course.

Only 12 mapped.

Expected:

12 signs available.

Caddy Book can preview 12 ready pages and clearly identify 6 incomplete.

No total-course blocker.

==================================================
94. ACCEPTANCE — UNKNOWN PAR
==================================================

Tee/Basket mapped.

Par unknown.

Expected:

map renders.

Sign status indicates Par needed.

No invented Par 3.

==================================================
95. FINAL RESULT
==================================================

The intended user experience should be approximately:

COURSE
"Here are your Holes and Layouts."

MAP
"Click Tee, click Basket, draw rules."

SIGNAGE
"Your signs are already generated."

CADDY BOOK
"Your book is already generated."

The user should be improving the Course data—

not rebuilding the same Course four different times.