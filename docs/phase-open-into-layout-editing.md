PHASE — TURN “OPEN” INTO FULL LAYOUT EDITING

The Course → Layouts screen currently shows an "Open" button on each Layout.

For authorized Course creators/managers, this should instead be:

EDIT LAYOUT

and it should open the complete Layout Studio for that exact Layout.

Do not create another Layout editor.

Use the same canonical Layout Studio and Course assets already being built.

==================================================
1. BUTTON BEHAVIOR
==================================================

AUTHORIZED COURSE MANAGER:

[ Edit Layout ]

UNAUTHORIZED USER:

[ View Layout ]

Do not show an Edit button simply because the user is authenticated.

==================================================
2. WHO MAY EDIT
==================================================

Editing must be server-authorized.

Allowed when the user has an appropriate Course capability such as:

Course Creator
Course Owner/Admin
Course Steward with layout-management permission
explicit trusted Course Manager
Global Admin override

Do NOT grant edit rights because the user:

played the Course
mapped a Hole
submitted a condition
followed the Course
created a Round
is merely authenticated.

==================================================
3. EDIT LAYOUT OPENS THE ACTUAL LAYOUT
==================================================

Clicking:

EDIT LAYOUT

must load the selected layout_id directly.

Example:

Blue Tees
→ Edit Layout

opens:

LAYOUT STUDIO
Blue Tees

Do not make the user select it again.

==================================================
4. WHAT CAN BE EDITED
==================================================

Authorized users should be able to edit:

LAYOUT IDENTITY

- Layout name
- short description
- public notes
- internal manager notes where appropriate
- status
- seasonal information
- default-layout designation

ROUTE

- number of Layout holes
- route order
- display labels
- add Layout hole
- remove Layout hole
- reorder holes

TEE / BASKET ASSIGNMENTS

For every Layout Hole:

- Tee Pad
- Basket Position
- Par

Remember the current DGD rule:

A Layout Hole is a Tee → Basket pairing.

Example:

Layout Hole 1

Hole 1 · Blue Tee
→
Hole 7 · Basket A

is valid.

The Tee and Basket do NOT need to belong to the same physical Hole.

==================================================
5. HOLE ROW
==================================================

Keep each Layout Hole extremely simple.

Example:

HOLE 1

TEE
[ Hole 1 · Blue ▼ ]

→

BASKET
[ Hole 7 · A ▼ ]

PAR
[ 4 ]

487 FT

[ Notes ]
[ More ]

Do not return to a giant spreadsheet full of technical columns.

==================================================
6. HOLE DETAILS / NOTES
==================================================

Allow each Layout slot to have contextual Layout-specific information such as:

player-facing Hole note
layout-specific caddy note
display label
layout route note
special instruction.

Example:

"Play from Blue 1 across to Basket 7A."

Do not modify the physical Tee/Basket merely by editing a Layout note.

==================================================
7. ADVANCED HOLE OPTIONS
==================================================

Under a secondary menu:

Edit flight route
Layout-specific rules
Mando
OB
DZ
Island
Hazard
Rename display label
Duplicate route slot
Remove from Layout.

Keep these hidden until needed.

The normal layout-building experience should remain:

TEE
→
BASKET
→
PAR.

==================================================
8. PHYSICAL ASSET CREATION
==================================================

If the desired Tee does not exist:

[ + Add Tee to Course ]

If the desired Basket does not exist:

[ + Add Basket Position to Course ]

This opens Course Studio for the physical Course.

After creation:

return to the same Layout
same Layout Hole
same scroll/context

and allow the new asset to be selected.

Do NOT create fake layout-only Tees/Baskets.

==================================================
9. LAYOUT NAME EDITING
==================================================

Allow:

Blue Tees
→ Blue / Long Layout

or other rename.

Renaming the Layout must not:

rename physical Tees
rename Basket positions
alter historical Event records that display a pinned historical version.

==================================================
10. HOLE COUNT
==================================================

Layout manager can change the number of Layout holes.

Examples:

18
21
24
27
Custom.

Increasing Hole count:

create empty Layout slots.

Reducing Hole count:

ask which slots should be removed if needed.

Never delete physical Course Holes.

==================================================
11. REORDERING
==================================================

Allow easy drag-and-drop.

Mobile fallback:

Move Up
Move Down.

Changing route position does not change the Tee's or Basket's physical identity.

==================================================
12. SAVE VS PUBLISH
==================================================

Provide:

SAVE DRAFT

and

PUBLISH CHANGES.

Do not silently publish every edit.

==================================================
13. PUBLISHED LAYOUT SAFETY
==================================================

If the Layout is already Published:

DO NOT mutate the currently published historical version in place.

Editing should create or update a:

DRAFT REVISION.

Banner:

"Editing a new revision of Blue Tees.
The currently published version remains live until you publish these changes."

==================================================
14. PUBLISH CREATES NEW VERSION
==================================================

When Publish Changes is selected:

validate Layout
create immutable new Layout Version
mark it current
preserve previous version.

Example:

