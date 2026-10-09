# Disc Golf Dashboard: Professional Course Design and Digital Course Builder

## Research, digital-twin requirements, and Codex implementation handoff

**Prepared for:** Michael Furst / Disc Golf Dashboard (DG Dashboard / SmartCaddy)  
**Prepared:** October 9, 2026  
**Document version:** 1.0  
**Purpose:** Preserve the course-design research and translate it into a practical reference for the Codex project **Disc Golf Dashboard**.  
**Status:** Research and proposed implementation requirements, not a codebase audit, completed implementation, engineering plan, or authorization to change production data.

---

## Read this first: how Codex should use this document

Use this document as the target capability reference for the existing application, not as an instruction to rebuild the app from scratch. First inspect the actual repository, existing database migrations, map editor, course/layout models, scoring flows, permissions, and tests. Identify what already exists, what is incomplete, and what needs to change. Proposed entity names and technology choices below are conceptual; adapt them to the existing architecture rather than creating competing systems.

Preserve existing courses, layouts, tournaments, scores, imports, player records, and rating behavior. Prefer additive migrations, tested compatibility adapters, feature flags, and reversible releases. Do not overwrite production data, change historical rounds, or replace working functionality merely to make the implementation match this document's terminology.

The initial priority is **accurate physical mapping, reusable branching fairways, and independent playable layouts**. Advanced 3D rendering comes later. Start with the repository audit and dependency map described in Appendix A.

### Evidence and scope

- **Published guidance and standards:** Identified with source references such as [S01]. These are not all mandatory regulations. Consult the applicable current document before implementation or construction.
- **Product requirements:** Proposed DG Dashboard behavior, unless explicitly identified as an existing user requirement.
- **Architecture:** A recommended approach, not a claim about code or tables currently present in the repository.
- **Accuracy:** A digital model can be accurate to a measured tolerance and observation date; it cannot promise a permanently exact representation of changing terrain and vegetation.
- **References:** Key PDGA, UDisc, USGS, GPS, mapping, and database references were checked while preparing this file. Dynamic documentation can change. The source register appears in Section 15.
- **Portable format:** Diagrams and checklists replace the chat's interactive-only presentation elements. This is an implementation-oriented consolidation, not a verbatim transcript.

## Contents

1. Professional standards and the system objective
2. What an accurate digital course must represent
3. Physical design specifications and measurements
4. Geographic capture, accuracy, and data sources
5. Branching and shared fairway networks
6. Course feature inventory and mapping behavior
7. Rules, regulated areas, and tournament configurations
8. Course development and construction lifecycle
9. Maintenance and course operations
10. Existing-platform lessons and interoperability
11. Recommended technical architecture and data model
12. Field-verification workflow
13. Automatic quality control and publication
14. Development roadmap and pilot validation
15. Source register

Appendix A. Codex repository audit and implementation safeguards  
Appendix B. Acceptance tests and regression scenarios  
Appendix C. Minimum field-capture data dictionary  
Appendix D. Suggested first message to Codex

---

## 1. Professional standards and the system objective

### 1.1 Product objective

DG Dashboard should do considerably more than place baskets and fairway lines on an aerial image. The goal is a **geographically grounded digital twin**: a versioned representation of the physical course, its playable configurations, and its operational condition.

A designer should eventually be able to plan a course digitally, use verified plans to support installation, record the actual installed course, and maintain the same underlying information throughout its life. A player should be able to identify the correct tee and target, understand the intended route and applicable rules, and navigate between holes.

The system should serve four audiences: course designers, landowners and maintenance teams, tournament directors, and everyday players.

### 1.2 The three-layer model

| Layer | Represents | Examples |
|---|---|---|
| Physical course | Features that exist at observed real-world locations | Tees, basket sleeves, installed targets, terrain, trees, paths, signs |
| Playable layouts | Configurations selecting and ordering physical features | Short tees to A positions; championship layout; temporary event holes |
| Course operations | Changes, condition, inspections, and administration | Basket moves, closures, storm damage, repairs, approvals, event setup |

A physical stream may remain unchanged while its treatment changes between layouts. A basket can move between permanent sleeves. A tournament can use a temporary tee without changing the everyday layout. These differences must be represented explicitly.

### 1.3 What PDGA guidance establishes

The PDGA publishes course-development guidance but states that it does not design or certify course installations. Its guidance emphasizes landowner requirements, visibility, multiple skill levels, balanced shot demands, vegetation protection, erosion reduction, and experienced design assistance. Approval of a specific installation remains a separate process. [S01]

For the product, translate those themes into six design goals: safety review, appropriate challenge, accurate measurements, intentional playing routes, clear navigation, and maintainable infrastructure. They should guide workflows without being presented as an automated engineering or legal certification.

Set par in relation to the intended skill level and selected tee/target configuration, not merely a permanent hole number. The PDGA provides skill-level and par guidance; course colors and player divisions must not be treated as interchangeable universal categories. [S02] [S03]

### 1.4 Professional-review boundary

The software should organize evidence and identify issues, not declare a course safe or legally compliant. Obtain site-specific review for land use, construction, drainage, accessibility, utilities, environmental protection, and other applicable requirements. Do not assume a sporting guideline grants an exemption from local requirements.

The PDGA's designer-selection guidance emphasizes relevant experience, references, mapping capabilities, and collaboration with experienced designers. [S04]

## 2. What an accurate digital course must represent

### 2.1 Course geometry

Represent tee footprints and throwing edges, target positions, fairway routes and corridors, landing zones, greens, walking routes, and important landmarks in real-world coordinates. Retain the difference between a point used for a map icon and the geometry used to measure a hole.

### 2.2 Terrain and elevation

Capture elevation at tees and targets, sampled route profiles, hillsides, ridges, valleys, creeks, drainage paths, and important slopes. Distinguish ground elevation from the height of an object above the ground.

Ground terrain is not a disc-flight trajectory. A 3D terrain-draped route can support visualization and measurements but does not predict how a disc will fly.

### 2.3 Vegetation and obstacles

Represent significant trees, trunks, crowns, wooded boundaries, undergrowth, fences, buildings, and other features affecting play. Record whether geometry was measured, interpreted from imagery, or estimated.

For a practical first release, prioritize obstacles that determine the playing route instead of requiring an exhaustive inventory of every tree. Later stages can add detailed canopy and 3D vegetation models.

### 2.4 Rules and configurations

Represent OB boundaries, hazards, mandatory restricted spaces, drop zones, required relief areas, temporary event changes, and the exact tee/target assignments used for each layout.

A geographic feature and a rule applied to that feature are different records. This prevents ordinary woods, a mown edge, or a body of water from automatically becoming OB.

### 2.5 Time and provenance

Every important feature should answer:

- What is it, and where is it?
- How was it measured, by whom, and with what uncertainty?
- When was it observed, and when did the change take effect?
- Which layouts and rounds used this version?
- Is it proposed, installed, active, removed, temporarily unavailable, or historical?

The information must support measurements, editing, validation, reuse, caddie books, scoring, navigation, and long-term comparisons. It should not exist only as decorative drawing instructions.

## 3. Physical design specifications and measurements

### 3.1 Published design guidance

The following are planning references, not universal construction requirements. [S02]

