MASTER PHASE — DGD LAYOUT STUDIO 2.0
ONE COURSE → MANY SIMPLE LAYOUT RECIPES

The current Layout Builder is too complicated and is creating a false
separation between:

THE PHYSICAL COURSE

and

THE LAYOUTS PLAYED ON THAT COURSE.

Rebuild the Layout workflow around one simple principle:

THE COURSE OWNS ALL PHYSICAL ASSETS.

A LAYOUT ONLY SELECTS WHICH OF THOSE ASSETS ARE PLAYED.

Do NOT build Tees, Baskets, Holes, or physical geometry inside Layout Studio.

==================================================
1. CANONICAL MODEL
==================================================

A Course owns:

COURSE

PHYSICAL HOLES

TEE PADS

BASKET POSITIONS

FLIGHT PATHS

PERMANENT RULES

TERRAIN

AMENITIES.

A Layout is only a recipe.

Conceptually:

LAYOUT

→ SLOT 1
   physical Hole 1
   Blue Tee
   Basket A
   Par 3

→ SLOT 2
   physical Hole 2
   Blue Tee
   Basket B
   Par 3

→ SLOT 3
   physical Hole 3
   White Tee
   Basket A
   Par 4

etc.

==================================================
2. DO NOT DUPLICATE PHYSICAL ASSETS
==================================================

Layout Studio must NEVER create another copy of:

Tee coordinates

Basket coordinates

Hole geometry

OB geometry

Mando geometry

terrain

Course features.

It references canonical IDs.

Examples:

physical_hole_id

tee_id

basket_position_id

flight_path_id where applicable.

==================================================
3. FIX CURRENT ARCHITECTURE
==================================================

The screenshots currently show this invalid state:

Course:
27 / 27 Tees mapped
27 / 27 Baskets mapped

but Layout:

No tee
No basket
No distance.

That should not happen when the physical Hole assets already exist.

Audit why Layout rows are disconnected from the canonical Course assets.

Repair the data relationship rather than simply changing the labels.

==================================================
4. LAYOUT STUDIO PURPOSE
==================================================

Layout Studio should answer only:

WHICH HOLES ARE PLAYED?

IN WHAT ORDER?

WHICH TEE IS USED ON EACH HOLE?

WHICH BASKET POSITION IS USED?

WHAT PAR APPLIES?

THAT IS THE PRIMARY WORKFLOW.

Everything else should be secondary.

==================================================
5. ONE LAYOUT ENTRY POINT
==================================================

There should be one editing location:

COURSE STUDIO
→ LAYOUTS.

Public Course page may show layouts.

Clicking Edit:

opens the same Layout Studio.

Do not maintain:

one Layout page

another Layout Builder

another Course-layout table

with different behavior.

==================================================
6. NEW LAYOUT BUTTON
==================================================

Primary action:

+ NEW LAYOUT

Then show a very simple choice:

START FROM:

[ Copy Existing Layout ]

[ All Course Holes ]

[ Build Custom Route ]

Do not immediately show a 24-row configuration table.

==================================================
7. COPY EXISTING LAYOUT — PREFERRED
==================================================

This should be the easiest way to create most layouts.

Example:

Create:
BLUE TEES

From:
MAIN 27

DGD copies:

Hole sequence

display labels

selected Basket positions

Par

rules configuration

but continues referencing the SAME physical Course assets.

Then ask:

TEE CONFIGURATION

Use:
[ Blue Tee on every Hole where available ]

Done.

User only fixes exceptions.

==================================================
8. COPY DOES NOT COPY GEOMETRY
==================================================

Copying Main 27 to Blue Tees must NOT duplicate:

27 physical Holes

27 Basket coordinates

27 Course maps.

It copies layout configuration/reference choices only.

==================================================
9. CREATE FROM ALL COURSE HOLES
==================================================

If selecting:

ALL COURSE HOLES

automatically populate the existing canonical physical Holes in Course order.

Do not generate anonymous rows:

1
2
3
...

that have no connection to physical Holes.

Each row already knows:

physical Hole
available Tees
available Baskets.

==================================================
10. CUSTOM ROUTE
==================================================

Custom Route supports:

9-hole

