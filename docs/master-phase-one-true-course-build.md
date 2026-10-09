MASTER PHASE — ONE TRUE COURSE BUILD
ELIMINATE DUPLICATE COURSE EDITORS / DUPLICATE MAP TRUTH

CRITICAL ARCHITECTURE FIX

The same DGD Course is currently rendering differently depending on how the
Course Editor is opened.

Example:

ROGERS LAKEWOOD PARK

Opening Course Studio / Map Builder shows:

- Course unconfirmed
- 24/27 mapped
- straight default fairways
- incomplete-looking course state

Opening the Course through the existing Course Editor shows:

- 27/27 mapped
- completed physical Course
- proper fairway shapes
- water
- OB
- terrain/features
- correct mapped geometry.

THIS MUST NOT BE POSSIBLE.

There must be exactly:

ONE COURSE

ONE PHYSICAL BUILD

ONE COURSE STUDIO

ONE MAP DATASET

ONE PUBLISHED COURSE STATE.

Different entry points may open different tabs/modes of that same editor,
but they must NEVER load different Course geometry or different Course build
records.

==================================================
1. CORE PRODUCT RULE
==================================================

A COURSE HAS ONE TRUE PHYSICAL BUILD.

That build contains everything that physically exists:

Course boundary

physical Hole groupings

all Tee Pads

all Basket Positions

fairway / playable-route geometry

woods

water

roads

paths

fences

buildings

trees / important obstacles

amenities

parking

restrooms

Course entrance

permanent Course rules/features.

Every other Course product references this canonical build.

==================================================
2. LAYOUTS DO NOT BUILD COURSES
==================================================

A Layout does NOT own:

another Course map

another set of Tee Pads

another set of Basket Positions

another water polygon

another fence

another OB map

another fairway map.

A Layout is simply:

LAYOUT SLOT 1
Tee ID
→ Basket ID
Par

LAYOUT SLOT 2
Tee ID
→ Basket ID
Par

etc.

Optional:

Layout-specific route override
Layout-specific rules override.

Nothing more unless genuinely necessary.

==================================================
3. COURSE STUDIO AND EDIT COURSE MUST MERGE
==================================================

Audit the current routes/components behind:

COURSE STUDIO

and

EDIT COURSE.

They currently appear to load different map/build state.

Merge them.

There should be one canonical route/component conceptually like:

CourseStudio(course_id)

with modes:

Overview

Map

Layouts

Conditions

Signage

Caddy Book

Sponsors

Public Page.

Both:

[Edit]

and:

[Course Studio]

must open the SAME CourseStudio.

Ideally remove one redundant button after migration.

==================================================
4. SAME COURSE ID
==================================================

Verify both editor entry points use the exact same:

course_id.

Do not allow:

one editor to open canonical Course record

while another opens:

layout Course copy
import record
draft Course clone
legacy builder Course
source listing record.

==================================================
5. SAME ACTIVE COURSE VERSION
==================================================

Both entry points must resolve the same:

current Course version

and the same physical assets.

If Course versioning exists:

current editor always loads:

current editable/published Course version according to authorization.

Do not let one editor resolve an obsolete version.

==================================================
6. AUDIT WHY THE SCREENSHOTS DIFFER
==================================================

Explicitly investigate the current Rogers Lakewood case.

Determine whether the difference is caused by:

A. two Course records

B. two map/build tables

C. stale Course version

D. layout-specific cloned geometry

E. old Course Builder dataset

F. default straight-line flight paths

G. one editor querying by layout_id instead of course_id

H. incomplete migrated physical assets

I. duplicate Hole records

J. two independent completion calculations.

Return the exact root cause.

Then fix the architecture, not only the UI.

==================================================
7. COURSE BUILD COMPLETENESS != LAYOUT READINESS
==================================================

This is extremely important.

The current top bar appears to change Course map completeness depending on
which Layout is involved.

Do not do this.

COURSE BUILD STATUS:

describes physical Course truth.

Example:

ROGERS LAKEWOOD PARK

Physical Hole groups: 27

Tees mapped: 31/31

Basket Positions mapped: 34/34

Canonical playable routes mapped: 27/27

Course features confirmed: ...

This should remain the SAME regardless of selected Layout.