| Component | Published reference | Information the app should record |
|---|---|---|
| Longer tee pads | Typical dimensions: 6 x 13 ft | Surveyed footprint, surface, orientation, throwing edge |
| Rectangular tee pads | Recommended minimum: 4 x 10 ft | Actual dimensions and any site-specific exception |
| Tee surroundings | At least a 2 ft apron | Run-up and follow-through space, adjoining grade |
| Wooded fairways | Examples range from 15 ft constrictions to 40 ft wider portions | Variable corridor widths; these are not safety buffers |
| Course size | Commonly 9 or 18 holes; other counts are possible | Flexible ordering and display labels |
| Target categories | Basic, Standard, Championship | Exact model and approval reference |
| Target rim height | Manufacturing guidance: 82 cm, tolerance +/-6 cm | Actual installed height and ground reference |
| Hole length | Intended route from the tee front to the target | Endpoint convention, route, measurement method |
| Signs | Hole, distance, par, direction, target identification | Sign asset, content, location, revision |

Do not interpret the target-height reference as proof that every real installation outside that range is prohibited. Store elevated or lowered installations explicitly and check current technical and event standards when relevant. The PDGA technical-standards page is the authoritative starting point for equipment specifications and approval documents. [S05]

### 3.2 Separate distance concepts

One distance field is not enough. Recommended measurements for each playable tee-to-target configuration are:

| Measurement | Meaning | Main use |
|---|---|---|
| Direct horizontal distance | Horizontal/geodesic distance between defined endpoints | Geographic reference |
| Intended-route horizontal distance | Sum along the selected route through doglegs | Course map and designed hole length |
| Terrain-following 3D distance | Route segments including sampled elevation changes | Terrain analysis; not a flight simulation |
| Net elevation change | Target ground elevation minus tee ground elevation | Uphill/downhill context |
| Cumulative ascent/descent | All rises and falls along the sampled route | Terrain profile and walking context |
| Effective length | A difficulty-oriented estimate | Design analysis, separately labeled |
| Official published distance | Designer/TD-approved displayed value with provenance | Signs, event material, historical records |

Do not silently replace official distance with a computed value, or move accurate geometry simply to force agreement with an old sign. Keep both values and flag discrepancies for review.

### 3.3 Elevation-adjusted effective length

PDGA skill-level guidance gives an approximate adjustment of three times the tee-to-target elevation change, added uphill and subtracted downhill. It notes that steeper slopes can require different judgment. This is a planning approximation, not an official replacement for measured distance or a universal physics formula. [S03]

```text
Illustrative effective length = measured length + 3 x net elevation change

300 ft measured distance + 3 x 20 ft uphill = approximately 360 ft effective length
```

Store the formula version, inputs, and units. Never substitute the effective length for the true distance without clear labeling. Identical endpoint elevations can hide very different valley or ridge profiles, so retain intermediate elevation samples.

### 3.4 Measurement implementation requirements

Use consistent base units internally, proposed as meters. Record display units separately. Define the tee's throwing edge and a repeatable measurement point on that edge rather than measuring from an arbitrary icon center. Record target ground position separately from basket-rim height.

Use geodesic calculations or an appropriate projected coordinate reference system. PostGIS distinguishes Cartesian geometry lengths from spheroidal geography lengths; its geography length result is in meters. Latitude/longitude degrees must not be treated as feet or meters. [S20]

## 4. Geographic capture, accuracy, and data sources

### 4.1 Accuracy is a measured property, not a visual impression

Aerial imagery provides context, but an attractive alignment is not proof of a surveyed location. GPS.gov identifies reception conditions and obstructions as factors affecting real-world positioning. Consumer phone coordinates should not be treated as survey control or a definitive basis for a close OB ruling. [S18]

A high-quality digital course needs multiple sources and field verification. Do not claim centimeter accuracy merely because an RTK receiver, drone, or detailed image was used; retain the actual quality evidence and reference system.

### 4.2 Recommended data sources

| Source | Proposed use | Qualification to preserve |
|---|---|---|
| High-resolution aerial imagery | Context, roads, clearings, visible infrastructure | Capture date, resolution, alignment, rights |
| Ground-elevation models | Contours, slope, route profiles | Source resolution, vertical accuracy, datum, gaps |
| LiDAR point clouds | Ground and potential canopy/structure interpretation | Classification, acquisition date, quality metadata |
| Phone GPS | Initial field observations and rough mapping | Reported accuracy and capture conditions |
| Survey-grade GNSS/RTK or total station | High-confidence control and asset measurements | Survey method, quality checks, coordinate system |
| Ground photography | Confirming objects, conditions, and labels | Date, location, direction, photographer |
| Authorized drone photogrammetry | Orthomosaics and site documentation | Permissions, control/checkpoints, processing quality |
| Existing plans and as-built drawings | Design intent and installed conditions | Revision, date, author, status |
| Parcel/land-management GIS | Planning context and restrictions | Source authority; do not equate with a boundary survey |

USGS describes 1 m LiDAR-based elevation data within its elevation services where available. Its published FAQ gives approximately 0.53 m overall RMSE for the dynamic elevation service while emphasizing substantial local variation. That number is an aggregate, not a guaranteed error bound for every course, pixel, or LiDAR project. [S16]

USGS also states that interpolated Elevation Point Query Service values are not precisely ground-surveyed measurements. [S17]

### 4.3 Proposed capture and verification categories

| Status | Meaning | Publication treatment |
|---|---|---|
| Unverified | Imported, estimated, or visually placed | Show uncertainty; do not imply survey accuracy |
| Field-checked | Confirmed during a site visit | Record observations and remaining uncertainty |
| Survey-verified | Supported by documented survey/control evidence | Preserve source record and verification authority |

These statuses are not numeric accuracy classes. Keep a separate numeric uncertainty field where justified, including the confidence convention used. Unknown uncertainty should remain unknown, not become zero.

### 4.4 Required provenance

For significant geometry, store source identifier, capture method, observation timestamp, import timestamp, author, horizontal and vertical reference systems, accuracy estimates, verification status, supporting photographs, and licensing/attribution information.

Retain original coordinates and their reference system alongside normalized application coordinates when importing survey data. Do not mix ellipsoidal and ground-referenced elevation values without a documented transformation.

### 4.5 Georeferencing screenshots and plans

For imported screenshots or unreferenced drawings, require control points or another documented transformation to align image pixels with real-world coordinates. Keep the transformation, control-point evidence, and residual/alignment assessment.

Dragging an image beneath already verified course features must not move those features. Keep the basemap, its transform, and course geometry separate. Warn before replacing higher-confidence geometry with a lower-confidence edit.

## 5. Branching and shared fairway networks

### 5.1 Why simple tee-to-basket lines are insufficient

DG Dashboard needs to represent tees that begin separately, merge into a shared playing corridor, and split again toward multiple basket placements. Duplicated polylines produce overlapping drawings, inconsistent edits, and incorrect distance calculations.

The desired structure is a graph of nodes and reusable edges, with explicit route definitions identifying which edges each tee-to-target pairing uses.

### 5.2 Portable network example

```text
Blue tee ---- blue approach ----\
                                M ===== shared corridor ===== J ---- branch A ---- Position A
Red tee ----- red approach -----/                              \
                                                               ---- branch B ---- Position B

M = merge node
J = branch node
The shared corridor is one stored physical edge, referenced by multiple routes.
```

