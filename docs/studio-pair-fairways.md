# Fairways on the Course Studio map

The course builder sidebar has **Items**, **Add**, and **Colors** tabs. In **Add**, choose **Tee pad** or **Basket**, then click the ground. Repeating this adds another endpoint and its fairways without relocating existing assets. **Items** searches tees, baskets, and features in the current hole or entire course. Choose an item to name, color, locate, and allocate it. Every placed tee starts with a route to every placed basket: two tees and three baskets produce six routes. Destination checkboxes can narrow assignments; unmapping retains saved bends.

Click a tee or basket to open its focused item editor. A route's **Edit** button selects that exact pairing. The existing map stays open: there is no separate fairway page, second map, or Apply paths step. Placed assets move only by dragging. **Locate** focuses an asset; **Place** arms placement for an unplaced asset. Select, Escape or Cancel ends placement.

## Colors and other items

Basket markers render their saved color, including the selected basket. Course tee sets live in **Colors**: every tee with a matching name inherits that set's color. Changing a set also recolors legacy pads with the old color (such as Main), unless they belong to another named set. The individual tee editor explains when its color is shared; changing it updates the set instead of being silently overwritten by inheritance. Unmatched tees and baskets keep individual colors.

Shared color previews update immediately. Writes run in order and retain the final picker value, even while an earlier request is running. The panel shows loading/saving errors with retry controls; Save changes waits for pending color writes. Collapsing or switching tools does not unmount the palette or discard pending writes.

Click a feature or find it in Items to edit its name and hole assignment, plus relevant properties such as tree width, mando direction, and OB side. Point features select on click and commit movement after a completed native drag. The Add tab includes course/hole assignment, existing OB reuse, and boundary locking. GPS and map-import tools live under More map tools.

## Smart placement and connections

In **Add**, choose **Tee type to place** before dropping a tee. Its selected name and course color travel with it; the new item's editor opens immediately. **Mapped tee pads · this layout** counts primary and extra pads with real coordinates. It recognizes older names such as Main or Tee 2 by saved color and lists unplaced entries separately. These are layout placement counts, not totals across other layouts.

For two tees sharing a basket, open one route and choose **Join approach**, then click the other route at the desired junction. The chosen route follows all remaining bends of the other approach; the junction and remaining shared bends stay editable. This is an explicit join, not a guessed merge at a crossing. Undo restores the original geometry.

Select a basket and choose **Connect to basket …** to create a basket-to-basket fairway within the hole. It uses the same distance, bending, joining, splitting, and save controls, and stays attached to its basket identities when either moves or is renamed. **Remove connection to basket …** removes just that connection. Basket connections are optional; they do not create extra tees or replace tee-to-basket routes.

Every fairway automatically has at least two bend handles. Rounded curves run through those handles, with one consistent curve for each shared stretch. Distances measure the displayed curve. Dragging shows a purple snap target before release; Auto-join can be switched off and the drag snap distance adjusted (3, 6, 10, or 20 feet). Defaults connect new routes within 6 feet; no tee or basket is moved by a join.

Basket connections are stored as `basket_connections` in the existing version-1 basket route JSON. Copies remap their basket IDs; snapshots remain unchanged. The metadata is carried by each extra basket so deleting an unrelated basket does not remove the remaining connections.

## Shape and distance

- Click the selected line to add a bend, then drag it. New/default routes automatically meet nearby fairways within 6 feet in the same hole. Dragged bends show a snap preview; release to join.
- **Redraw route** traces a replacement by clicking the ground from tee toward basket. **Finish drawing** commits; **Cancel** restores the previous shape.
- Distance follows every segment and updates during bend or endpoint drags. Moving an endpoint leaves interior bends in place.
- **Join point** chooses a point on this route, then a point or segment on another route. The chosen bend moves to that junction.
- **Share section** chooses start/end on this route, then start/end on the selected other route, in tee-to-basket order. The selected interval adopts the other route's geometry.
- Purple points are shared. Dragging one updates all participating routes. Green points belong to one route.
- **Split section** selects where to leave and rejoin. It creates independent bends inside that interval; drag them away to form a branch. A point's popup also offers **Detach this bend**.
- **Repair this route → Separate whole route** keeps its coordinates while removing shared identities. **Reset to straight** replaces this route with a straight line and two fresh bend handles. Course builder Undo restores committed changes.