==================================================
8. LAYOUT READINESS IS SEPARATE
==================================================

Layout may have its own status.

Example:

BLUE TEES

24 Layout Holes

24/24 Tee selections

24/24 Basket selections

24/24 Par

24/24 distances

Ready.

MAIN 27

27/27 ready.

Do NOT label the whole Course:

24/27 mapped

because the currently selected Layout has 24 Holes.

==================================================
9. PHYSICAL HOLES VS LAYOUT HOLES
==================================================

Do not confuse:

PHYSICAL COURSE HOLES / ASSET GROUPS

with:

LAYOUT HOLES / ROUTE SLOTS.

Example:

Course may have physical asset groups:

1–24
X
Y
Z

plus alternate Tees/Baskets.

A Layout may have:

21
24
27
18

route slots.

Course completeness is independent of Layout hole count.

==================================================
10. ONE CANONICAL TEE INVENTORY
==================================================

Every Tee exists once.

Example:

tee_001

Course:
Rogers Lakewood

Home grouping:
Hole 1

Name:
Main

Coordinates:
...

tee_002

Home grouping:
Hole 1

Name:
Blue

Coordinates:
...

All Layouts reference these IDs.

==================================================
11. ONE CANONICAL BASKET INVENTORY
==================================================

Every Basket Position exists once.

Example:

basket_7a

Course:
Rogers Lakewood

Home grouping:
Hole 7

Position:
A

Coordinate:
...

Layouts reference this ID.

==================================================
12. ONE CANONICAL PHYSICAL FEATURE SET
==================================================

Water polygon:

stored once.

Fence:

stored once.

Road:

stored once.

Woods:

stored once.

Course boundary:

stored once.

Building:

stored once.

Do NOT duplicate these by Layout.

==================================================
13. ONE CANONICAL STANDARD ROUTE / FAIRWAY SYSTEM
==================================================

The proper curved fairways currently visible in the completed editor must
become the canonical source.

Do not generate straight fairways simply because Course Studio cannot find
its own copy.

For known Tee → Basket combinations, store/reuse canonical route geometry.

Conceptually:

course_play_route

course_id

tee_id

basket_position_id

path_geometry

fairway_geometry

source

confidence

version.

==================================================
14. TEE → BASKET ROUTE IS THE KEY
==================================================

Because DGD supports:

Hole 1 Blue Tee
→ Hole 7A Basket

the route/fairway system should be capable of referencing:

tee_id
+
basket_position_id.

For normal pairings:

reuse canonical known route.

For unusual safari pairing:

Layout may create its own route override.

==================================================
15. STRAIGHT LINE IS ONLY A FALLBACK
==================================================

Do NOT present a straight Tee→Basket line as if the Hole is fully mapped when
a real route has not been defined.

Fallback state may say:

ROUTE NOT MAPPED

with a subtle direct line for orientation.

It must not overwrite or replace a known curved flight/fairway path.

==================================================
16. NEVER REPLACE GOOD GEOMETRY WITH FALLBACK
==================================================

If canonical route geometry already exists:

do not let another editor:

generate straight path
save straight path
overwrite real path.

Existing confirmed geometry wins unless explicitly edited by an authorized
Course manager.

==================================================
17. COURSE FEATURES ARE COURSE-OWNED
==================================================

Examples:

water

roads

paths

woods

fences

buildings

permanent OB objects

should query by:

course_id

or canonical Course version.

Not layout_id.

==================================================
18. LAYOUT FEATURES ARE ONLY TRUE OVERRIDES
==================================================

Only genuine Layout-specific behavior may belong to Layout.

Examples:

special safari flight path

Layout-specific Mando

Layout-specific DZ

rare Layout-specific OB rule.

Do not duplicate permanent Course geography.

==================================================
19. EVENT FEATURES REMAIN EVENT OVERLAYS
==================================================

Temporary tournament:

OB

Mando

DZ

temporary Tee

temporary Basket

belong to:

EVENT OVERLAY.

They do not modify the canonical Course.

==================================================
20. EDITOR ENTRY POINTS
==================================================

After this phase:

COURSE PAGE
→ EDIT

and:

COURSE PAGE
→ COURSE STUDIO

must land in the same product.