For this example, both tees can have routes to both positions. This does not mean every tee on every course must automatically connect to every target. Let the manager define a compatibility matrix and explicitly exclude unsafe, unavailable, or unintended pairings.

### 5.3 Existing user requirements to preserve

The following reflect the course-builder behavior discussed for DG Dashboard:

1. Tee colors should be configurable at the course level and inherited consistently.
2. Each tee has its own route connections.
3. Fairways should support shared sections used by multiple tee colors.
4. Shared fairways should display a combined dotted treatment using their participating tee colors.
5. Moving a fairway control point near another compatible point should offer a merge action.
6. The user must be able to keep routes side by side instead of merging.
7. After merging, there should be one shared downstream segment, not a shared segment plus leftover single-color duplicates.
8. Several fairways should be able to merge and split again toward different basket placements.
9. For the multi-pin configuration discussed, each intended tee should connect through the network to every available, approved basket placement.

### 5.4 Recommended behavior

| Operation | Required behavior |
|---|---|
| Snap preview | Indicate a compatible nearby node/edge and show the proposed action |
| Merge | Reuse common geometry; update all affected route references atomically |
| Merge into edge | Split the destination edge at the attachment point before linking |
| Shared edit | Identify all dependent routes; modify the shared geometry once |
| Split/unmerge | Create the intended independent branch without damaging other routes |
| Add basket position | Offer valid route connections; do not fabricate approved playability |
| Delete route | Remove route membership; preserve edges still used elsewhere |
| Delete shared edge | Block, or explicitly repair all affected routes before publication |
| Undo/redo | Restore topology, memberships, geometry, and calculated values together |

Proximity should offer a merge, not silently create one. A configurable screen-space preview tolerance can assist interaction, while a documented ground-distance rule determines whether the operation is acceptable. Visual crossings do not automatically mean two routes are connected.

### 5.5 Graph and route invariants

Every route is an ordered, continuous path from the selected tee to the selected target position. Store explicit edge membership; do not infer routes only from the shortest path through the graph.

A route should not contain accidental cycles, disconnected segments, or repeated edges. The global graph need not be forced into a tree: multiple valid alternatives can exist. A shared segment's length is counted once per traversal in a route, not once per participating tee.

The display renderer should draw the unique active physical edges and derive shared styling from route memberships. It should not draw both the complete individual routes and the merged route on top of each other.

Use labels, patterns, and selection states in addition to color. Do not make color the only way to identify a route.

### 5.6 Benchmark finding

UDisc's Map Manager documentation states that a tee-to-target pairing can have only one fairway. Its fairway-editing documentation states that permanent mapped OB, mando markers, and drop-zone locations are not supported as fixed Map Manager elements. These are documented differentiation opportunities, not evidence about UDisc's internal implementation. [S13] [S14]

## 6. Course feature inventory and mapping behavior

### 6.1 Recommended feature inventory

| Feature | Geometry | Required attributes and behavior |
|---|---|---|
| Tee | Point plus footprint polygon/throwing edge | Tee set, name, color, dimensions, bearing, material, condition |
| Basket position/sleeve | Point | Stable location ID, label, ground elevation, availability |
| Physical target asset | Asset record plus dated placement | Manufacturer, model, approval reference, condition, installed height |
| Fairway centerline | Network edges | Merge/split topology, route memberships, measurement role |
| Fairway corridor | Polygon | Width variation, maintained edge, relation to route |
| Landing zone | Polygon | Intended shot sequence, target skill level, description |
| Green | Polygon or measured outline | Slope, obstacles, approach context |
| Tree | Trunk point/footprint and optional crown | Species if known, height, trunk size, condition, confidence |
| Woods/rough | Polygon | Density, foliage, seasonal condition, observation date |
| Water | Line/polygon | Physical extent, seasonal state, separately assigned rules |
| OB boundary | Line/polygon with explicit side/extent | Rule source, vertical interpretation, applicability |
| Hazard | Polygon | Rule assignment and scope |
| Mandatory | Directed boundary/restricted-space definition | Orientation, geometry, vertical extent if specified, drop zone |
| Drop zone | Point plus tee/lie geometry where appropriate | Associated rule, permitted/required use, conditions |
| Required relief area | Polygon | Relief procedure and designated continuation |
| Walking trail | Connected line network | Access, direction, surface, grade, steps, closures |
| Road/parking | Line/polygon | Public-use context, entry, crossings, safety review |
| Structures | Point/polygon | Fence, building, bridge, steps, bench, signage |
| Terrain | Raster/mesh and metadata | Datum, resolution, date, no-data areas, profiles |
| Notice/closure | Geotagged record | Scope, reason, authority, start/end, public visibility |
| Practice facilities | Independent features | Practice basket, warm-up area, putting zone; no fake scored hole required |

### 6.2 Distinguish physical positions from equipment

A permanent sleeve or named pin position is not the same entity as the basket installed there. One target asset may move between positions, and multiple targets may be installed simultaneously. Represent placements with effective dates instead of moving one point and losing its history.

A layout can mean either "play this named position" or "follow the current placement of this target." Make that choice explicit. Before scoring starts, resolve any dynamic assignment into an immutable position/version reference.

### 6.3 Separate fairway edges from penalties

A mowing boundary or wooded edge is a physical observation, not automatically an OB line. An OB designation must be attached through a rule assignment. Likewise, a navigation trail is not a recommended throwing line, and a recommended fairway is not automatically the only legal flight path.

### 6.4 Accessibility, navigation, and emergency information

Proposed fields include trail width, surface, slope, steps, gates, obstacles, restroom access, parking, emergency vehicle access, and relevant contacts. Record verified conditions and dates rather than assigning unsupported accessibility guarantees.

Keep sensitive operational records, private contact information, and restricted infrastructure layers out of public maps unless explicitly approved.

## 7. Rules, regulated areas, and tournament configurations

### 7.1 Rulebook scope

The reviewed official PDGA rules page identifies the January 1, 2026 revision. Store rulebook version and applicable event configuration rather than assuming rule behavior is timeless. [S06]

The table below summarizes distinctions for modeling. It is not a complete ruling procedure.

| Type | Penalty/continuation summary | Reference |
|---|---|---|
| Out of bounds | One penalty throw; continue using an authorized OB option | [S07] |
| Hazard | One penalty throw when the position is clearly and completely surrounded; hazard itself does not grant relocation | [S10] |
| Casual area | Qualifying relief is without penalty under the applicable conditions | [S08] |
| Required relief area | Must take the prescribed relief; no penalty under the rule | [S09] |
| Missed mandatory | One penalty throw and continuation as specified by the mandatory rule | [S11] |

OB boundary lines are part of the OB area under the reviewed rule. Store applicable boundary semantics, but do not allow an arbitrary UI toggle to silently contradict a selected official ruleset. The OB rule also governs relief options and cases requiring prior approval for restrictions. [S07]

### 7.2 Rules-editor requirements

For each assignment, retain the regulated geometry, physical boundary description, rule type, governing rule/version, effective dates, relevant hole/tee/target/layout/event/round, and plain-language explanation.

Represent drop-zone behavior explicitly: optional or required, triggering event, penalty, fallback, and any approval evidence. Keep mandatory restricted-space geometry separate from decorative arrows drawn on the map.

Rule combinations, islands, and intersecting areas should trigger human review where their effects conflict or are underspecified. Preserve free-text official instructions alongside structured fields until the structured model can express the complete rule.