The user explicitly approved automatic nearby joins on October 8, replacing the former explicit-join-only behavior. New/default routes can join at nearby crossings within 6 feet, including crossings between bend handles. Existing saved routes are not re-joined during reload, so a saved manual split remains separate. Only control points and shared identities are stored; curve samples are display/measurement geometry. Normal Save persists generated defaults and is stable across repeated saves.

## Persistence and compatibility

Committed changes use the course builder Undo, autosave and **Save changes** flow. Unfinished drawing or section selection must be finished or cancelled. No new table or database migration is required.

The adapter reads recorded legacy control points directly. It does not turn sampled curves into editing handles or infer joins from route_mode. Existing explicit paths remain intact until edited. Repair controls correct old unwanted joins without wiping every route.

Version-1 JSON lives in hole_tees.flight_path and hole_baskets.split_point. It stores each pairing's interior node IDs and coordinates, assignments and the main route's shared identities. The primary holes.flight_path remains a coordinate array. Endpoints resolve from existing assets. Layout copies remap basket references. Published layout versions and past event snapshots are unaffected.

Main measured distance and layout totals follow the recorded path. A genuine manual primary distance override remains explicit. Each pairing's organizer and inspector always show its measured route length.

## Verification

Pure regression tests cover Cartesian route generation, multiple bends, joins, shared point movement, repeated splits/rejoins, whole-route repair, loop rejection, endpoint moves, JSON round trips, assignment restoration and layout-copy remapping.

Local browser verification mounts the actual CourseBuilder with an isolated database stub and blocks external requests. It exercises the sidebar, single map, normal save/reload, redraw, distance updates before mouse release, sharing, persistent splitting, route repair/Undo, endpoint click versus drag, new endpoint placement and automatic pairing generation. Phone controls collapse to leave room for drawing. It verifies UI and serialization without editing the user's live course or claiming a live database save.

Drag regression: bend icons retain object identity during previews. StudioEndpointMarker keeps equivalent icon and position props stable so React updates cannot replace Leaflet’s draggable mid-gesture or snap it back before dragend.

The item/color browser regression also checks basket color and name persistence, matching tee colors across two holes, rapid color changes, failure/retry, panel collapse during a write, tree selection/dragging and canopy persistence. TypeScript, the production build, and all 966 tests pass.

Rounded-route browser checks cover automatic handles on all six pairings, curved SVG geometry, exact curve-distance save/reload, stable repeated saves, and native drag preview/release creating a persistent shared junction.


## Per-pair par and distance (October 9, 2026)

Map tools → Pars & distances lists each mapped tee-to-basket route by hole, with both endpoint names and colors. A route also exposes these controls in its fairway inspector; tee and basket route lists and map tooltips show the same values. Alternate pairs start with “Par not set”; they do not inherit the main pairing's par. A blank measured-distance field uses the rounded mapped route length and follows endpoint/bend changes. A measured distance stays fixed until “Use mapped distance” is selected.

Optional `StoredRoute.scoring` metadata contains `par` and `distanceOverride` in the existing version-1 tee/basket route JSON. Geometry edits retain it, and basket-ID remapping carries it through layout copies. The main pairing continues using the existing hole par/distance fields, mirrored in trunk metadata where available. Layout totals and event scoring keep their existing selected main pairing/slot; alternate route metadata does not rewrite published layout versions or past rounds.

Validation: 987 unit tests passed, plus an isolated local map-editor save/reload test with six routes (220 ft/par 3 and 600 ft/par 4 on the same tee), automatic-distance reset, and existing save-failure/hole-count tests. These checks use fake database responses and do not modify live course data.