Recommended:

replace both with:

[ Course Studio ]

Authorized user clicks it.

Then tabs/modes:

Overview
Map
Layouts
Conditions
Signage
Caddy Book.

==================================================
21. MAP TAB
==================================================

Course Studio → Map is THE one and only physical Course map editor.

It loads:

all canonical Tees

all canonical Baskets

canonical routes/fairways

Course terrain

features

permanent rules.

No second map builder.

==================================================
22. LAYOUT TAB
==================================================

Course Studio → Layouts does NOT edit physical geography.

It simply builds recipes.

Example:

BLUE 24

1
Hole 1 Blue
→ Hole 1 A
Par 3

2
Hole 2 Blue
→ Hole 2 A
Par 3

3
Hole 3 Main
→ Hole 7 A
Par 4.

==================================================
23. EDIT PHYSICAL ASSET FROM LAYOUT
==================================================

If desired Tee/Basket does not exist:

[+ Add Tee]

or:

[+ Add Basket]

opens the SAME Map editor

on the canonical Course.

After save:

returns to Layout editor.

No alternate Course Builder.

==================================================
24. FAIRWAY DISPLAY IN COURSE STUDIO
==================================================

When viewing a normal Hole:

show its canonical real route/fairway.

If multiple Tee/Basket combinations exist:

allow selection.

Example:

TEE:
Blue

BASKET:
A

then render the corresponding route.

==================================================
25. COURSE MAP VIEW MODE
==================================================

Course Studio Map should have two useful contexts:

COURSE MODE

shows physical assets and features.

HOLE / ROUTE MODE

focuses on selected Tee→Basket pairing.

Do not load a different Course dataset.

==================================================
26. LAYOUT PREVIEW MODE
==================================================

When previewing a Layout inside the same map:

keep the SAME Course basemap/features.

Overlay only:

selected Tee/Basket pairs

route order

Layout labels.

==================================================
27. COURSE CONFIRMATION STATUS
==================================================

There should be one authoritative Course build status.

Do not let:

Course Studio say Unconfirmed

while another editor says complete.

Determine confirmation from canonical physical data.

Example states:

DRAFT MAP

COMMUNITY MAP

VERIFIED MAP.

==================================================
28. ASSET-LEVEL CONFIDENCE
==================================================

Individual data may have confidence:

Imported

Community

Steward Verified

Official.

But the two editors must read the same state.

==================================================
29. COURSE MAP STATUS
==================================================

Recommended status model:

PHYSICAL MAP

Tees:
31/31

Basket Positions:
34/34

Routes:
27/27

Course geography:
Mapped

Amenities:
Partial

Verification:
Community Map.

This is more meaningful than:

24/27 mapped

when 24 is actually a Layout hole count.

==================================================
30. MIGRATE LEGACY MAP DATA
==================================================

Audit every legacy Course mapping table.

Identify:

canonical current data

legacy Builder data

layout-local copies

duplicate Hole geometry

duplicate Tee/Basket points

straight fallback routes.

Create a deterministic reconciliation/backfill.

==================================================
31. RECONCILIATION PRIORITY
==================================================

When records conflict, prefer according to evidence.

Example:

1. steward/authorized confirmed edit
2. current canonical Course data
3. verified field/GPS mapping
4. trusted source import
5. community suggestion
6. generated fallback.

Do not blindly use newest timestamp.

==================================================
32. FAIRWAY MIGRATION
==================================================

For Rogers Lakewood:

the completed editor's proper fairway shapes should be identified.

If they are legitimate current Course geometry:

make them canonical.

Then both entry points must render them.

==================================================
33. PRESERVE SOURCE HISTORY
==================================================

Do not destroy provenance while merging.

Maintain:

source

created_by

verified_by

version history

change timestamp

confidence.

==================================================
34. REMOVE GHOST DUPLICATES
==================================================

After canonical migration:

old duplicated physical Course rows should no longer be returned by production
queries.

Archive/deprecate safely if historical references require them.

Do not leave two live asset sets.

==================================================
35. DO NOT DELETE HISTORICAL EVENT DATA
==================================================

Historical Event Layout Versions may need old geometry snapshots.

Preserve them.

But current Course Studio must have one current truth.