### 7.3 Rule scope and inheritance

Recommended scope order is explicit course defaults, configuration-specific assignments, layout overrides, and event/round overrides. The system must show the resulting effective ruleset and explain which overrides apply.

Do not let an override silently erase an unrelated rule. Require a deliberate replace/extend action and validation when merging rule sets. Freeze the resolved rules in the scored round's snapshot.

### 7.4 Do not automate close rulings from a map

The app can explain a boundary, record a player-entered ruling, and help locate a drop zone. It should not claim that a phone position definitively establishes whether a disc is in or out. Positioning uncertainty is material. [S18]

Treat player/group/official decisions as explicit inputs. Any future rule-assistance feature needs rule-specific tests, transparent uncertainty, and an escalation path for ambiguous situations.

## 8. Course development and construction lifecycle

The following is a proposed project workflow, not a site-specific construction specification. PDGA guidance supports professional design assistance, attention to site requirements, and environmental care. [S01] [S04]

### Stage 1: Feasibility and authorization

Collect ownership and operator information, landowner authorization, parcel context, existing recreation uses, access, potential restrictions, preliminary budget, expected users, and project goals. Identify the authorities and qualified reviewers needed for construction, accessibility, utilities, drainage, wetlands/floodplain questions, tree work, and environmental impacts.

Do not hardcode a universal acreage-per-hole requirement. Record usable land, exclusions, separation needs, and the designer's rationale. A smaller well-designed course is preferable to assuming an arbitrary hole count must fit.

**Digital output:** Site dossier, constraints layers, approval register, preliminary budget, project roles.

### Stage 2: Site survey and baseline inventory

Capture terrain, drainage, significant vegetation, existing structures, trails, roads, and no-disturbance areas. Record survey control, coordinate systems, measurements, and source evidence. Identify maintenance and construction access.

**Digital output:** Baseline map with provenance, field photographs, terrain sources, feature inventory.

### Stage 3: Preliminary design

Develop alternative routes and tee/target arrangements. Define intended skill levels, shot shapes, landing areas, transitions, and possible alternate configurations. Consider playability, visibility, natural obstacles, navigation, and maintenance demands.

**Digital output:** Versioned alternatives, selected routes, design notes, review issues, estimated quantities.

### Stage 4: Safety review and playtesting

Walk the site and test representative lines with players of different abilities. Evaluate blind approaches, nearby public uses, expected misses, adjoining holes, gathering areas, and walking transitions.

Rules and signs do not physically contain errant discs. Do not treat an OB line or mandatory as proof that an otherwise conflicting route is safe. The PDGA design guidance cautions against relying on regulated routes or areas to eliminate interference. [S02]

**Digital output:** Dated review records, issues, test observations, changed designs, responsible reviewers.

### Stage 5: Final design and installation planning

Produce the approved feature schedule, proposed locations, quantities, materials, construction sequencing, access plan, and work responsibilities. Obtain applicable utility locates and permissions before disturbance. Specify tee foundations, drainage, basket foundations/sleeves, and other construction details through qualified site-specific design and manufacturer requirements, not generic generated dimensions.

**Digital output:** Approved plan version, asset schedule, procurement register, work packages, inspections, change orders.

### Stage 6: Construction and as-built verification

Record installation progress and deviations. Survey or field-verify the actual installed locations. Capture dimensions, condition, photographs, manufacturer information, and acceptance records. Preserve the distinction between proposed geometry and installed geometry.

**Digital output:** As-built version, discrepancies resolved or documented, accepted assets, publication candidate.

### Stage 7: Commissioning and ongoing operation

Check navigation, signs, rules, active positions, emergency information, and maintenance ownership. Publish an approved layout with an observation date and known limitations. Keep draft construction and sensitive operations layers separate from public player views.

**Digital output:** Published course and layouts, maintenance plan, inspection schedule, operational contacts, historical baseline.

### Budget model to support later

Use locally obtained quotations rather than unsupported per-hole price promises. Proposed categories are design/survey, permissions, clearing, grading/drainage, tees, targets/sleeves, signs, paths/bridges, accessibility improvements, equipment, labor, contingency, and recurring maintenance. Record estimates, quotes, commitments, and actual costs separately.

## 9. Maintenance and course operations

### 9.1 Operational goal

The map should remain useful as conditions change. Tie inspections and work orders to physical feature IDs, not just hole numbers or unstructured notes.

PDGA maintenance guidance identifies differing upkeep for wooded and open areas, trimming, mowing, and wear around tees. Its Throw Green material highlights erosion and compaction near heavily used areas and slopes, vegetation loss, and the value of clear walking routes. [S12] [S22]

### 9.2 Proposed 15-item maintenance checklist

Frequency below is a configurable starting point, not a published universal inspection standard. Severe weather, public use, season, and local policy should determine actual scheduling.

| # | Suggested timing | Check/task | Record |
|---|---|---|---|
| 1 | Before opening/event; after storms | Review urgent hazards and access closures | Location, severity, action, notification |
| 2 | Routine site walk | Inspect tee surfaces for debris, damage, and traction | Condition, photographs, work order |
| 3 | Routine site walk | Inspect tee aprons, run-up space, and worn edges | Trip hazards, erosion, repair needs |
| 4 | Routine site walk | Inspect baskets, chains, fasteners, and stability | Asset ID, defect, manufacturer guidance |
| 5 | Every basket move | Confirm active basket placements and labels | From/to position, timestamp, manager |
| 6 | Routine/event preparation | Check tee signs, next-tee directions, and course board | Missing/damaged items, content revision |
| 7 | Before event/rules change | Verify physical OB, mando, and drop-zone markings | Official instructions, discrepancy report |
| 8 | Seasonal/as needed | Mow approved areas and maintain intended corridors | Area, date, scope, responsible crew |
| 9 | Seasonal/as needed | Review vegetation growth and authorized trimming | Tree/area ID, approval, before/after |
| 10 | After major rain; routine | Inspect drainage, standing water, and erosion | Extent, photographs, closure/repair |
| 11 | Routine/seasonal | Inspect heavily used greens, trails, and exposed roots | Condition, mitigation, follow-up |
| 12 | Routine/site-specific | Inspect bridges, stairs, gates, and other structures | Defect, qualified review if needed |
| 13 | Routine/event preparation | Check litter, waste facilities, and amenities | Task completion, service needs |
| 14 | Every material physical change | Compare installed conditions with the digital map | Proposed revision and affected layouts |
| 15 | Periodic management review | Review unresolved work, costs, incidents, and priorities | Owner, deadline, budget, verification |

### 9.3 Work-order schema

Each maintenance record should support feature/hole references, geotagged photographs, author, assigned worker/team, inspection date, priority, due date, status, repair description, materials, labor/cost, completion evidence, and reviewer.

Separate a player's damage report from a verified inspection. Keep incident reports and sensitive information appropriately restricted.

### 9.4 Maintenance-to-map workflow

A completed work order can create a proposed map revision when a feature's location, availability, geometry, or condition changes. Publishing that revision requires the relevant course administrator's approval.

Trimming a corridor, removing a tree, relocating a target, or closing a bridge can affect play and navigation differently. Update the appropriate layer rather than replacing the entire course record.

Seasonal conditions should have observation/effective dates. Do not permanently rewrite a shoreline or a tree canopy from a temporary observation without labeling the nature of the change.