18-hole

21-hole

24-hole

27-hole

Front 9

Back 9

mixed Event layouts

special Hole orders.

Show a list/map of physical Holes.

User selects:

Add Hole 1
Add Hole 4
Add Hole 8
Add Hole X

and rearranges them.

==================================================
11. ROUTE POSITION != PHYSICAL HOLE NUMBER
==================================================

Maintain this distinction.

Example:

ROUTE POSITION 8

could use:

PHYSICAL HOLE X

and display:

8A

for the Event.

Store separately:

route_position

physical_hole_id

display_label.

Do not rename the physical Hole merely because a Layout labels it differently.

==================================================
12. SUPPORT SPECIAL HOLES
==================================================

Physical Hole labels can include:

1
2
3

X
Y
Z

8A
15A

A
B.

Never assume Hole identifier must be an integer.

==================================================
13. LAYOUT BUILDER PRIMARY SCREEN
==================================================

Replace the current spreadsheet-heavy interface with a clean route list.

Example:

BLUE TEES
24 Holes

------------------------------------------------

1     HOLE 1

TEE
Blue ▼

BASKET
A ▼

PAR
3

260 FT

------------------------------------------------

2     HOLE 2

TEE
Blue ▼

BASKET
A ▼

PAR
3

315 FT

------------------------------------------------

Each physical Hole is a compact card/row.

No giant warning block containing 48 repeated errors.

==================================================
14. INLINE WARNINGS
==================================================

If a specific Hole has a problem:

HOLE 7

⚠ Blue Tee unavailable.

[ Choose another Tee ]

[ + Add Blue Tee ]

Do not repeat giant warning messages at the top:

Hole 1 has no tee
Hole 1 has no basket
Hole 2 has no tee
Hole 2 has no basket
...

==================================================
15. AVAILABLE TEE SELECTOR
==================================================

For every physical Hole:

TEE dropdown contains ONLY canonical Tees belonging to that Hole.

Example:

Main
Short
Blue
Gold
Long.

Selecting Blue:

stores tee_id.

Not:

"Blue"

as unconnected text.

==================================================
16. AVAILABLE BASKET SELECTOR
==================================================

Basket dropdown contains canonical Basket Positions for that physical Hole.

Example:

A
B
C
Short
Long.

Selecting Basket A:

stores basket_position_id.

==================================================
17. SINGLE-ASSET AUTO-SELECTION
==================================================

If Hole has only:

1 Tee

and:

1 Basket

automatically select them.

Do not force the user to make meaningless selections 18 times.

==================================================
18. SMART BULK ASSIGNMENT
==================================================

Add extremely useful bulk controls.

At top:

TEES
[ Main ▼ ]

BASKETS
[ A ▼ ]

[ APPLY TO ALL MATCHING HOLES ]

Then user edits exceptions.

Example:

BLUE TEES

Select:

TEE:
Blue

Apply to all.

DGD assigns Blue Tee wherever a Blue Tee exists.

==================================================
19. DO NOT OVERWRITE EXCEPTIONS SILENTLY
==================================================

If user has already customized Hole 14:

Main Tee

and later presses:

Apply Blue Tee to all

show:

23 Holes will change.
1 custom selection exists.

[Preserve Exceptions]
[Replace Everything].

==================================================
20. SMART TEE MATCHING
==================================================

When creating:

BLUE TEES

DGD may suggest:

"We found a Blue Tee on 22 of 24 Holes."

[Use Blue Tees]

Then:

22 linked automatically.

2 show:

NEEDS SELECTION.

Do not guess missing physical assets.

==================================================
21. SMART BASKET MATCHING
==================================================

Same concept.

Example:

MAIN 27

A Basket exists:
25/27.

Use Basket A where available.

2 require review.

==================================================
22. ADD MISSING TEE FROM LAYOUT STUDIO
==================================================

If required physical Tee does not exist:

[ + ADD TEE ]

Do NOT create it inside Layout table.

Instead:

open Course Studio
→ selected physical Hole
→ Tee tool

with context:

ADDING TEE FOR:
Hole 7
Blue Tees Layout.

User places/configures Tee.

Save.

Then automatically return to Layout Studio.

