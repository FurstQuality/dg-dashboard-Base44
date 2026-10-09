PHASE — SIMPLIFY DGD LAYOUT BUILDER
ANY COURSE TEE → ANY COURSE BASKET

The Layout Builder is still more complicated than it needs to be.

Replace the current layout-building workflow with an extremely simple model:

1. Choose how many holes the Layout has.
2. For each Layout Hole:
   - choose a Tee Pad
   - choose a Basket Position
   - choose/set Par
3. Save / Publish.

That is the core product.

Everything else should be automation or optional advanced configuration.

==================================================
1. IMPORTANT ARCHITECTURE CORRECTION
==================================================

DO NOT require a Layout Hole to reference one single physical Hole.

A Layout Hole is a ROUTE SLOT.

A route slot references:

TEE PAD

and

BASKET POSITION

independently.

Example:

LAYOUT HOLE 1

Tee:
Physical Hole 1 · Blue Tee

Basket:
Physical Hole 7 · Basket A

Par:
4

This is completely valid.

Another Layout Hole could be:

LAYOUT HOLE 2

Tee:
Physical Hole 2 · Red Tee

Basket:
Physical Hole 2 · Basket C

Par:
3.

==================================================
2. PHYSICAL COURSE MODEL
==================================================

Course Studio owns all permanent physical assets.

COURSE

contains:

physical Hole groupings

Tee Pads

Basket Positions

Course terrain

OB

roads

water

trees

amenities

permanent features.

Each Tee should retain its physical identity.

Example:

TEE ID: tee_123

Course:
Rogers Lakewood Park

Home Hole:
Hole 1

Name:
Blue

Coordinate:
x/y.

Each Basket Position retains the same type of identity.

Example:

BASKET ID: basket_799

Course:
Rogers Lakewood Park

Home Hole:
Hole 7

Position:
A

Coordinate:
x/y.

==================================================
3. LAYOUT SLOT MODEL
==================================================

A Layout should be composed of slots such as:

layout_slot_id

layout_id

position

display_label

tee_id

basket_position_id

par

distance

distance_source

flight_path_override nullable

rules_override nullable.

Do NOT require:

physical_hole_id

as the owning identity for the slot.

The Tee and Basket themselves already know where they physically belong.

==================================================
4. WHY THIS MATTERS
==================================================

DGD must support both:

NORMAL LAYOUT

Hole 1 Main Tee
→ Hole 1 Basket A

and:

SAFARI / CUSTOM LAYOUT

Hole 1 Blue Tee
→ Hole 7 Basket A.

Both use the same physical Course assets.

No duplicated Tees.

No duplicated Baskets.

No fake Holes.

==================================================
5. SIMPLE NEW LAYOUT FLOW
==================================================

Click:

+ NEW LAYOUT

Ask only:

LAYOUT NAME

HOLE COUNT

Examples:

9
18
21
24
27
Custom.

Then:

[BUILD LAYOUT]

Immediately create that number of empty route slots.

==================================================
6. LAYOUT EDITOR
==================================================

The primary editor should look approximately like:

BLUE TEES
18 Holes

--------------------------------------------------

HOLE 1

TEE
[ Hole 1 · Blue ▼ ]

→

BASKET
[ Hole 1 · A ▼ ]

PAR
[ 3 ]

DISTANCE
260 ft

--------------------------------------------------

HOLE 2

TEE
[ Hole 2 · Blue ▼ ]

→

BASKET
[ Hole 2 · B ▼ ]

PAR
[ 3 ]

DISTANCE
312 ft

--------------------------------------------------

HOLE 3

TEE
[ Hole 3 · Blue ▼ ]

→

BASKET
[ Hole 7 · A ▼ ]

PAR
[ 4 ]

DISTANCE
486 ft

--------------------------------------------------

The visual relationship should literally read:

TEE → BASKET.

==================================================
7. NO GIANT ERROR PANEL
==================================================

Remove the current giant warning area containing:

Hole 1 has no Tee.
Hole 1 has no Basket.
Hole 2 has no Tee.
Hole 2 has no Basket.

Instead, incomplete slots show inline:

HOLE 7

Tee
[ Choose Tee ]

Basket
[ Choose Basket ]

⚠ Needs Tee and Basket.

==================================================
8. TEE PICKER
==================================================

When user selects Tee:

show ALL physical Tee Pads on the Course.

Group them by their physical/home Hole.

Example:

HOLE 1

Main
Blue
Red

HOLE 2

Main
Red
Long

HOLE 3

Main
Short.

Allow search.

Search examples:

Blue

Hole 7

Long.

==================================================
9. TEE PICKER DISPLAY
==================================================

Never show ambiguous values such as:

Blue

by itself when multiple Holes have Blue Tees.

Show:

Hole 1 · Blue

Hole 7 · Blue

Hole X · Blue.

This makes physical origin obvious.

==================================================
10. BASKET PICKER
==================================================

Same behavior.

Example:

HOLE 1

Basket A
Basket B

HOLE 2

Basket A
Basket C

HOLE 7

Basket A
Basket Long.

The user may select ANY Course Basket.

==================================================
11. BASKET PICKER DISPLAY
==================================================

Display:

Hole 7 · A

Hole 2 · C

Hole X · Long.

Never just:

A

if that would be ambiguous.

==================================================
12. CROSS-HOLE PAIRINGS
==================================================

Explicitly support:

TEE from one physical Hole

→

BASKET from another physical Hole.

Do NOT display warnings simply because they come from different Holes.

That is a supported layout feature.

==================================================
13. EXAMPLE — SAFARI HOLE
==================================================

Layout Hole 4:

Tee:
Hole 1 · Blue

Basket:
Hole 7 · A

Expected:

valid Layout Hole.

Calculate Tee → Basket distance automatically.

Do not create:

"Physical Hole 1/7"

or another Course Hole.

This is only a Layout route.

==================================================
14. ROUTE LABEL
==================================================

Layout Hole label belongs to the Layout.

Examples:

1
2
3
8A
Safari 1
X.

It does not have to match either physical Tee's home Hole or Basket's home Hole.

==================================================
15. HOLE COUNT
==================================================

The first selection when creating a Layout should simply be:

HOW MANY HOLES?

Common buttons:

9

18

21

24

27

CUSTOM.

Custom:

numeric field.

Then generate exactly that many Layout slots.

==================================================
16. EASY STANDARD LAYOUT CREATION
==================================================

For normal layouts add convenience automation.

Example:

18 Hole Layout.

Button:

[AUTO MATCH SAME HOLES]

DGD tries:

Layout Hole 1:
Hole 1 Tee → Hole 1 Basket

Layout Hole 2:
Hole 2 Tee → Hole 2 Basket

etc.

Then user chooses:

Main
Blue
Red

where appropriate.

==================================================
17. BULK TEE SETTING
==================================================

Convenience only:

USE TEE:

[ Blue ▼ ]

[Apply where available]

DGD finds Blue Tee on each corresponding normal Hole.

Example:

Hole 1 → Hole 1 Blue

Hole 2 → Hole 2 Blue.

If a Blue Tee doesn't exist:

leave that one slot needing attention.

==================================================
18. BULK BASKET SETTING
==================================================

Same concept:

USE BASKET POSITION:

[ A ]

Apply where available.

Do not restrict individual selections after bulk application.

==================================================
19. INDIVIDUAL CONTROL ALWAYS WINS
==================================================

Even after bulk setup:

user can change any Layout Hole.

Example:

Layout Hole 17:

Hole 17 Blue
→ Hole 18 B

while every other slot remains conventional.

==================================================
20. ADD MISSING PHYSICAL TEE
==================================================

Inside Tee selector:

+ ADD NEW TEE TO COURSE

This opens Course Studio on the map.

User places the new Tee.

Required fields:

home Hole/group

Tee name/color

coordinate.

Save.

Return directly to the Layout.

New Tee becomes available immediately.