## 10. Existing-platform lessons and interoperability

### 10.1 UDisc comparison

The reviewed UDisc documentation separates physical map management from layout composition and documents shared fairway edits, doglegs, layout-specific overrides, and temporary/safari configurations. This validates the usefulness of separating physical features from how a round uses them. [S13] [S14] [S15]

The comparison is limited to reviewed public documentation, not an exhaustive product test.

| Capability | What the reviewed UDisc material establishes | Proposed DG Dashboard approach |
|---|---|---|
| Tees, targets, and layouts | Physical mapping and layout assembly are distinct | Preserve this separation |
| Par and doglegs | Supported; layout par overrides; shared dogleg geometry | Support explicit configuration and versioning |
| Same tee/target, multiple routes | One fairway per pairing | Support explicit alternate route definitions |
| Permanent mapped OB/mando/drop zones | Not supported as fixed Map Manager elements in reviewed article | Structured geometry and rule assignments |
| Partial shared branching network | Not established in reviewed material | Reusable graph edges across routes |
| Walking-path editing | Not established by this source set | Independent navigation network |
| Survey provenance | Not established by this source set | Accuracy and evidence on mapped features |
| Construction/maintenance workflows | Not established by this source set | Proposed operational modules |
| Immutable scored-round geometry | Not established by this source set | Required historical snapshots |

Do not translate "not established" into "the competitor cannot do this." Recheck documentation before making external comparisons. [S13] [S14] [S15]

### 10.2 Geographic interoperability

The OpenStreetMap disc-golf documentation describes tags including tees, baskets, holes, and other course features. Treat OSM as a useful exchange/mapping reference, not as a complete representation of DG Dashboard's rules and versioning model. [S19]

RFC 7946 defines GeoJSON coordinates using WGS84 longitude and latitude in decimal degrees. Do not emit projected meter coordinates as ordinary RFC 7946 GeoJSON. Transform at the import/export boundary and preserve richer survey metadata separately. [S21]

Recommended exchange capabilities are GeoJSON first, followed by GeoPackage and suitable survey/field formats when justified. Keep stable IDs, source metadata, units, and a schema version in exports. Provide a clear report when an export format cannot preserve topology, rules, or historical versions.

### 10.3 Licensing and provider boundaries

Retain licensing and attribution requirements for imagery, basemaps, imported mapping, elevation, and photographs. Public visibility is not automatic permission to copy or redistribute content. Verify a provider's terms before implementing bulk downloads, offline tile packages, or derivative-data sharing.

Map rendering, basemap supply, geocoding, terrain hosting, and storage are separate operational dependencies. Do not assume an open-source renderer makes every data source or hosted service free.

## 11. Recommended technical architecture and data model

### 11.1 Architecture overview

The preceding project discussion described a Supabase-backed application. That context is not a repository inspection. Verify the current stack and preserve working components before adopting the proposal below.

```text
Course Builder and Field Capture
  2D editing | optional 3D terrain | imagery | validation | offline drafts
                         |
                         v
Geospatial and Topology Services
  coordinate transforms | measurements | graphs | elevation | spatial validation
                         |
                         v
Layouts, Rules, and Publication Services
  physical features | configurations | effective rules | immutable snapshots
                         |
                         v
Existing PostgreSQL/Supabase Architecture, if confirmed
  versioned spatial records | assets | permissions | audit history | media
                         |
                         v
Application Consumers
  live scoring | digital caddy | caddie books | events | statistics | maintenance
```

### 11.2 Proposed implementation choices

| Concern | Recommended direction |
|---|---|
| Map UI | Keep a suitable existing renderer; MapLibre GL JS is one candidate [S23] |
| Spatial storage | PostgreSQL with PostGIS where compatible with the actual stack |
| Distance and geometry | Authoritative server calculations; responsive client previews |
| Interchange | RFC 7946 GeoJSON at boundaries; richer internal model [S21] |
| Survey systems | Preserve original CRS/datum and explicit transformations |
| Terrain | Source-tracked raster/mesh, sampled profiles, no-data handling |
| Media | Existing secure object-storage approach, with provenance and permissions |
| Authorization | Existing authenticated roles plus course-scoped read/write/publish permissions |
| Versioning | Immutable published geometry/rule references and auditable drafts |
| Offline work | Local draft queue, explicit conflicts, resumable media upload |

Do not add a new vendor, paid service, map stack, or parallel database solely because it appears in this table. Compare the installed architecture, licensing, operational cost, and testability first.

### 11.3 Recommended conceptual entities

These are conceptual names, not a migration script.

| Entity | Purpose |
|---|---|
| `courses` | Identity, operator, location, public information |
| `course_versions` | Draft, published, and historic course states |
| `tee_sets` | Course-wide names/colors and default presentation |
| `physical_features` | Tees, sleeves/positions, trees, structures, trails, signs |
| `feature_geometry_versions` | Geometry revisions and measurement provenance |
| `target_assets` | Physical baskets/equipment independent of positions |
| `target_placements` | Dated assignment of target assets to positions |
| `fairway_nodes` | Endpoints, merge points, branch points |
| `fairway_edges` | Reusable geographic segments |
| `fairway_routes` | Approved ordered paths for tee/target pairings |
| `fairway_route_edges` | Ordered edge memberships and direction |
| `layouts` / `layout_versions` | Named configurations and their revisions |
| `layout_holes` | Order, label, tee, target, route selection, par |
| `regulated_areas` | Rule-associated spatial definitions |
| `rule_assignments` | Scope, version, dates, conditions, official instructions |
| `terrain_sources` | Elevation data and quality metadata |
| `maintenance_records` | Inspection, work, cost, evidence |
| `verification_records` | Review, survey evidence, approval, discrepancies |
| `round_layout_snapshots` | Immutable resolved configuration for scored rounds |

Use stable IDs rather than visible labels as relationships. Labels such as "8A," "Blue," and "Position B" can change without changing the identity of an object.

### 11.4 Versioning and historical correctness

Keep the following separate:

- A correction to a previously inaccurate map.
- A real physical course modification.
- A layout or tournament rule change.
- A temporary condition or closure.

Record why a revision occurred and its effective date. Preserve earlier published versions even when the new version is more accurate. Any historical-data correction must be explicit, justified, and independently auditable.

A scored round should resolve the exact course/layout version, hole order, tee position, target position, route/distance reference, par, effective rules, and relevant event overrides. Renaming a hole or moving a basket must not change the meaning of a completed scorecard.

This is also a proposed foundation for more reliable DGD difficulty comparisons. Do not silently rerun rating models or alter imported PDGA/UDisc records as a side effect of map editing.

### 11.5 Offline and concurrent editing

Use client-generated operation IDs and version checks so retries do not duplicate geometry. Preserve pending work after refresh or connection loss. Detect competing edits instead of using silent last-write-wins behavior for verified or shared features.

An offline device should display its last synced map version and any known stale-state warning. Emergency closure notices and operational alerts may need separate delivery from immutable scoring geometry.

### 11.6 Performance and operating cost

Proposed controls include spatial indexes, viewport-scoped fetching, simplified display geometry at low zoom, caching by immutable version, background generation of derived previews, and separate storage of dense terrain from ordinary course records.

Set and measure performance targets after inspecting current data and devices. Do not invent benchmark claims. Keep observability for failed saves, slow map interactions, geometry validation failures, synchronization conflicts, and permission denials.