New Tee appears selected.

==================================================
23. ADD MISSING BASKET
==================================================

Same workflow:

[ + ADD BASKET POSITION ]

opens:

Course Studio
→ Hole
→ Basket tool.

After creation:

return to Layout Studio

and select new Basket Position.

==================================================
24. RETURN CONTEXT
==================================================

Preserve:

layout_id
layout slot
scroll position
selection

when temporarily opening Course Studio.

The user should not lose their Layout work.

==================================================
25. PHYSICAL ASSET WARNING
==================================================

Clearly explain:

"Adding a Tee changes the physical Course and makes it available to every
Layout."

This prevents users thinking they are adding a Layout-only Tee.

==================================================
26. EVENT-ONLY PHYSICAL CONFIGURATION
==================================================

Do NOT create permanent Course assets for temporary tournament geometry unless
the Course truly gained a permanent Tee/Basket.

Temporary Event-specific routing belongs in:

EVENT OVERLAY.

Example:

temporary tee mat

temporary basket

temporary Hole

Event OB.

==================================================
27. PAR
==================================================

Par should never default silently to 3 merely because data is missing.

For each Layout slot:

use verified/default configuration if legitimate.

Otherwise:

PAR
—

NEEDS PAR.

Allow an explicit Layout-specific Par where appropriate.

==================================================
28. PAR OWNERSHIP
==================================================

A physical Hole can have different Par depending on:

Tee
Basket
Layout
competition setup.

Therefore final scoring Par belongs to the Layout slot/version.

However it may inherit a suggested/default Par from Course data.

==================================================
29. DISTANCE
==================================================

Distance should calculate automatically from:

selected Tee

→

selected Basket Position

using canonical coordinates.

If official/manual verified distance exists for that pairing:

use it according to existing distance-source rules.

User should not normally type distance.

==================================================
30. DISTANCE UPDATE
==================================================

Change:

Blue Tee
→ Main Tee.

Expected:

distance changes automatically.

Change:

Basket A
→ Basket B.

Expected:

distance changes automatically.

==================================================
31. FLIGHT PATH
==================================================

Resolve the appropriate canonical flight path for:

physical Hole
+
selected Tee
+
selected Basket

where available.

If no specific path exists:

use appropriate default/direct path according to Course renderer rules.

Do not duplicate path geometry into the Layout.

==================================================
32. LAYOUT RULES
==================================================

Permanent Course rules remain canonical.

Layout may select/apply rules relevant to the chosen:

Tee
Basket
Hole.

Temporary Event rules remain Event Overlay.

==================================================
33. SIMPLE CREATION WIZARD
==================================================

New Layout should follow approximately:

STEP 1
Name & Starting Point

STEP 2
Hole Route

STEP 3
Tees & Baskets

STEP 4
Review & Publish.

Not a giant all-purpose form.

==================================================
34. STEP 1 — NAME
==================================================

Ask:

LAYOUT NAME

Example:

Blue Tees

START FROM

Main 27 ▼

[Continue].

That may be enough for many new layouts.

==================================================
35. STEP 2 — HOLE ROUTE
==================================================

Show route visually:

1
2
3
4
5
...

Drag to reorder.

+ Add Hole

Remove from Layout.

This does NOT delete physical Hole.

==================================================
36. DRAG REORDER
==================================================

Support drag-and-drop on desktop.

Mobile:

press/hold or move up/down controls.

Route numbers update.

Physical Hole IDs remain unchanged.

==================================================
37. STEP 3 — TEES & BASKETS
==================================================

First show bulk choices:

DEFAULT TEE
Blue

DEFAULT BASKET
A.

Then show only exceptions/problems.

Example:

22 Holes matched.

NEEDS ATTENTION

Hole 7
No Blue Tee.

Hole 14
No Basket A.

This is far better than making the user edit 24 rows manually.

==================================================
38. STEP 4 — REVIEW
==================================================

Show:

BLUE TEES

24 Holes
Par 74
8,240 ft

24/24 Tee selections
24/24 Basket selections
24/24 Par
24/24 mapped

[Publish Layout].

==================================================
39. PUBLISH REQUIREMENTS
==================================================