==================================================
21. ADD MISSING BASKET
==================================================

Inside Basket selector:

+ ADD NEW BASKET POSITION TO COURSE.

Same workflow.

Do not create the Basket secretly inside Layout data.

==================================================
22. COURSE STUDIO OWNS ASSETS
==================================================

Important:

LAYOUT STUDIO MAY SELECT ASSETS.

COURSE STUDIO CREATES OR EDITS PHYSICAL ASSETS.

This distinction must remain strict.

==================================================
23. DISTANCE
==================================================

Once Tee and Basket are selected:

automatically calculate:

Tee → Basket physical distance.

Display immediately.

Example:

487 ft.

If a verified/manual route distance exists for this exact pairing:

use the appropriate stored value according to provenance rules.

==================================================
24. DO NOT USE HOME-HOLE DISTANCE
==================================================

Very important for cross-Hole layouts.

Example:

Hole 1 Blue Tee
→ Hole 7 Basket A.

Do NOT use:

Hole 1 normal distance

or:

Hole 7 normal distance.

Calculate the selected physical coordinates:

selected tee_id
→ selected basket_position_id.

==================================================
25. PAR
==================================================

Par belongs to the Layout Hole.

It may be suggested from known standard configurations.

But for a cross-Hole route:

do not inherit Par blindly from either source Hole.

Example:

Hole 1 Blue → Hole 7A

may be:

Par 4.

User can set it.

==================================================
26. PAR SUGGESTION
==================================================

For conventional pairings:

Hole 1 Main
→ Hole 1 A

DGD may suggest known Par.

For unusual pairing:

show:

PAR
—

[Set Par]

unless a verified exact pairing already exists.

==================================================
27. FLIGHT PATH
==================================================

A cross-Hole route may require a unique flight path.

Therefore distinguish:

PHYSICAL / STANDARD HOLE FLIGHT PATH

from:

LAYOUT ROUTE FLIGHT PATH.

For normal known Tee→Basket pairing:

reuse canonical path if appropriate.

For custom cross-Hole pairing:

automatically start with:

straight Tee → Basket route

and allow:

[Edit Route]

to draw bends/landing zones.

==================================================
28. LAYOUT-SPECIFIC FLIGHT PATH
==================================================

This flight path belongs to:

Layout Slot / Layout Version.

It does NOT alter the normal physical Hole's flight path.

This is necessary for safari layouts.

==================================================
29. RULES FOR CUSTOM ROUTES
==================================================

Course-wide permanent physical features remain visible.

But cross-Hole layouts may have unique:

OB

Mando

DZ

Island

route instructions.

Allow Layout Hole overrides where needed.

Do not rewrite the permanent Course rules.

==================================================
30. SIMPLE DEFAULT UI
==================================================

DO NOT show flight path/rules controls initially.

Default row:

HOLE 1

TEE
Hole 1 · Blue

BASKET
Hole 7 · A

PAR
4

487 FT

[•••]

Advanced menu:

Edit route
Rules
Rename label
Duplicate slot
Remove.

==================================================
31. COURSE MAP PREVIEW
==================================================

Selecting a Layout Hole should show a small/optional map preview:

selected Tee

selected Basket

flight path

distance.

This confirms the pairing visually.

But the map should not be required to build a simple Layout.

==================================================
32. MAP VALIDATION
==================================================

If the user selects:

Hole 1 Blue
→ Hole 7A

show both markers immediately.

Fit map to both.

This makes obvious if the pairing was accidental.

==================================================
33. REORDERING
==================================================

Layout slots can be reordered independently.

Desktop:
drag.

Mobile:
drag/hold or arrows.

Reordering changes:

Layout position.

It does NOT change Tee/Basket ownership.

==================================================
34. DUPLICATE ASSET USE
==================================================

Allow intentional reuse of physical assets.

Example:

Layout Hole 1:
Hole 1 Blue → Hole 7A.

Layout Hole 10:
Hole 1 Blue → Hole 1A.