==================================================
36. DATABASE UNIQUENESS / INTEGRITY
==================================================

Where appropriate enforce integrity such as:

Tee belongs to one canonical Course.

Basket Position belongs to one canonical Course.

Permanent Course feature belongs to one canonical Course/version.

Layout slot references Tee/Basket from the same canonical Course unless an
explicit supported cross-course feature ever exists.

Currently DGD Layouts should remain within one Course.

==================================================
37. LAYOUT CANNOT OWN PHYSICAL ASSET
==================================================

A physical Tee or Basket must never disappear because a Layout is deleted.

Layout deletion removes references only.

==================================================
38. COURSE DELETE SAFETY
==================================================

Deleting a Course is a separate highly privileged action.

Do not cascade-delete historical Event truth unintentionally.

==================================================
39. PUBLIC COURSE OVERVIEW
==================================================

Public Overview uses:

canonical Course base

+

selected Layout overlay.

Changing layout must never change the Course itself.

==================================================
40. TEE SIGN
==================================================

Tee Sign consumes:

canonical Course features

+

exact Layout Tee→Basket route

+

Layout Par/rules.

Do not consume a separate Tee Sign map database.

==================================================
41. CADDY BOOK
==================================================

Same canonical renderer/data.

No duplicate Course map build.

==================================================
42. DIGITAL CADDY
==================================================

Same.

Canonical Course geometry

+

Layout version

+

Event Overlay if applicable.

==================================================
43. SCORECARD
==================================================

Same.

Selected Layout Version tells scorecard:

route slot

tee_id

basket_position_id

Par.

Course Studio does not have another scoring representation.

==================================================
44. ROGERS LAKEWOOD — REQUIRED REPAIR
==================================================

Use Rogers Lakewood as mandatory regression fixture.

Current incorrect behavior:

PATH A:
Course Studio
→ unconfirmed
→ 24/27
→ straight fairways.

PATH B:
Course
→ Editor
→ completed
→ 27/27
→ proper fairways/features.

After fix:

both paths load the SAME Course Studio.

==================================================
45. ROGERS TEST — PHYSICAL DATA
==================================================

Open Rogers Lakewood Course Studio directly.

Record:

Course ID

Course version

Tee count

Basket count

route count

feature count.

Then enter from public Course page → Edit.

Expected:

EXACT SAME IDs AND COUNTS.

==================================================
46. ROGERS TEST — FAIRWAY GEOMETRY
==================================================

Open Hole 1 through both navigation paths.

Expected:

same Tee ID

same Basket ID

same route/fairway geometry ID

same control points

same permanent Course features.

Screenshot should be visually identical.

==================================================
47. ROGERS TEST — STATUS
==================================================

Expected:

Course physical mapping status is identical regardless of:

Main 27

Blue Tees

Skip Derby

selected Layout.

Layout readiness may differ.

Course mapping status may not.

==================================================
48. ROGERS TEST — LAYOUT CHANGE
==================================================

Switch:

Main 27

→ Blue Tees.

Expected:

Course geography remains identical.

Only selected route assignments change.

Do not change:

Course mapped count

Course confirmation

water

roads

fences

physical Course assets.

==================================================
49. ROGERS TEST — EDIT FAIRWAY
==================================================

Authorized manager edits canonical Hole route.

Save.

Open Course through every entry point.

Expected:

all show new route.

No manual synchronization.

==================================================
50. ROGERS TEST — NEW LAYOUT
==================================================

Create:

Safari Test.

Slot:

Hole 1 Blue Tee
→ Hole 7A Basket.

Expected:

same Course build.

No new Course record.

No new Tee.

No new Basket.

Only Layout slot + optional custom route override.

==================================================
51. ROUTE FALLBACK TEST
==================================================

Choose a Tee→Basket pairing with no mapped route.

Expected:

UI may show subtle straight provisional connection.

Label:

ROUTE NOT MAPPED

or equivalent.

Do not mark route:

Verified / Complete.

==================================================
52. NO BROWSER-ONLY FIX
==================================================

Do not solve this with:

conditional frontend rendering

or:

"if Course Studio then use other query."

Fix the canonical data ownership/query architecture.

==================================================
53. SHARED DATA ACCESS LAYER
==================================================