New Layout cannot publish unless every included scoring slot has:

physical_hole_id

tee_id

basket_position_id

Par.

Unless a special supported Event/format rule explicitly allows otherwise.

Do not create fake values to make validation pass.

==================================================
40. DRAFTS MAY BE INCOMPLETE
==================================================

Draft layout may contain missing assignments.

Show:

DRAFT
22/24 ready.

That is fine.

Do not call it:

SCORING READY.

==================================================
41. READY STATES
==================================================

SCORING READY requires:

all included Holes
+
valid Par
+
Tee
+
Basket.

MAP READY requires:

selected Tee and Basket geometry sufficient for mapping.

Do not show those badges if references are missing.

==================================================
42. PUBLISHED LEGACY BROKEN LAYOUTS
==================================================

Do NOT delete historical published Layouts automatically.

For existing layouts with missing references:

show:

PUBLISHED · NEEDS REPAIR

instead of falsely:

SCORING READY.

Create repair workflow.

==================================================
43. CURRENT ROGERS LAKEWOOD REPAIR
==================================================

Use Rogers Lakewood as a mandatory migration/regression fixture.

Current canonical Course appears to have:

27 mapped Tees
27 mapped Baskets

and multiple existing Layouts.

Current Blue Tees Layout shows:

24 Hole rows
No Tee
No Basket

despite Course assets existing.

Repair this relationship.

==================================================
44. HIGH-CONFIDENCE BACKFILL
==================================================

For legacy Layout slots:

match physical Hole using:

exact canonical Hole ID/reference where available

then:

exact Hole label

then safe source linkage.

For Tee:

exact tee_id if stored

else exact unique Tee label/color/name match.

For Basket:

exact basket_position_id if stored

else exact unique Basket label match.

Only auto-link when confidence is high.

==================================================
45. DO NOT GUESS LEGACY LINKS
==================================================

If multiple possible Blue Tees exist:

do not guess.

Mark:

NEEDS REVIEW.

==================================================
46. BLUE TEES REGRESSION
==================================================

If Rogers Lakewood physical Holes 1–24 contain uniquely identifiable Blue Tees:

Blue Tees Layout should automatically reference them.

If some Holes do not contain Blue Tees:

show only those Holes as incomplete.

Do NOT display:

No tee

on all 24 when legitimate physical references exist.

==================================================
47. OTHER HOLES PANEL
==================================================

The current:

"Other holes on this course"

section appears cluttered and includes many chips with little context.

Replace with:

+ ADD HOLE

opening a searchable Course Hole picker.

Example:

AVAILABLE COURSE HOLES

Hole X
Hole Y
Hole Z
Hole 25
Hole 26
Hole 27.

Do not render dozens of random chips permanently.

==================================================
48. PHYSICAL HOLE PICKER
==================================================

Each option shows:

Hole label

available Tees

available Baskets

mapped status.

Example:

HOLE X

Tees:
Main, Long

Baskets:
A

[Add].

==================================================
49. DUPLICATE PHYSICAL HOLE PROTECTION
==================================================

By default a physical Hole may appear once in a Layout.

If user intentionally wants repeated play of one physical Hole:

require explicit:

ALLOW REPEATED HOLE

and create another layout slot referencing the same physical Hole.

Do not accidentally create duplicates.

==================================================
50. REMOVE FROM LAYOUT != DELETE HOLE
==================================================

Every destructive action must distinguish:

REMOVE FROM LAYOUT

vs

DELETE PHYSICAL HOLE FROM COURSE.

Layout Studio should normally only offer:

Remove from Layout.

Physical deletion belongs in Course Studio with stronger permissions/warnings.

==================================================
51. COURSE STUDIO RELATIONSHIP
==================================================

Course Studio:

builds physical truth.

Layout Studio:

composes that truth.

Public Course page:

displays it.

Event Manager:

selects a published Layout Version.

No parallel datasets.

==================================================
52. COURSE PAGE LAYOUT LIST
==================================================

Course public/admin overview may show:

MAIN 27
27 Holes · Par 87 · 8,855 ft

BLUE TEES
24 Holes · Par 77 · 8,030 ft

etc.

Actions for authorized users:

Open
Copy
Edit.

All Edit actions open same Layout Studio.

==================================================
53. DEFAULT LAYOUT
==================================================

One Course may optionally designate a:

DEFAULT LAYOUT.

That does not mean other layouts are inactive.

Do not confuse:

Default

with:

Published.

==================================================
54. LAYOUT STATUS
==================================================

Support:

DRAFT

PUBLISHED

SEASONAL

RETIRED

ARCHIVED.

Multiple published layouts may coexist.

==================================================
55. LAYOUT VERSIONING
==================================================

Publishing creates an immutable:

LAYOUT VERSION.

A version records the exact recipe used at that time.

Include:

route order

physical_hole_id

tee_id

basket_position_id

Par

distance/source where required

rule references

asset/version references needed for historical fidelity.

==================================================
56. PHYSICAL ASSET VERSIONS
==================================================

If a Tee/Basket is later moved:

current Course and future Layout publication may use the new asset state.

Historical Layout Version/Event snapshot must remain reproducible.

Do not silently rewrite past Events.

==================================================
57. EVENT SELECTION
==================================================

Event Manager selects:

Course
→ Layout
→ Layout Version.

Example:

Rogers Lakewood Park

Skip Derby + X,Y,Z
v3.

Do not copy Course geometry into Event.

==================================================
58. CURRENT BASKET OPTION
==================================================

For casual/current Course layouts, optionally support:

Basket:
CURRENT POSITION

when appropriate.

This means the live Course layout follows official current Basket placement.

But for:

published Event Round

resolve/pin the actual Basket Position used.

Historical Event truth cannot remain dynamically "current."

==================================================
59. COMPARE LAYOUTS
==================================================

Keep Compare Layouts, but make it useful.

Show differences:

Hole count

route

Tee changes

Basket changes

Par changes

distance changes.

Example:

MAIN 27 vs BLUE TEES

22 same Holes

5 omitted

18 different Tees

2 different Basket positions.

==================================================
60. VISUAL LAYOUT PREVIEW
==================================================

Add optional compact Course map preview.

Selecting a Layout shows:

included Holes

route order

selected Tees

selected Baskets.

Useful but not required to perform basic editing.

==================================================
61. MOBILE LAYOUT EDITING
==================================================

Mobile must support:

select Layout

copy

add/remove Hole

reorder

choose Tee

choose Basket

set Par

publish.

Do not show desktop spreadsheet columns squeezed onto phone.

==================================================
62. DESKTOP LAYOUT EDITING
==================================================

Desktop may use a compact table/list.

But avoid wide administrative spreadsheet feel.

Focus on:

Hole
Tee
Basket
Par
Distance
Status.

==================================================
63. QUICK VARIANT CREATION
==================================================

Provide shortcuts.

Example:

CREATE TEE VARIANT

From:
Main 27

Use Tee:
Blue.

[Create]

DGD does everything possible automatically.

==================================================
64. QUICK BASKET VARIANT
==================================================

Example:

CREATE BASKET VARIANT

From:
Main 27

Use:
B Positions.

DGD assigns B wherever available.

Only exceptions need attention.

==================================================
65. HYBRID VARIANT
==================================================

User can then customize exceptions.

Example:

Holes 1–12:
Blue Tee.

13–18:
Main Tee.

19–24:
Long Tee.

Still references canonical assets.

==================================================
66. NO AUTO-GENERATED FAKE LAYOUTS
==================================================

Course Atlas/ingestion may create a starter Layout only from legitimate source
information.

Do not invent:

Main layout
Par 3
A Basket

for every Course merely to make it scoreable.

Unknown remains unknown.

==================================================
67. LAYOUT SOURCE PROVENANCE
==================================================

Preserve where Layout facts came from:

PDGA
UDisc
Disc Golf Scene
DGD
Course Steward
imported source.

Canonical DGD Layout may reconcile several sources.

==================================================
68. PERMISSIONS
==================================================

Only authorized Course roles may publish/edit official Course layouts.

Normal users can:

view

and where allowed:

suggest corrections.

If user needs a temporary tournament variant:

use Event Overlay/event layout workflow according to permissions.