This can be legitimate for unusual/safari formats.

If same Tee/Basket creates obvious routing conflicts:

warn

but do not prohibit unnecessarily.

==================================================
35. VALIDATION
==================================================

A Layout Hole is complete when it has:

tee_id

basket_position_id

Par.

Distance must be calculable or deliberately verified.

A published Layout requires all scoring slots complete.

==================================================
36. NO PHYSICAL-HOLE REQUIREMENT
==================================================

This is a required migration rule.

Do NOT validate:

tee.home_hole_id === basket.home_hole_id.

That would incorrectly break safari/custom layouts.

==================================================
37. NORMAL HOLE INDICATOR
==================================================

Optionally show:

STANDARD

when:

Tee and Basket belong to same physical Hole.

Example:

Hole 4 Main → Hole 4A
STANDARD.

For cross-Hole:

CUSTOM ROUTE.

This is informational only.

==================================================
38. CREATE FROM EXISTING LAYOUT
==================================================

Keep Copy Layout.

Example:

Main 27
→ Copy
→ Blue Safari.

All selected IDs copy.

Then user changes only desired pairings.

==================================================
39. CREATE FROM SCRATCH
==================================================

Example workflow:

+ NEW LAYOUT

Name:
Safari 18

Holes:
18

[Create]

Then:

1
TEE [Hole 1 Blue]
BASKET [Hole 7 A]
PAR [4]

2
TEE [Hole 3 Red]
BASKET [Hole 2 C]
PAR [3]

...

That should be the entire basic process.

==================================================
40. COMPLETION COUNTER
==================================================

Top:

SAFARI 18

14 / 18 complete

Then list only:

4 needing attention

if user chooses compact mode.

==================================================
41. NO "OTHER HOLES" CHIP WALL
==================================================

Remove the current permanent:

Other Holes On This Course

wall of chips.

The Course assets belong in:

Tee picker

Basket picker.

A Layout is not primarily selecting physical Holes anymore.

It is selecting Tee/Basket pairs.

==================================================
42. NO GLOBAL "MAIN TEES" REQUIREMENT
==================================================

Remove confusing assumptions that Layout has one global Tee family.

A Layout may use:

Blue
Red
Main
Long

all in the same Layout.

Bulk Tee selector is only a convenience.

==================================================
43. NO GLOBAL BASKET REQUIREMENT
==================================================

Same.

One Layout can use:

A
B
C
Long
Short

in arbitrary combinations.

==================================================
44. TEE/BASKET ASSET BROWSER
==================================================

Create a reusable picker component.

TEE PICKER:

Search…
Filter by Hole
Filter by Tee name/color.

BASKET PICKER:

Search…
Filter by Hole
Filter by position.

Use same component anywhere DGD needs to select Course assets.

==================================================
45. CARD/ROW LABEL EXAMPLE
==================================================

For a standard Hole:

1

Hole 1 · Blue
→
Hole 1 · A

Par 3
260 ft.

For custom:

2

Hole 2 · Red
→
Hole 7 · C

Par 4
515 ft

CUSTOM ROUTE.

Very easy to understand.

==================================================
46. LAYOUT SUMMARY
==================================================

Show:

18 Holes

Par 57

6,842 ft

14 standard routes

4 custom routes.

Optional:

Tees used:
Blue 11
Red 7

Basket positions:
A 12
B 4
C 2.

==================================================
47. TEE SIGNS
==================================================

Tee sign renderer must render the actual Layout route.

If Layout Hole 1 is:

Hole 1 Blue
→ Hole 7A

then tee sign shows:

the coordinates and route from Hole 1 Blue Tee to Hole 7A Basket.

Do not render normal Hole 1 Basket by mistake.

==================================================
48. CADDY BOOK
==================================================

Same rule.

Caddy Book follows exact Layout Slot:

tee_id
basket_position_id
route
Par
rules.

==================================================
49. SCORECARD
==================================================

Scorecard Hole 1 refers to:

Layout Hole 1

not necessarily:

Physical Hole 1.