## 12. Field-verification workflow

### Step 1: Prepare

Load authorized imagery, terrain data, existing plans, and known control. Confirm coordinate and elevation reference systems. Establish expected accuracy and the intended use of the survey. Download permitted offline resources where needed.

### Step 2: Capture permanent features

Visit tees, basket positions, installed targets, significant obstacles, trails, permanent boundaries, and signs. Record coordinates, dimensions, photographs, labels, methods, timestamps, and uncertainties. Keep target positions distinct from target assets.

### Step 3: Map playing and walking routes

Record intended fairways, doglegs, landing zones, shared sections, and branches. Define approved tee-target pairings. Map next-tee walking routes independently. Document unavailable or intentionally excluded pairings.

### Step 4: Reconcile measurements

Compare computed distances, published signage, field measurements, and plans. Investigate material discrepancies without automatically overwriting more trustworthy information. Check profile sampling and no-data areas before presenting elevation-dependent results.

### Step 5: Verify rules and current conditions

Match digital regulated areas to physical markers and official instructions. Confirm current targets and all selected layout assignments. Note missing or ambiguous markings for manager review.

### Step 6: Review and publish

Complete hole-by-hole review of geometry, routes, rule explanations, navigation, and displayed values. Publish a dated version while preserving its predecessor. Publicly show meaningful confidence and observation information without exposing sensitive evidence.

### Completeness versus confidence

A course can have every required field populated and still have uncertain geometry. Track coverage/completeness separately from accuracy and verification. Do not require a full tree inventory before a usable player map can exist, and do not advertise a complete map as fully surveyed.

## 13. Automatic quality control and publication

### 13.1 Structural checks

Before a new layout version becomes playable, check that each selected hole has a valid tee, valid target position, connected approved route, assigned par, unique ordering, and resolvable rules. Permit unplayed draft features to remain incomplete without blocking unrelated published layouts.

Confirm required tee labels and course-wide defaults. Detect broken references, missing version records, unexpected null geometry, invalid polygons, and inconsistent units.

### 13.2 Fairway checks

Detect dangling route segments, zero-length edges, accidental duplicate geometry, discontinuous route ordering, and unexpected endpoints. Verify that merging or splitting updates every dependent route and that display styling matches active memberships.

Do not merge intersecting geometry automatically. Do not require an entire course network to be acyclic when valid route alternatives exist; validate the actual playable paths.

### 13.3 Measurement and rule checks

Flag surprising distances, elevation discontinuities, mismatches between computed and official values, rules lacking descriptions or scope, drop zones without triggering conditions, and invalid mandatory geometry.

Distinguish a warning requiring review from a blocking error. A warning threshold is not a sporting rule or proof of invalid design.

### 13.4 Impact analysis

Before publication, show affected layouts, future events, digital caddie books, maintenance plans, and cached maps. Existing scored rounds must stay on their resolved snapshots.

A scheduled event may need an explicit decision to adopt a new version. An in-progress round should not silently switch configurations because an administrator edited the course.

### 13.5 Safety-review aids

Proposed checks can highlight proximity or apparent conflicts among fairways, public paths, roads, playgrounds, parking, neighboring property, and gathering areas. These are prompts for qualified human review, not safety certification.

Model sightlines and plausible miss areas only with clear assumptions and evidence. Avoid a single universal buffer radius presented as a guarantee.

### 13.6 Publication states

Recommended states are draft, validation needed, ready for review, approved, published, superseded, and archived. Separate a feature's physical availability from its publication state.

Keep publishing atomic: users should not receive a mixture of old geometry, new rules, and partially updated routes. Keep rollback possible through version selection rather than destructive history replacement.

## 14. Development roadmap and pilot validation

### Phase 1: Accurate physical mapping

Stabilize panning, zooming, selection, mobile gestures, imagery alignment, coordinate capture, persistent tees/targets, course-wide tee colors, undo/redo, and save recovery. Establish stable identities, basic version boundaries, and compatibility with existing data early.

**Completion evidence:** Reliable create/edit/save/reload behavior; no accidental movement of verified geometry; no regressions in existing course and scoring workflows.

### Phase 2: Branching fairway architecture

Implement explicit nodes, reusable edges, ordered routes, merge preview, edge splitting, multi-tee shared styling, multi-pin branches, safe deletion, and route-aware distances.

**Completion evidence:** All topology regression scenarios in Appendix B pass, including the original duplicate-after-merge problem.

### Phase 3: Rules and professional layouts

Add scoped OB, hazards, mandatory restricted spaces, drop zones, required relief, layout overrides, event configurations, and caddie-book outputs. Resolve immutable snapshots before any new scoring flow uses the revised model.

**Completion evidence:** Correct visible effective rules and stable historical round configurations.

### Phase 4: Survey and terrain intelligence

Add survey imports, reference-system handling, elevation sources/profiles, important obstacle mapping, offline field capture, and evidence-based verification.

**Completion evidence:** Measured control checks, documented error handling, correct units/datums, and no implied accuracy beyond source evidence.

### Phase 5: Course operations and historical management

Extend foundational versioning with inspections, work orders, condition changes, closures, target-placement history, approval workflows, and operations reporting.

**Completion evidence:** A real maintenance change can be tracked, reviewed, reflected in a new map version, and kept separate from earlier rounds.

### Phase 6: Advanced digital twin

Add optional 3D terrain/vegetation, design visualization, evidence-based shot-corridor analysis, and richer course difficulty research. Separate observed geometry from modeled assumptions.

**Completion evidence:** Demonstrated accuracy and practical user value, not merely a more elaborate rendering.

### Pilot recommendation

Use a familiar course such as Rogers Lakewood or Countryside Park as a proposed field-validation pilot, subject to access and administrator permission. Do not assume either course has already been surveyed for this project.

Test multiple tees, multiple target positions, shared corridors, branches, elevation, temporary tournament rules, next-tee navigation, and maintenance changes. Compare the digital model with field observations and preserve a discrepancy log.

### Final product recommendation

Treat the versioned course model as the shared geographic source for layouts, tournaments, live scoring, navigation, caddie books, maintenance, and DGD analysis. Do not let each feature build its own conflicting copy of the course.

The initial product value comes from accurate features, reliable shared fairways, and clear layout selection. Build those foundations before investing in advanced simulations or visual polish.

## 15. Source register

References below are primary organization documentation or official technical specifications. Descriptions summarize their relevance, not a claim that every recommendation in this file is prescribed by the source. PDGA material is the sporting/design reference; local authorities and qualified professionals determine site-specific requirements.