==================================================
69. RLS / BACKEND AUTHORIZATION
==================================================

If schema/policies are changed:

use server-authoritative Course-role/capability checks.

Do not rely on frontend buttons.

Do not use `TO authenticated` alone as authorization.

UPDATE policies require appropriate:

SELECT

USING

WITH CHECK.

Do not use editable user metadata as Course authorization.

==================================================
70. DO NOT CREATE PARALLEL LAYOUT TABLES
==================================================

Audit existing database first.

Reuse/migrate toward the canonical model.

Do not create:

layout_v2

layout_builder_new

temporary new hole tables

unless absolutely necessary.

Migrate and retire obsolete structures cleanly.

==================================================
71. DATA REPAIR REPORT
==================================================

After migration return:

Courses inspected

Layouts inspected

Layout slots inspected

Slots linked automatically

Slots needing review

Duplicate physical assets found

Fake/unlinked layout Hole rows removed

Broken published layouts

Published layouts repaired

Layouts still incomplete.

==================================================
72. ROGERS LAKEWOOD ACCEPTANCE TEST
==================================================

Open:

Rogers Lakewood Park
→ Layouts.

Expected:

Main 27

Blue Tees

Skip Derby + X,Y,Z

Skip X,Y,Z

all show correct canonical Hole relationships.

==================================================
73. BLUE TEES ACCEPTANCE TEST
==================================================

Open:

Blue Tees.

Expected:

24 route slots.

Every valid slot shows:

physical Hole

selected physical Tee

selected Basket

Par

calculated/verified distance.

Do not show 48 false warnings.

==================================================
74. CREATE BLUE VARIANT TEST
==================================================

Starting from Main 27:

Copy.

Name:

Blue Tees Test.

Choose:

Use Blue Tee everywhere available.

Expected:

all unique Blue Tees link automatically.

Only Holes without one require manual action.

==================================================
75. MISSING TEE TEST
==================================================

Hole 14 has no Blue Tee.

Expected:

Hole 14
⚠ Blue Tee unavailable.

[Choose Tee]
[+ Add Tee].

Press Add Tee.

Course Studio opens directly to Hole 14.

Create Tee.

Return.

New Tee automatically becomes selectable/selected.

==================================================
76. MISSING BASKET TEST
==================================================

Same behavior for Basket Position.

No duplicate physical Basket may be created accidentally.

==================================================
77. ROUTE TEST
==================================================

Build:

1
2
3
4
X
5
6
Y
7
8
Z.

Expected:

each route position references correct physical Hole.

Display labels may be overridden independently.

==================================================
78. COPY INTEGRITY TEST
==================================================

Copy Main 27.

Move a Tee selection in copied Layout.

Expected:

source Layout does NOT change.

Physical Tee coordinate remains shared.

==================================================
79. PHYSICAL ASSET EDIT TEST
==================================================

Authorized user corrects physical Blue Tee 7 location.

Expected:

current Layout configurations referencing Blue Tee 7 point to that canonical
asset.

New published versions use corrected data.

Historical pinned Event/Layout versions remain historically reproducible.

==================================================
80. UI SUCCESS CRITERIA
==================================================

A user unfamiliar with DGD should be able to create a normal alternate Layout
in under one minute if all physical assets already exist.

Example:

Main 18
→ copy
→ name Blue Tees
→ choose Blue Tee
→ review 2 exceptions
→ publish.

No Course remapping.

No duplicate geometry.

No 18-row manual Tee selection when everything matches.

==================================================
81. FINAL PRODUCT RULE
==================================================

COURSE STUDIO ANSWERS:

WHAT PHYSICALLY EXISTS HERE?

LAYOUT STUDIO ANSWERS:

WHICH OF THOSE THINGS ARE WE PLAYING?

EVENT MANAGER ANSWERS:

WHICH PUBLISHED VERSION ARE WE USING TODAY?

KEEP THOSE RESPONSIBILITIES SEPARATE.

BUILD THE COURSE ONCE.

THEN BUILD EVERY LAYOUT BY SELECTING:

HOLE
TEE
BASKET
PAR

AND NOTHING MORE UNLESS THE USER ACTUALLY NEEDS AN ADVANCED OPTION.