Display:

Hole 1
Par 4
487 ft.

Underlying route knows:

Hole 1 Blue Tee
→ Hole 7A Basket.

==================================================
50. EVENTS
==================================================

Event chooses:

Course
Layout
Layout Version.

The exact Tee/Basket pair for every route slot is pinned.

Historical Event scoring must remain reproducible.

==================================================
51. VERSIONING
==================================================

Published Layout Version stores exact:

position

display_label

tee_id

basket_position_id

Par

distance/source snapshot

flight path configuration

rule configuration.

Later Course edits must not silently rewrite historical Event truth.

==================================================
52. CURRENT BASKET POSITION
==================================================

Allow an optional selection:

Hole 7 · CURRENT

only for dynamic casual/current layouts where appropriate.

Before an Event/official Round begins:

resolve CURRENT to the exact Basket Position actually used.

Do not leave historical Round data dynamically pointing at "current."

==================================================
53. MIGRATE CURRENT LAYOUTS
==================================================

Audit existing layouts.

Convert every layout row into:

tee_id
basket_position_id

where confidence is high.

Do not preserve artificial layout-only "Hole" records if they serve no physical
purpose.

==================================================
54. ROGERS LAKEWOOD TEST
==================================================

Rogers Lakewood should become a primary regression fixture.

Create:

TEST SAFARI LAYOUT
3 holes.

Slot 1:

Hole 1 Blue
→ Hole 7 A.

Slot 2:

Hole 2 Red
→ Hole 2 C.

Slot 3:

Hole X Main
→ Hole Z A.

Expected:

all valid.

Distances calculated from selected coordinates.

No duplicated physical assets.

==================================================
55. STANDARD LAYOUT TEST
==================================================

Create:

18 holes.

Auto Match Same Holes.

Use:

Blue Tees where available.

Basket A where available.

Expected:

most configuration happens automatically.

Only genuine exceptions require manual selection.

==================================================
56. ADD TEE TEST
==================================================

While building Layout:

required Tee does not exist.

Tap:

+ Add Tee.

Course Studio opens.

Place Tee.

Return.

Tee appears in selector.

No duplicate Course or Layout record.

==================================================
57. ADD BASKET TEST
==================================================

Same behavior.

==================================================
58. SIMPLE USER TEST
==================================================

A brand-new user should understand Layout creation without documentation.

Ask them to create:

18 Hole Blue Layout.

Expected workflow:

Choose 18

Choose/apply Blue

Choose/apply A

fix exceptions

Publish.

Then ask them to create:

Safari Layout.

Expected:

choose arbitrary Tee
→ arbitrary Basket

per slot.

No confusion about physical Hole ownership.

==================================================
59. SUPABASE / SECURITY
==================================================

Before schema changes:

verify current Supabase changelog/docs.

Reuse existing canonical Course asset tables where possible.

Do NOT create a parallel duplicate Course database.

Every exposed table:

RLS.

Course/Layout write access must use Course role/capability authorization.

`TO authenticated` alone is not authorization.

UPDATE requires appropriate SELECT + USING + WITH CHECK policies.

Do not use user-editable metadata for permissions.

Run database/security advisors after changes.

==================================================
60. FINAL PRODUCT DEFINITION
==================================================

A COURSE IS THE INVENTORY OF EVERYTHING THAT PHYSICALLY EXISTS.

A LAYOUT IS A LIST OF TEE → BASKET PAIRS.

THAT IS IT.

FOR EACH LAYOUT HOLE:

SELECT A TEE.

SELECT A BASKET.

SET PAR.

DGD CALCULATES THE REST.

THE TEE AND BASKET DO NOT HAVE TO COME FROM THE SAME PHYSICAL HOLE.

THIS MUST SUPPORT:

Hole 1 Blue Tee
→ Hole 7A Basket

just as naturally as:

Hole 1 Blue Tee
→ Hole 1A Basket.

DO NOT FORCE USERS TO REBUILD THE COURSE TO CREATE A LAYOUT.