| ID | Source | Use in this brief |
|---|---|---|
| S01 | [PDGA: Course Design and Development][S01] | Design goals; limits of PDGA installation certification |
| S02 | [PDGA: Course Design Elements][S02] | Tees, targets, route measurements, signage, par, interference |
| S03 | [PDGA: Player Skill Level Guidelines][S03] | Skill-oriented design and approximate effective length |
| S04 | [PDGA: Choosing a Course Designer][S04] | Experience, references, professional design review |
| S05 | [PDGA: Technical Standards][S05] | Equipment standards and linked approval documents |
| S06 | [PDGA: Official Rules of Disc Golf][S06] | Governing rulebook and revision context |
| S07 | [PDGA 806.02: Out-of-Bounds][S07] | OB definition, boundaries, penalties, relief |
| S08 | [PDGA 806.03: Casual Area][S08] | Casual-area relief |
| S09 | [PDGA 806.04: Required Relief Area][S09] | Mandatory relief without penalty |
| S10 | [PDGA 806.05: Hazard][S10] | Hazard treatment |
| S11 | [PDGA 804.01: Mandatory Routes][S11] | Restricted-space and missed-mandatory treatment |
| S12 | [PDGA: Throw Green][S12] | Erosion, compaction, and environmental management |
| S13 | [UDisc: What is Map Manager?][S13] | Map/layout separation and one fairway per pairing; dated Aug. 21, 2026 in reviewed page |
| S14 | [UDisc: Editing Fairways in Map Manager][S14] | Doglegs, shared edits, rule notes, fixed map-element limits; dated Aug. 27, 2026 in reviewed page |
| S15 | [UDisc: Mapping and Layouts][S15] | Course-management workflow reference collection |
| S16 | [USGS: Vertical Accuracy of 3DEP DEMs][S16] | Aggregate versus local elevation accuracy |
| S17 | [USGS: Elevation Point Query Service Accuracy][S17] | Interpolated elevation limitations |
| S18 | [GPS.gov: GPS Accuracy][S18] | Positioning uncertainty and reception conditions |
| S19 | [OpenStreetMap: Disc Golf][S19] | Disc-golf geographic tags and interoperability |
| S20 | [PostGIS: ST_Length][S20] | Geometry versus geography measurement behavior |
| S21 | [RFC 7946: The GeoJSON Format][S21] | Interchange coordinates and format |
| S22 | [PDGA: Course Development FAQ][S22] | Maintenance considerations; older price examples are not used as current budgets |
| S23 | [MapLibre GL JS: Documentation][S23] | Candidate map-rendering technology |

[S01]: https://www.pdga.com/course-development "PDGA Course Design and Development"
[S02]: https://www.pdga.com/course-development/design-elements "PDGA Course Design Elements"
[S03]: https://www.pdga.com/course-development/skill-level-guidelines "PDGA Player Skill Level Guidelines"
[S04]: https://www.pdga.com/course-development/choosing-course-designer "PDGA Choosing a Course Designer"
[S05]: https://www.pdga.com/technical-standards/guidelines "PDGA Technical Standards"
[S06]: https://www.pdga.com/rules/official-rules-disc-golf "Official Rules of Disc Golf"
[S07]: https://www.pdga.com/rules/official-rules-disc-golf/80602 "PDGA 806.02 Out-of-Bounds"
[S08]: https://www.pdga.com/rules/official-rules-disc-golf/80603 "PDGA 806.03 Casual Area"
[S09]: https://www.pdga.com/rules/official-rules-disc-golf/80604 "PDGA 806.04 Required Relief Area"
[S10]: https://www.pdga.com/rules/official-rules-disc-golf/80605 "PDGA 806.05 Hazard"
[S11]: https://www.pdga.com/rules/official-rules-disc-golf/80401 "PDGA 804.01 Mandatory Routes"
[S12]: https://www.pdga.com/throwgreen "PDGA Throw Green"
[S13]: https://help.udisc.com/en/articles/10704989-what-is-map-manager "UDisc What is Map Manager"
[S14]: https://help.udisc.com/en/articles/10705000-editing-fairways-in-map-manager "UDisc Editing Fairways in Map Manager"
[S15]: https://help.udisc.com/en/collections/11542722-mapping-layouts "UDisc Mapping and Layouts"
[S16]: https://www.usgs.gov/faqs/what-vertical-accuracy-3d-elevation-program-3dep-dems "USGS 3DEP DEM Accuracy"
[S17]: https://www.usgs.gov/faqs/how-accurate-are-elevations-generated-elevation-point-query-service-national-map "USGS Elevation Point Query Accuracy"
[S18]: https://www.gps.gov/gps-accuracy "GPS.gov GPS Accuracy"
[S19]: https://wiki.openstreetmap.org/wiki/Disc_golf "OpenStreetMap Disc Golf"
[S20]: https://postgis.net/docs/ST_Length.html "PostGIS ST_Length"
[S21]: https://www.rfc-editor.org/rfc/rfc7946 "RFC 7946 GeoJSON"
[S22]: https://www.pdga.com/faq/course-development/ "PDGA Course Development FAQ"
[S23]: https://maplibre.org/maplibre-gl-js/docs/ "MapLibre GL JS Documentation"

---

## Appendix A. Codex repository audit and implementation safeguards

### A.1 First deliverable: evidence-based repository audit

Inspect the repository before recommending a rewrite or migration. Identify actual paths, components, services, schema objects, and tests. For each capability, report one of: implemented and tested, implemented but unverified, partial, missing, or blocked by unavailable evidence.

| Audit area | Questions to resolve |
|---|---|
| Map interaction | Where do selection, dragging, panning, zooming, and gesture ownership live? |
| Coordinates | Are features stored in geographic coordinates, map pixels, image pixels, or mixed systems? |
| Course identity | Which IDs and labels are used by other modules? |
| Tees/targets | Are positions separate from physical target assets and layouts? |
| Fairways | Independent polylines or shared topology? What creates the duplicate merged path? |
| Layouts | How are tee/target pairings, hole order, pars, and distances selected? |
| Rules | Free text, geometry, scope, and event overrides? |
| Persistence | Autosave, explicit save, transactions, retries, draft recovery? |
| Scoring | How does an active/completed round reference its course configuration? |
| Ratings/imports | Which computations or imported rows depend on course/layout fields? |
| Authorization | Who can read, edit, verify, publish, and administer each course? |
| Database | Existing migrations, constraints, spatial support, indexes, compatibility needs? |
| Media/maps | Providers, attribution, storage, offline rights, recurring costs? |
| Tests | Existing unit, integration, end-to-end, and migration tests? |

Produce a dependency map connecting course edits to scoring, tournaments, caddie books, statistics, and imports. Do not claim an integration is safe without tracing it.

### A.2 Migration and implementation guardrails

1. Work in a branch or equivalent isolated development environment. Record the baseline and test results.
2. Preserve stable IDs and historical references. Never renumber database relationships from display labels.
3. Prefer additive schema changes and compatibility adapters. Do not introduce a second unrelated course database.
4. Test conversions on copies or fixtures before any production migration. Validate row counts, relationships, geometry, and snapshots.
5. Keep existing routes and layouts readable during transition. Do not require all old courses to become survey-complete before they can function.
6. Use feature flags for substantial editor or model replacements. Keep rollback instructions and clear ownership of the canonical data.
7. Do not reset databases, drop records, loosen authorization, or expose credentials to bypass an implementation problem.
8. Separate map improvements from rating-model changes and source-import changes.
9. Report exactly what was inspected, changed, tested, and not tested. Do not mark placeholder UI as complete functionality.
10. Obtain explicit authorization before destructive operations, production deployment, paid-service commitments, or historical-data rewrites.

### A.3 Proposed priority order after the audit

**P0 - Preservation and correctness:** Existing-data safety, stable identifiers, scoring snapshots, permissions, map interaction reliability, save recovery.

**P1 - Core requested behavior:** Course-wide tee colors, robust shared fairway topology, merge/split controls, multi-pin routes, correct measurements, actionable publishing errors.