Course Studio, Public Course, Layout Studio, Tee Signs, Caddy Book and Caddy
should use the same Course-domain data access layer.

Conceptually:

getCourse(course_id)

getCourseAssets(course_id)

getCourseFeatures(course_id)

getCourseRoutes(course_id)

getLayouts(course_id)

getLayoutVersion(layout_version_id).

Avoid separate legacy hooks returning different Course structures.

==================================================
54. DEPRECATE OLD HOOKS / RPCs
==================================================

Audit for duplicate functions/hooks such as:

useCourseBuilder...

useCourseEditor...

getLayoutCourse...

getCourseMap...

old Course RPCs.

Consolidate.

Remove/deprecate after all callers migrate.

==================================================
55. CACHE KEYS
==================================================

Verify frontend caching does not treat the same Course differently depending on
entry route.

Use canonical query keys based on:

course_id

course_version_id

not route name.

Invalidate canonical Course queries after edit.

==================================================
56. AUTOSAVE
==================================================

Autosave must save to the same canonical Course draft.

Do not let:

Course Studio autosave

and:

Edit Course Save Changes

write to separate datasets.

==================================================
57. PUBLISH FLOW
==================================================

If Course map changes require publication:

all editor entry points should show the same draft/published state.

One publish action updates one Course version.

==================================================
58. PERMISSIONS
==================================================

Same authorization in every entry point.

Course Manager can edit canonical Course.

Normal player can view/report/suggest.

Do not let one legacy editor bypass newer permissions.

==================================================
59. SUPABASE SAFETY
==================================================

If schema/query changes are necessary:

inspect current schema first.

Reuse canonical tables where possible.

Do NOT create another parallel Course V2 system.

Every exposed table must have appropriate RLS.

`TO authenticated` alone is not authorization.

UPDATE requires appropriate SELECT + USING + WITH CHECK.

Do not use user-editable metadata for authorization.

Run database/security advisors after migration.

==================================================
60. MIGRATION REPORT
==================================================

At completion return:

Canonical Courses inspected

duplicate Course records found

duplicate physical asset sets found

legacy Course Builder records found

Tees reconciled

Baskets reconciled

routes/fairways reconciled

Course features reconciled

layout-owned physical features migrated

straight fallback routes removed/reclassified

obsolete queries/hooks removed

Courses still requiring manual review.

==================================================
61. ROGERS SPECIFIC REPORT
==================================================

For Rogers Lakewood return:

Canonical course_id

Current Course version

Physical Tee count

Basket Position count

Canonical route count

Feature count

Current mapping status

Current verification status

Layouts referencing Course

Any duplicate/legacy Course IDs found

Any geometry migrated

Any remaining inconsistencies.

==================================================
62. UI CLEANUP
==================================================

After architecture repair:

Course page should not need both:

Edit

and:

Course Studio

if both mean editing the Course.

Prefer one clear:

COURSE STUDIO

button for authorized managers.

==================================================
63. COURSE STUDIO NAVIGATION
==================================================

Inside:

COURSE STUDIO

Overview
Map
Layouts
Conditions
Signage
Caddy Book
Sponsors
Public Page.

No second Course Builder route.

==================================================
64. FINAL COURSE ARCHITECTURE
==================================================

THE COURSE EXISTS ONCE.

IT HAS ONE CANONICAL:

MAP

TEE INVENTORY

BASKET INVENTORY

ROUTE / FAIRWAY INVENTORY

FEATURE INVENTORY

CURRENT VERSION.

LAYOUTS DO NOT CREATE A NEW COURSE.

THEY ONLY SELECT:

TEE
→
BASKET
→
PAR

FOR EACH ROUTE SLOT.

==================================================
65. FINAL ACCEPTANCE RULE
==================================================

IF I OPEN THE SAME COURSE FROM TWO DIFFERENT PLACES IN DGD:

IT MUST BE IMPOSSIBLE TO SEE TWO DIFFERENT COURSE BUILDS.

THE ONLY ACCEPTABLE DIFFERENCE IS THE UI CONTEXT OR SELECTED LAYOUT OVERLAY.

THE UNDERLYING PHYSICAL COURSE MUST ALWAYS BE THE SAME.