Blue Tees

v1 — historical
v2 — current.

==================================================
15. EVENTS MUST REMAIN PINNED
==================================================

If an Event already selected:

Blue Tees v1

publishing:

Blue Tees v2

must NOT silently switch that Event.

Event continues using:

v1

unless authorized Event management explicitly changes it.

==================================================
16. VALIDATION
==================================================

Before publishing, every scoring Layout Hole requires:

tee_id
basket_position_id
Par.

Distance should resolve from the actual selected Tee/Basket geometry or a
verified distance source.

Do not use fake defaults to pass validation.

==================================================
17. DRAFTS CAN BE INCOMPLETE
==================================================

Draft example:

22 / 24 ready.

That is allowed.

But it must not display:

Scoring Ready

or:

Map Ready

when required references are missing.

==================================================
18. LAYOUT CARD ACTIONS
==================================================

Update the current Layout cards.

AUTHORIZED USER:

Blue Tees

Published

24 holes · Par 72 · 8,380 ft

[ Edit Layout ]
[ Copy ]

Secondary:

Caddy Book
Tee Signs
History

UNAUTHORIZED USER:

[ View Layout ]

No Edit.

==================================================
19. COPY
==================================================

Keep:

COPY

as a separate action.

Copying creates another Layout configuration referencing the SAME physical
Course assets.

It does not duplicate:

Tees
Baskets
Course geometry.

==================================================
20. HISTORY
==================================================

Authorized users should be able to view:

layout version history
who changed it
when
summary of change.

Example:

v3
Mike Furst
Oct 7

Changed:
Hole 4 Tee
Hole 7 Basket
Layout name.

==================================================
21. CHANGE SUMMARY BEFORE PUBLISH
==================================================

Before publishing, show a concise diff:

BLUE TEES

3 changes

Hole 4
Main Tee → Blue Tee

Hole 7
Basket A → Basket B

Name
Blue Tees → Blue Championship.

[Cancel]
[Publish v2]

==================================================
22. COURSE CREATOR / MANAGER UX
==================================================

Course managers should NEVER have to:

Open Layout
then find another Edit button
then select the Layout again.

The Layout card itself is already the management entry point.

Click:

EDIT LAYOUT

→ edit immediately.

==================================================
23. COURSE PUBLIC PAGE
==================================================

The same public Course page may list Layouts.

If current user can manage the Course:

show:

Edit Layout.

Otherwise:

View Layout.

Use one permission resolver.

==================================================
24. PERMISSION SECURITY
==================================================

This is not frontend-only.

Direct API attempt by an unauthorized user to edit a Layout must fail.

Protect:

layout metadata
layout slots
tee/basket assignment
Par
route order
publication
version creation.

Do not use `TO authenticated` alone as authorization.

Use actual Course ownership/steward/manager capability checks.

UPDATE policies must enforce both existing-row access and valid resulting row.

==================================================
25. OWNER ESCALATION
==================================================

Editing a Layout must not allow a Course manager to change:

Course ownership
Course creator
Course staff authority

unless they separately have that permission.

Layout editing and Course ownership are distinct.

==================================================
26. GLOBAL ADMIN
==================================================

Global Admin may edit through an explicit admin override.

Do not present Global Admin as:

Course Creator

unless they actually are.

Keep override auditable.

==================================================
27. ROGERS LAKEWOOD REGRESSION
==================================================

Use the screenshot Course as a regression fixture.

Course:

Rogers Lakewood Park

Layouts:

Blue Tees
Main 27
Skip Derby + X,Y,Z
Skip X,Y,Z.

For an authorized Course manager:

each card shows:

EDIT LAYOUT.

Click Blue Tees:

opens Blue Tees directly.

Click Skip Derby:

opens Skip Derby directly.

==================================================
28. EDIT TEST
==================================================

Open Blue Tees.

Change:

Name:
Blue Tees
→
Blue Championship

Hole 1:
Hole 1 Blue
→ Hole 1A

Hole 4:
Hole 4 Blue
→ Hole 7A

Par:
3 → 4

add Note.

Save Draft.

Expected:

draft persists
published version unchanged.

==================================================
29. PUBLISH TEST
==================================================

Publish.

Expected:

new Layout Version created

Course overview uses new current version

new casual Rounds may use current version

old Event pinned to old version remains unchanged.

==================================================
30. FINAL PRODUCT RULE
==================================================

THE LAYOUT CARD IS A MANAGEMENT ENTRY POINT.

FOR COURSE MANAGERS:

OPEN
BECOMES
EDIT LAYOUT.

EDIT LAYOUT MUST LET THE MANAGER CHANGE:

NAME
DETAILS
HOLE COUNT
ROUTE ORDER
TEE
BASKET
PAR
NOTES
LAYOUT-SPECIFIC ROUTES/RULES

WITHOUT REBUILDING THE PHYSICAL COURSE.

THE PHYSICAL COURSE REMAINS CANONICAL.

THE LAYOUT IS SIMPLY THE PLAYABLE TEE → BASKET RECIPE.