**P2 - Professional course mapping:** Rule geometry, configuration overrides, survey provenance, field workflows, navigation, caddie-book consistency.

**P3 - Operations and advanced visualization:** Maintenance, richer terrain, 3D obstacles, design analysis, cost-aware scale improvements.

Adapt this order to actual dependencies. A small prerequisite versioning change may need to precede a visible fairway improvement.

## Appendix B. Acceptance tests and regression scenarios

These are proposed tests, not claims that tests have been run against the project.

### B.1 Shared-fairway topology

| ID | Scenario | Expected result |
|---|---|---|
| G01 | One tee, one target, one route | Continuous route, correct endpoints and length |
| G02 | Red and blue tees merge toward one target | One shared downstream edge; no leftover duplicate |
| G03 | Shared corridor branches to positions A and B | Both valid tee-to-position routes resolve correctly |
| G04 | Three tee colors share an edge | One physical edge with all applicable memberships and clear styling |
| G05 | Hover near a compatible node | Merge preview appears; geometry stays unchanged until confirmation |
| G06 | Decline merge and keep routes side by side | Independent geometry remains independent |
| G07 | Attach to the middle of an edge | Edge splits correctly and all affected routes are repaired |
| G08 | Move a shared control point | All dependent routes update consistently, once |
| G09 | Delete one route | Shared edges remain for surviving routes |
| G10 | Split or unmerge one branch | Other routes remain continuous and unchanged |
| G11 | Undo and redo a merge | Exact topology, membership, distance, and styling restoration |
| G12 | Two routes cross visually | No junction created without an explicit connection |
| G13 | One tee/target pairing has alternative routes | Distinct ordered routes; no accidental shortest-path substitution |
| G14 | Pairing is intentionally excluded | No fabricated route; publication handles the exclusion explicitly |
| G15 | Reload after a merge | Same single shared segment, memberships, and distances |

### B.2 Geography and measurements

| ID | Scenario | Expected result |
|---|---|---|
| M01 | Switch feet/meters display | Same underlying geometry and consistent conversion |
| M02 | Dogleg route versus direct line | Both distances retained and clearly labeled |
| M03 | Tee icon center differs from throwing edge | Official measurement uses the documented endpoint convention |
| M04 | Missing terrain sample | No invented elevation or misleading 3D result |
| M05 | Import projected survey coordinates | Correct transformation; original CRS and values retained |
| M06 | Basemap is repositioned | Verified feature coordinates do not move |
| M07 | Low-confidence drag of verified point | Warning/evidence-aware revision; original survey survives |
| M08 | Sign distance conflicts with map distance | Review flag; no automatic geometry distortion |
| M09 | Equal endpoint elevations, valley between | Net change near zero; sampled profile still shows valley |
| M10 | Unknown positional uncertainty | Explicit unknown value, never false zero accuracy |

### B.3 Layouts, rules, and scoring

| ID | Scenario | Expected result |
|---|---|---|
| L01 | Same physical hole in two layouts | Independent selected tees, targets, par, and rules |
| L02 | Temporary tournament tee | Does not overwrite everyday physical/layout state |
| L03 | Add hole 8A or skip a hole | Stable IDs; flexible order and labels |
| L04 | Move basket after a completed round | Old scorecard keeps its exact resolved position/version |
| L05 | Rename tee color or hole | Historical meaning and record relationships preserved |
| L06 | Wooded polygon without OB assignment | Remains ordinary mapped terrain, not a penalty area |
| L07 | Hazard and OB areas | Distinct explanations and continuation logic |
| L08 | Mandatory with missing continuation details | Actionable review/block, not a guessed ruling |
| L09 | Event override conflicts with default | Effective rules shown; conflict explicitly resolved |
| L10 | In-progress round during map publication | No silent configuration switch |
| L11 | Dynamic current-target layout starts a round | Placement resolved into an immutable snapshot |
| L12 | Existing imported rounds lack exact layouts | Unknowns preserved; no invented precision or rating changes |

### B.4 Reliability and permissions

| ID | Scenario | Expected result |
|---|---|---|
| R01 | Connection drops while editing | Recoverable local draft with clear sync state |
| R02 | Save request retries | No duplicate nodes, edges, assets, or work orders |
| R03 | Two editors change one shared feature | Conflict detected and resolved deliberately |
| R04 | Ordinary player attempts protected edit | Access denied without exposing sensitive data |
| R05 | Publisher submits invalid layout | Atomic rejection and actionable error locations |
| R06 | One draft feature is incomplete | Unrelated existing layouts remain usable |
| R07 | Revert a publication | Prior version available; history retained |
| R08 | Phone/map gestures while editing | No accidental pan lock, drag conflict, or unintended feature movement |
| R09 | Color-vision or low-contrast conditions | Routes identifiable through labels/patterns as well as color |
| R10 | Old client reads course after additive migration | Compatibility behavior defined and tested |

## Appendix C. Minimum field-capture data dictionary

Use the following as a starting point, not a replacement for the actual repository schema.

| Group | Suggested fields |
|---|---|
| Identity | Stable feature ID, course ID, feature type, display name, physical status |
| Geometry | Geometry type, normalized coordinates, original coordinates, source CRS |
| Elevation | Ground elevation, object height above ground, vertical datum, source |
| Observation | Capture timestamp, observer, method, instrument/source, conditions |
| Quality | Horizontal uncertainty, vertical uncertainty, confidence convention, verification status |
| Evidence | Photo/document references, control/checkpoint record, reviewer, review date |
| Versioning | Feature version, effective start/end, observed-at time, change reason, previous version |
| Ownership | Organization/operator, edit/publish scope, access restrictions |
| Licensing | Data source, attribution, permitted use, redistribution/offline conditions |
| Condition | Inspection date, condition state, issues, maintenance references |
| Layout use | Tee/target compatibility, route references, affected layout versions |
| Rules | Rule-assignment IDs, rulebook version, effective scope, official instructions |

Specialized tee fields should include the throwing edge, dimensions, orientation, surface, tee-set identity, and apron observations. Specialized target fields should separate position, asset, dated placement, and installed height. Specialized route fields should identify ordered edge membership, intended skill/context, measurement convention, and approved status.

## Appendix D. Suggested first message to Codex

```text
Read Disc_Golf_Dashboard_Course_Research_and_Implementation_Brief.md in full and
use it as the course-builder research and target-capability reference for the
existing Disc Golf Dashboard project.

Start with a repository audit, not a rebuild. Trace the current course builder,
map interactions, tee and basket models, fairway storage, layouts, rules,
permissions, scoring, tournament links, imports, and rating dependencies.
Report actual file paths and schema objects, what is implemented, what is
partial, and what is missing. Do not invent repository findings.

Pay particular attention to course-wide tee colors; fairway points that offer
merging; one shared downstream segment without duplicate remnants; several
tees sharing a corridor; branches to every intended approved pin position;
and accurate route measurements.

Preserve existing courses, layouts, tournaments, player data, imported rounds,
and historical scores. A later basket move or layout edit must not rewrite a
completed round's configuration. Do not alter rating models as a side effect.

Return a prioritized, phased implementation plan with dependencies, proposed
migrations, compatibility strategy, acceptance tests, and rollback approach.
Identify the smallest safe first change. Treat this initial request as an audit
and planning task; do not perform destructive changes or deploy to production.
```

---

**End of document.**
