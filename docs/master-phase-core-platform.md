MASTER PHASE — COMPLETE THE DGD CORE PLATFORM
COURSE ATLAS → PERMISSIONS → VERSION INTEGRITY → EVENT OPERATIONS →
PLAY NETWORK → SERIES/PRIZES → RULES/STANDARDS → DIVISIONS

DG Dashboard currently builds successfully with no known application build
errors.

The remaining major systems must now be completed in a deliberate dependency
order.

DO NOT perform another broad audit and stop.

DO NOT create replacement systems beside existing partially working systems.

DO NOT create duplicate canonical entities.

DO NOT leave partially connected UI.

For every phase:

1. Inspect existing implementation.
2. Reuse valid existing data/components.
3. Implement missing functionality.
4. Migrate existing data safely.
5. Test it in the running application.
6. Fix failures.
7. Run security checks where applicable.
8. Only then continue to the next phase.

IMPLEMENT IN THIS ORDER:

1. COURSE ATLAS / DATA QUALITY
2. PERMISSIONS / APPROVALS
3. LAYOUT / EVENT VERSION INTEGRITY
4. EVENT TEAM / OPERATIONS
5. PLAY HOME SOCIAL MATCHING
6. SERIES / PRIZES
7. RULES & STANDARDS
8. DIVISION SYSTEM / THRESHOLDS

==================================================
GLOBAL IMPLEMENTATION RULES
==================================================

A. Preserve canonical identity.

There should remain one canonical:

Player
Course
Physical Hole
Tee
Basket Position
Layout
Layout Version
Event
Event Round
Physical Round
Series
Organization.

Do not create parallel records simply because another feature needs access.

B. One fact = one owner.

If multiple tables/components currently store the same fact:

identify the canonical owner

migrate consumers

remove duplicate permanent ownership.

C. Never invent missing data.

Unknown:

NULL / Unknown / —

Never:

fake Par 3
fake Par 54
fake Course coordinates
fake Layout
fake Rating
fake Hole geometry.

D. Preserve history.

Published historical:

Course Versions
Layout Versions
Events
Rounds
Results
Rules
Payouts

must not silently change when current data changes.

E. Do not break existing rounds/events.

If historical records reference old or incomplete structures:

preserve enough snapshot information to keep those historical records valid.

F. Server authority.

Security-critical behavior must be enforced on the backend/database.

Do not rely on hidden buttons or frontend role checks.

G. Before Supabase/database/security work:

read the current Supabase changelog.

Review any applicable breaking changes.

Review current documentation for:

RLS
Data API grants
Views
Realtime
Queues
Cron
PostGIS
Auth
Storage

as applicable.

H. Supabase security requirements:

- RLS on every exposed table.
- Data API GRANT is separate from RLS.
- Never use user_metadata for authorization.
- `TO authenticated` alone is NOT authorization.
- UPDATE requires SELECT + USING + WITH CHECK.
- Use security-invoker views where appropriate.
- Avoid SECURITY DEFINER.
- If SECURITY DEFINER is genuinely necessary:
  keep it out of exposed schemas,
  explicitly authorize,
  revoke PUBLIC execution.
- Never expose service-role or secret credentials.

I. Run database/security advisors after schema/security changes.

J. Do not create application tables/functions inside the Supabase realtime
schema.

K. Keep UI mobile-first.

DGD should feel like an interactive sports/social application, not an admin
dashboard compressed onto a phone.

==================================================
PHASE 1 — COURSE ATLAS / DATA QUALITY
==================================================

Goal:

Create the most comprehensive, clean, canonical U.S. Course inventory
possible and make every legitimate located Course usable from the unified
Course Directory / Course Studio.

==================================================
1.1 NATIONAL COURSE INVENTORY
==================================================

Continue reconciling:

PDGA
UDisc
Disc Golf Scene
DGD-native
user-submitted

Course identities.

The DGD Course Atlas is the union of legitimate known Courses.

No single external source is authoritative for national completeness.

==================================================
1.2 CURRENT MISSING LOCATIONS
==================================================

There are currently approximately:

557 Courses

with no usable location.

Process them systematically.

For each:

1. Check existing source coordinates.
2. Check linked source pages.
3. Check address.
4. Geocode legitimate address.
5. Try park/Course + city/state.
6. Validate returned location.
7. Persist location + provenance + confidence.
8. If unresolved, move to explicit review queue.

Do not silently place a Course at a city/state centroid.

==================================================
1.3 LOCATION CONFIDENCE
==================================================

Store:

VERIFIED
HIGH
MEDIUM
APPROXIMATE
UNRESOLVED.

Store location provenance.

Examples:

STEWARD GPS
SOURCE COORDINATE
MULTI-SOURCE CONSENSUS
ADDRESS GEOCODE
PARK GEOCODE
MANUAL.

==================================================
1.4 COURSE SOURCE LINKING
==================================================

Finish linking each canonical Course to external identities.

Conceptually:

course_source_links

course_id
source
external_id
external_url
match_confidence
match_method
verified
first_seen
last_seen.

Examples:

PDGA ID

UDisc slug/ID

Disc Golf Scene Course ID.

==================================================
1.5 AUTO MATCHING
==================================================

Match using:

explicit IDs
name similarity
coordinates
address
park/property
city/state
reported Hole count
established year
Event relationships.

Use explainable match confidence.

==================================================
1.6 DO NOT OVER-MERGE
==================================================

Protect:

multiple Courses at same park

North/South Courses

Course complexes

separate championship Courses.

Same address does not mean same Course.

==================================================
1.7 COURSE VS LAYOUT
==================================================

Detect likely:

Course

Layout of Course

Separate Course at same property.

Ambiguous cases go to review.

Do not auto-destroy identities.

==================================================
1.8 SOURCE CONFLICTS
==================================================

Preserve source observations.

Example:

PDGA:
18 Holes

UDisc:
21 Holes

Steward:
21.

Do not overwrite source history.

Canonical resolver selects current value according to:

verification
freshness
field-specific source authority.

==================================================
1.9 FIELD PROVENANCE
==================================================

Every important canonical Course value should be explainable.

Examples:

Course name
location
reported Hole count
established year
designer
access
tee type
basket type
amenities
Layout details
Par
distance.

Admin should be able to answer:

WHY DOES DGD THINK THIS?

==================================================
1.10 RE-READ STORED SOURCE DATA
==================================================

Build/reuse parser-versioned source records.

Allow stored source pages/documents to be:

reparsed

without refetching the source.

Track:

source parser version

raw/source snapshot version

last parsed.

==================================================
1.11 CONNECTOR ARCHITECTURE
==================================================

One adapter/connector per external source.

Each adapter handles:

discovery
detail fetching
normalization
retry/backoff
rate limits
parser version
source errors.

Do not create one giant generic scraper.

==================================================
1.12 RETRIES
==================================================

Use durable server-side jobs.

Failures classified such as:

RATE_LIMITED
TIMEOUT
NOT_FOUND
ACCESS_DENIED
PARSER_CHANGED
INVALID_DATA
MATCH_AMBIGUOUS.

Use bounded retries/backoff.

==================================================
1.13 DIRECTORY READY
==================================================

Define explicit Course publication rule.

A Course may appear in Course Directory when:

- legitimate identity exists
- usable representative location exists
- not known duplicate/invalid
- public visibility policy allows it.

It does NOT require:

mapped Tees
mapped Baskets
Layout
Par.

==================================================
1.14 COMPLETENESS DIMENSIONS
==================================================

Compute separately:

IDENTITY
LOCATION
SOURCE COVERAGE
DIRECTORY READY
SCORING READY
MAP READY
CADDY READY
VERIFIED.

Do not use one misleading percentage.

==================================================
1.15 WHY IS THIS MISSING?
==================================================

For missing information provide reason.

Example:

Basket coordinates missing
Reason:
No supported source supplies Basket coordinates and no DGD contributor has
mapped them.

Par unknown
Reason:
External sources disagree and no verified Layout exists.

==================================================
1.16 NATIONAL COVERAGE UI
==================================================

Admin Course Atlas:

United States summary

State-by-state table.

Columns:

State
Canonical Courses
Located
Directory Ready
PDGA Linked
UDisc Linked
DGS Linked
Scoring Ready
Map Ready
Verified
Review Needed
Last Discovery.

==================================================
1.17 STATE DETAIL
==================================================

Provide queues:

Missing Location

Possible Duplicate

Course vs Layout

Source Conflict

Missing Source Link

Needs Mapping

Missing Layout

Par Verification

Closed/Open Conflict.

==================================================
1.18 MAP CLUSTERING
==================================================

At broad zoom:

cluster Course pins.

At local zoom:

individual Courses.

Do NOT load every U.S. Course row/geometry into React.

Use PostGIS/indexed viewport queries.

==================================================
1.19 DIRECTORY PERFORMANCE
==================================================

Directory map query should return lightweight:

course_id
name
location
status
reported Holes
Layout count
Map readiness
verification summary.

Detailed Course geometry only loads after Course selection.

==================================================
1.20 PAR PROVENANCE AUDIT
==================================================

Audit current Course/Hole Par data because nearly every Course currently has
Par values stored.

Identify:

verified source Par

imported actual Par

Layout-specific Par

placeholder/default Par.

Flag suspicious patterns such as:

every Hole = Par 3
Course Par = Hole count × 3

without actual provenance.

Do NOT delete valid historical Round Par snapshots.

==================================================
1.21 REMOVE FAKE CURRENT PAR
==================================================

Where current canonical Par was only a placeholder:

replace current unknown values with NULL where safe.

Preserve historical snapshots required by existing Rounds.

==================================================
1.22 HELP MAP QUEUES
==================================================

Expose:

Courses Near Me Needing Help

Missing Tees

Missing Baskets

Missing Layout

Needs Verification.

Use same Course Studio.

==================================================
1.23 PHASE 1 ACCEPTANCE
==================================================

Must demonstrate:

- unresolved-location count reduced and remaining cases explained
- source linking works
- multi-source Course appears once
- multi-Course property is not wrongly merged
- Course vs Layout ambiguity enters review
- Map clusters work
- Course viewport query is performant
- no fake Par created
- Directory-ready rule works
- Course Atlas state dashboard works
- source provenance visible
- reprocessing a source does not duplicate Courses.

Do not proceed until failures are fixed.

==================================================
PHASE 2 — PERMISSIONS / APPROVALS
==================================================

Goal:

Finish DGD's capability-based ownership and approval system across:

Courses
Events
Organizations
Registration
Staff.

==================================================
2.1 CENTRAL CAPABILITY MODEL
==================================================

Do not implement permissions independently on every page.

Create/reuse centralized capability checks.

Conceptual capabilities:

COURSE_VIEW
COURSE_EDIT_LOW_RISK
COURSE_PROPOSE_STRUCTURE
COURSE_APPROVE_STRUCTURE
COURSE_MANAGE_STAFF

EVENT_VIEW_ADMIN
EVENT_EDIT_OPERATIONAL
EVENT_EDIT_CRITICAL
EVENT_MANAGE_STAFF
EVENT_FINALIZE
EVENT_REOPEN

ORG_MANAGE
ORG_MANAGE_STAFF

REGISTRATION_EDIT
REGISTRATION_FINANCE

GLOBAL_ADMIN.

==================================================
2.2 GLOBAL ADMIN
==================================================

Global Admin retains platform-wide authority.

Do not infer Global Admin from editable user metadata.

Use trusted server/database authorization.

==================================================
2.3 EVENT OWNER
==================================================

Only Event owner/appropriately authorized critical-role user may change
critical Event configuration.

Examples:

Event identity
governing rules
sanctioning
Course/Layout assignment
financial configuration
ownership
finalization.

==================================================
2.4 EVENT STAFF
==================================================

Staff receives explicit roles/capabilities.

Example roles:

Owner
TD
Co-TD
Course Lead
Check-In
Scoring
Finance
Volunteer Lead
Media
Staff
View Only.

Backend authorization must enforce capability.

==================================================
2.5 COURSE ROLES
==================================================

Course roles:

Contributor
Trusted Contributor
Course Steward
Course Admin

plus Global Admin.

Course role != Event role.

==================================================
2.6 LOW VS HIGH RISK CHANGES
==================================================

Low-risk examples:

description
amenity correction
condition update

may be directly editable by authorized roles.

High-risk:

move/delete Tee
move/delete Basket
change physical Hole structure
change Course identity
delete approved geometry

requires appropriate approval.

==================================================
2.7 COURSE SUBMISSION
==================================================

Anyone permitted by policy can create:

Draft Course.

Draft lifecycle:

DRAFT
SUBMITTED
NEEDS_CHANGES
APPROVED
PUBLISHED.

==================================================
2.8 NO SELF APPROVAL
==================================================

Submitter cannot approve their own protected Course structural submission
unless Global Admin override policy explicitly permits it.

Audit override reason.

==================================================
2.9 APPROVAL INBOX
==================================================

Build:

APPROVALS

for authorized reviewers.

Categories:

Course submissions

Course structural changes

ownership transfer

other protected changes.

Show:

Current
Proposed
Difference
Impact
Submitter
Reason.

==================================================
2.10 MAP DIFF
==================================================

Course structural changes should provide visual:

CURRENT

vs

PROPOSED

geometry.

==================================================
2.11 EVENT PROTECTION
==================================================

Completed/finalized Events become protected.

Operational edits after completion require:

explicit reopen/correction workflow

with reason and audit.

==================================================
2.12 OWNERSHIP TRANSFER
==================================================

Implement protected Event/Course/Organization ownership transfer.

Require:

authorized initiator

new owner

confirmation

audit.

Do not permit ordinary UPDATE to rewrite owner_id.

==================================================
2.13 STAFF MANAGEMENT SCREEN
==================================================

Owner/authorized manager can:

invite staff

assign role

change role

remove staff

review capabilities.

==================================================
2.14 INSPECT PERMISSIONS
==================================================

Provide:

WHY CAN THIS USER DO THIS?

Example:

Michael
Event Role: Owner

Can:
Edit critical Event
Manage staff
Finalize results.

This helps diagnose access problems.

==================================================
2.15 ORGANIZATION ROLES
==================================================

Finish Organization membership/roles.

Organization role does not automatically grant unlimited Event/Course rights.

Explicit relationship/capabilities.

==================================================
2.16 REGISTRATION PERMISSIONS
==================================================

Migrate Registration edits away from legacy owner/director-only assumptions.

Use the same Event capability resolver.

==================================================
2.17 PUBLIC CHANGE HISTORY
==================================================

For Courses and suitable Event data:

show meaningful public change history.

Do not expose private moderation/security information.

==================================================
2.18 AUDIT LOG
==================================================

Critical changes log:

actor
action
entity
before/after reference
timestamp
reason
approval relationship.

==================================================
2.19 PHASE 2 ACCEPTANCE
==================================================

Test:

- normal user cannot edit unrelated Course
- contributor can submit proposal
- submitter cannot self-approve
- steward can perform permitted actions
- Event staff capability limits work through API
- finalized Event cannot silently mutate
- ownership transfer works
- registration uses new capability system
- Global Admin still works
- direct API attempts respect same rules.

==================================================
PHASE 3 — LAYOUT / EVENT VERSION INTEGRITY
==================================================

Goal:

An Event and every Round must always know the exact Course/Layout configuration
that was actually played.

==================================================
3.1 LAYOUT VERSIONING
==================================================

Published Layouts have immutable Layout Versions.

Draft edits create next version when published.

Never mutate published historical version.

==================================================
3.2 EVENT LAYOUT PICKER
==================================================

Event Round setup must select:

Course
Layout
Layout Version.

If current/latest version is offered:

show version/effective date.

==================================================
3.3 EVENT PINS VERSION
==================================================

Once Event configuration is finalized/started:

store exact:

layout_version_id.

Do not resolve "latest" during play.

==================================================
3.4 EVENT ROUND CONFIGURATION
==================================================

Different Event Rounds may use:

different Course

different Layout

different Layout Version.

Example:

Round 1:
Main 18 v3

Round 2:
Championship 21 v2.

==================================================
3.5 DIVISION / POOL MAPPINGS
==================================================

Support different Layout Versions by:

Round
Pool
Division

where Event requires it.

==================================================
3.6 PHYSICAL ROUND SNAPSHOT
==================================================

Every canonical physical Round stores enough exact configuration to preserve
history:

course_id
layout_id
layout_version_id
event_id
event_round_id
Hole sequence
selected Tee
selected Basket Position
Par
official distance where used
Event Overlay version.

==================================================
3.7 ROUND HISTORY
==================================================

Later Course/Layout changes must not rewrite:

Round score context

Round Par

Round Rating inputs.

==================================================
3.8 EVENT OVERLAY VERSION
==================================================

Temporary Event geometry/rules also receive a pinned version/snapshot.

Examples:

temporary OB
Mando
DZ
temporary Hole.

==================================================
3.9 TRACKERS
==================================================

Trackers must show actual:

Course
Layout name
Layout Version/context

not:

Default Layout.

==================================================
3.10 STATBOARD
==================================================

Round details show:

Course
Layout
exact configuration

with provenance.

==================================================
3.11 CADDY
==================================================

Event Caddy renders:

Base Course
+
exact Layout Version
+
Event Overlay Version
+
current Conditions.

==================================================
3.12 EVENT CHANGES AFTER REGISTRATION
==================================================

If TD changes Layout before Event:

show affected registrations/communications where relevant.

If Event is already underway:

require protected correction workflow.

==================================================
3.13 PHASE 3 ACCEPTANCE
==================================================

Create:

Course with multiple Basket positions

Layout v1

Layout v2 with changed Basket.

Event Round uses v1.

Publish v2.

Expected:

Event still uses v1.

Tracker
Statboard
Caddy
Round history

all show v1.

==================================================
PHASE 4 — EVENT TEAM / OPERATIONS
==================================================

Goal:

DGD should fully operate a Tournament/League from planning through Event Day.

==================================================
4.1 EVENT TEAM
==================================================

Complete Event team management using Phase 2 capabilities.

Roles:

Owner
TD
Co-TD
Course Lead
Check-In
Scoring
Finance
Volunteer Lead
Media
Staff
View Only.

==================================================
4.2 TEAM INVITES
==================================================

Invite:

DGD Player/User

or email where supported.

Track:

Pending
Accepted
Declined
Removed.

==================================================
4.3 TASK BOARD
==================================================

Event Operations:

Tasks.

Task fields:

title
description
category
assigned staff
due date/time
priority
status
Event Day relevance.

Views:

Today
Upcoming
Mine
All.

==================================================
4.4 TASK CATEGORIES
==================================================

Examples:

Course Setup
Check-In
Player Packs
Scoring
Finance
Volunteer
Media
Awards
Cleanup
Other.

==================================================
4.5 VOLUNTEERS
==================================================

Complete volunteer system.

Volunteer signup:

name/player
contact
availability
preferred role
notes.

Staff can assign:

shift
task
location.

==================================================
4.6 EVENT DAY MODE
==================================================

Event Day should emphasize:

Check-In
Course alerts
Staff status
Tasks
Weather
Announcements
Round status
Scoring issues
Incidents.

Do not show planning clutter.

==================================================
4.7 CHECK-IN
==================================================

Integrate existing Player QR system.

Staff scan:

registered
→ Check In

not registered
→ Quick Register where allowed.

==================================================
4.8 OPERATIONS AUDIT
==================================================

Operational actions should log:

actor
time
source.

Examples:

staff scan
kiosk
manual
self QR.

==================================================
4.9 PLAYER PACKS
==================================================

Track:

eligible
issued
who issued
when.

Prevent accidental duplicate handoff.

==================================================
4.10 ANNOUNCEMENTS
==================================================

Authorized Event staff can send:

all players

division

pool

staff

volunteers.

==================================================
4.11 INCIDENTS
==================================================

Authorized staff can record:

Course
medical/safety
rules/scoring
other operational incidents.

Sensitive access protected.

==================================================
4.12 POST-EVENT CLOSEOUT
==================================================

Closeout checklist:

scores finalized
payouts finalized
awards
player packs
finances
results
media
volunteers
reports.

==================================================
4.13 PHASE 4 ACCEPTANCE
==================================================

Test complete Event:

create staff

assign capabilities

create tasks

assign volunteers

check players in

issue player packs

run Round

send announcement

complete Event.

Unauthorized staff must fail API actions outside their capability.

==================================================
PHASE 5 — PLAY HOME SOCIAL MATCHING
==================================================

Goal:

Opening DGD should answer:

WHO IS PLAYING?
WHO WANTS TO PLAY?
WHAT CAN I JOIN RIGHT NOW?

==================================================
5.1 PLAY IS HOME
==================================================

Verify Play remains canonical authenticated Home.

Feed remains under Community.

==================================================
5.2 PLAY STATUS
==================================================

Complete durable status system.

Examples:

AVAILABLE
LOOKING_TO_PLAY
HEADING_TO_COURSE
PLAYING
PRACTICING
AT_EVENT.

Separate:

durable play intent

from:

ephemeral online Presence.

==================================================
5.3 LOOKING-TO-PLAY INTENT
==================================================

Persist:

player
time window
Course/area
format
group size
visibility
optional preferences
expiration.

Never leave stale LFG indefinitely.

==================================================
5.4 LOCAL QUEUE
==================================================

Create:

PLAYERS LOOKING NEARBY.

Views:

Nearby
Friends
Crew
At this Course
Later Today.

==================================================
5.5 PRIVACY
==================================================

Do not expose exact live GPS by default.

Use:

Course
approximate area
distance

according to user settings.

==================================================
5.6 OPEN ROUNDS
==================================================

Open Round is a group/session.

Looking-to-Play is a person.

Keep separate but connect them.

==================================================
5.7 MATCH SUGGESTIONS
==================================================

Rank compatible:

time
distance
Course
friends/crew
format
capacity.

Do not auto-enroll.

==================================================
5.8 INVITES
==================================================

Player can:

Invite to existing Round

or

Create Round.

Recipient receives high-priority Home card.

==================================================
5.9 JOIN REQUESTS
==================================================

Rounds support:

Open Join

or:

Approval Required.

Prevent duplicate requests/members.

==================================================
5.10 MATCH → ROUND
==================================================

Once people agree:

create/reuse canonical planned Round.

Players
chat
Course
time

stay attached to that same Round.

==================================================
5.11 START FROM MATCH
==================================================

At play time:

START ROUND

should reuse members.

Do not make scorer rebuild card.

==================================================
5.12 FOLLOW FRIEND ROUND
==================================================

Friends/Crew playing:

Follow Round

routes into existing Tracker/live scoring.

No duplicate live score system.

==================================================
5.13 COURSE ACTIVITY
==================================================

Course page can show privacy-safe:

players looking
open Rounds
Rounds underway.

==================================================
5.14 EVENT ACTIVITY
==================================================

Home prioritizes:

registered Event today
League tonight
check-in availability.

==================================================
5.15 REALTIME
==================================================

Database rows are authoritative.

Use:

Presence

only for limited ephemeral online state.

Use:

Broadcast

for suitable low-latency notifications.

Do not make WebSocket state the permanent LFG system.

==================================================
5.16 BLOCKING
==================================================

Blocked users cannot:

see protected social status
match
invite
join private social Rounds.

Enforce server-side.

==================================================
5.17 PHASE 5 ACCEPTANCE
==================================================

Test:

Player A posts Looking.

Closes app.

Player B still sees valid intent.

B invites A.

A accepts.

Round forms.

Both refresh app.

Round persists.

Start Round.

Card already includes both.

Privacy/block tests must pass.

==================================================
PHASE 6 — SERIES / PRIZES
==================================================

Goal:

Complete professional Series scoring, standings, qualification and all
associated prize pools.

==================================================
6.1 SERIES MODEL
==================================================

Series references canonical Events.

A Course is NOT required at Series level.

Individual Events own Course/Layout.

==================================================
6.2 SERIES SCORING
==================================================

Finish configurable Series scoring.

Support:

placement points
participation points
best-N Events
drop Events
minimum Event count
finale multiplier
custom points table
division-specific rules.

==================================================
6.3 BONUSES
==================================================

Support configurable Series bonus rules.

Examples:

Event win bonus
Finale bonus
participation streak
attendance
custom.

Avoid hidden scoring logic.

==================================================
6.4 QUALIFICATION
==================================================

Support:

minimum Events played
points threshold
top N
division-specific qualification
finale qualification.

Show:

QUALIFIED

ON CUT

OUTSIDE CUT

where appropriate.

==================================================
6.5 PODIUM / CUT LINE
==================================================

Standings should visually show:

Podium

Prize positions

Qualification cut

Finale cut

depending on Series settings.

==================================================
6.6 TIEBREAKERS
==================================================

Versioned Series tiebreaker order.

Examples:

wins
best finish
finale result
head-to-head
most recent result
playoff/manual.

==================================================
6.7 REGION RUMBLE IMPORT
==================================================

Import existing Region Rumble results into canonical Series/Event structures.

Match:

players
Events
divisions
results.

Do not duplicate Events/players.

Validate standings against source.

==================================================
6.8 SERIES AWARDS
==================================================

Support:

Champion
Podium
Division Champion
Most Improved
Attendance
Custom awards.

Awards separate from competitive scoring where appropriate.

==================================================
6.9 SERIES PRIZE FUND
==================================================

Create Series-level prize pool.

Sources:

Event contributions
Sponsors
Added cash
Donations
Carryover
Other.

==================================================
6.10 EVENT PRIZES TABLE
==================================================

Maintain separate supplementary prize tables for:

Ace Fund
50/50
CTP
Bounty
Raffle where legitimately supported
Sponsor prizes
Other.

Do not mix these into placement payout schedule unless configured.

==================================================
6.11 QR PRIZE AWARD
==================================================

Authorized staff can:

Scan Player QR

Select Prize

Award.

System verifies:

Event/Series
eligibility
prize availability
duplicate award state.

Audit:

recipient
staff
time.

==================================================
6.12 PRIZE INVENTORY
==================================================

Prize state:

Available
Awarded
Claimed
Void.

Support:

cash
merchandise
credit
physical prize
custom.

==================================================
6.13 SERIES PAYOUT
==================================================

Series standings can feed final:

cash

merchandise

credit

prize

payouts.

Respect DGD payout engine.

==================================================
6.14 $1 MINIMUM SUPPORT
==================================================

Preserve DGD payout policy:

minimum payout/player may be $1.

Rounding options include:

Exact
Nearest $1
Nearest $5.

Rounding/convenience must not silently reduce money already owed.

==================================================
6.15 PHASE 6 ACCEPTANCE
==================================================

Create six-Event Series.

Use:

best 4
finale bonus
qualification cut
cash prize pool
Ace/CTP side prizes.

Verify standings.

Scan winner QR.

Award prize once.

Prevent duplicate award.

==================================================
PHASE 7 — DGD RULES & STANDARDS
==================================================

Goal:

Finish the versioned DGD governing-document platform and connect it to actual
competition workflows.

==================================================
7.1 RULE DOCUMENT EDITOR
==================================================

Build protected:

RULES & STANDARDS STUDIO.

Documents:

DGD Rules of Play

Competition Code

Rating Standard

Division & Eligibility Standard

Payout Standard

Sanctioning/Tour Standard

Course/Layout Standard

Equipment Standard

Series/League Standard

Officials Standard

Conduct/Discipline

Safety Standard.

==================================================
7.2 DOCUMENT VERSIONING
==================================================

Each published document:

immutable version

published_at

effective_at.

Statuses:

DRAFT
PROPOSED
REVIEW
APPROVED
PUBLISHED
SUPERSEDED
RETIRED.

==================================================
7.3 EDITOR
==================================================

Support structured:

Section
Rule number
Title
Text
Penalty
Exceptions
Definitions
Examples
Related rules
Applicability
Change reason.

==================================================
7.4 CURRENT VS PROPOSED
==================================================

Published rule edit creates:

PROPOSED VERSION.

Show diff.

Never edit binding text in place.

==================================================
7.5 RULE NUMBERING
==================================================

Use DGD-owned numbering.

Do not copy PDGA numbering wholesale.

==================================================
7.6 ORIGINAL TEXT
==================================================

DGD rules should be independently written.

External rule systems may be used for:

coverage comparison
topic research
interoperability.

Do not reproduce copyrighted rulebook text unnecessarily.

==================================================
7.7 COMPLETE REMAINING DOCUMENT CONTENT
==================================================

Create complete first DRAFT content for every DGD governing document.

Use DGD's established principles:

fairness
clarity
player value
technology-aware competition
free rating access
cash allowed for Amateurs
professional Event operations
transparent financial standards
versioned competition truth.

All content remains editable until formally published.

==================================================
7.8 EVENT RULE REFERENCES
==================================================

Event-specific rule can reference:

DGD Rule number.

Example:

Hole 7
Mandatory Route

Related:
DGD 180.x.

==================================================
7.9 EVENT-AWARE RULES
==================================================

From scoring/Caddy:

prioritize:

current Hole rule
Event-specific rule
governing base rule.

==================================================
7.10 ASK ACE RULE LOOKUP
==================================================

Ask Ace Rules mode must retrieve from:

effective DGD Rule version

applicable Event rules

applicable approved waivers.

Answer with explicit Rule citations.

If rule text cannot determine answer:

state uncertainty

surface relevant rules

defer binding ruling to authorized official.

Do not invent rules.

==================================================
7.11 PDGA EVENTS
==================================================

For PDGA-sanctioned Events:

DGD custom Rules must not be presented as superseding mandatory PDGA rules.

Keep governing authority explicit.

==================================================
7.12 DGD EVENTS
==================================================

For DGD-sanctioned:

DGD Rules & Standards govern according to pinned versions.

==================================================
7.13 EVENT RULESET SNAPSHOT
==================================================

Event stores exact:

rules version
competition standard
rating standard
division standard
payout standard
sanctioning standard.

Historical Event never silently changes.

==================================================
7.14 DIVISION BUILDER
==================================================

Event Director receives a real Division Builder.

Select from effective DGD division definitions.

Event can enable only relevant divisions.

Eligibility resolver runs server-side.

==================================================
7.15 RULEBOOK MOBILE
==================================================

Fast:

Search

Rule quick cards

Current Event rules

Current Hole rules.

Do not present giant document walls during play.

==================================================
7.16 PHASE 7 ACCEPTANCE
==================================================

Publish test Rules v1.

Create Event using it.

Create v2 effective later.

Expected:

old Event remains v1.

new Event uses v2.

Ask Ace returns appropriate effective rule.

==================================================
PHASE 8 — DIVISION SYSTEM / DGD THRESHOLDS
==================================================

Goal:

Complete DGD's independent competition classification system.

IMPORTANT:

Do NOT invent final DGD Rating thresholds if they have not been approved by
the product owner.

The architecture, builder, simulations and versioning should be complete even
if final numeric thresholds remain awaiting approval.

==================================================
8.1 DIVISION PRINCIPLE
==================================================

DGD competitive class is independent from payout type.

Amateurs may accept cash.

Cash acceptance does NOT automatically make a player Professional.

==================================================
8.2 DIVISION DIMENSIONS
==================================================

Model independently:

competition_class

skill_class

age_class

junior/adaptive/etc eligibility

instead of encoding all meaning into one text code.

==================================================
8.3 INITIAL SKILL CLASSES
==================================================

Support:

OPEN

AMATEUR 1

AMATEUR 2

AMATEUR 3

AMATEUR 4.

Final DGD Rating ranges must be versioned.

==================================================
8.4 AGE PROTECTION
==================================================

Support first-class:

30+

40+

50+

55+

60+

65+

70+

75+

80+

as configured by governing standard.

30+ must be a legitimate DGD age-protected class.

==================================================
8.5 AGE + SKILL
==================================================

Architecture supports combinations such as:

30+ Open

30+ Amateur

40+ Open

40+ Amateur

and further skill protection if DGD chooses.

==================================================
8.6 AGE ELIGIBILITY RULE
==================================================

Store age rule in versioned Division Standard.

Do not implement inconsistent per-Event date logic.

==================================================
8.7 THRESHOLD ADMIN
==================================================

Create:

ADMIN → DIVISION STANDARD.

For each division:

minimum DGD Rating

maximum DGD Rating

age minimum

other eligibility rules

effective date

version.

==================================================
8.8 RATING DISTRIBUTION TOOL
==================================================

Before final thresholds are published:

analyze actual DGD rating population.

Show:

count
percentile
distribution
players per proposed division

for candidate thresholds.

==================================================
8.9 THRESHOLD SIMULATOR
==================================================

Admin can enter proposed thresholds.

Example:

A1 max ___
A2 max ___
A3 max ___
A4 max ___

Immediately show:

number of players
percentage
sample Rating distribution
players who would move divisions.

==================================================
8.10 30+/40+ AMATEUR
==================================================

Age-protected Amateur divisions should use the same configurable skill logic
unless DGD deliberately publishes separate age-specific Rating ranges.

Do NOT assume they require different Rating thresholds merely because they are
age protected.

If separate thresholds are desired:

support them.

==================================================
8.11 PLAY UP
==================================================

Players may generally enter stronger competition where policy permits.

==================================================
8.12 NO PLAY DOWN
==================================================

Players cannot enter a lower protected skill class when their effective
eligibility Rating exceeds the division range unless an approved exception
exists.

==================================================
8.13 ELIGIBILITY RATING SNAPSHOT
==================================================

Define clearly which DGD Rating determines Event eligibility.

Examples to support through rules:

registration snapshot
registration-close snapshot
other formal eligibility date.

Do not let continuously changing Rating create Event-day chaos.

==================================================
8.14 CASH DOES NOT CHANGE CLASS
==================================================

Test:

A2 Player wins $100 cash.

Expected:

classification remains determined solely by Rating/eligibility standard.

==================================================
8.15 SERIES DIVISION MOVEMENT
==================================================

Define what happens if Rating moves during Series:

stay in Series division
promotion for future Events
points handling

according to versioned Series/Division Standard.

==================================================
8.16 DO NOT BLOCK PRODUCT DEVELOPMENT ON FINAL NUMBERS
==================================================

If the product owner has not supplied final A1–A4 and age-protected Rating
limits:

finish:

schema
editor
resolver
simulator
UI
tests

and leave only:

PUBLISH FINAL DIVISION STANDARD

as WAITING FOR OWNER DECISION.

Do not hardcode arbitrary thresholds.

==================================================
8.17 FINAL NUMERIC DECISION REPORT
==================================================

If thresholds are still unset, return a recommendation report showing several
candidate models.

Example:

MODEL A — evenly distributed

MODEL B — competition-depth weighted

MODEL C — familiar skill-band model

For each show:

thresholds
player counts
percentages
pros/cons.

Do not automatically publish one.

==================================================
8.18 PHASE 8 ACCEPTANCE
==================================================

Test:

rating below threshold

rating exactly threshold

rating above threshold

30-year-old eligibility

29-year-old ineligible

40+ eligibility

play-up

blocked play-down

cash winner remains Amateur

eligibility snapshot remains stable.

==================================================
FINAL CROSS-SYSTEM INTEGRATION
==================================================

After all eight phases:

run complete regression.

==================================================
A. COURSE → EVENT
==================================================

Canonical Course

→ Layout Version

→ Event

→ Event Round

→ Physical Round

must preserve exact identity.

==================================================
B. COURSE → CADDY
==================================================

Caddy uses:

same Course geometry
same Layout Version
same Event Overlay.

==================================================
C. EVENT → RESULTS → DGD RATING
==================================================

Final results create/update canonical Physical Rounds once.

No duplicate observations.

Rating processing remains persisted/server authoritative.

==================================================
D. EVENT → SERIES
==================================================

Canonical results feed Series standings once.

==================================================
E. PLAYER QR
==================================================

Same canonical Player QR supports:

registration
check-in
prize award.

QR is identity lookup, not authentication.

==================================================
F. RULES
==================================================

Event uses pinned governing Standards.

Scoring/Caddy/Ask Ace all resolve the same versions.

==================================================
G. PERMISSIONS
==================================================

Course/Event/Series/Rules operations all use server-authoritative capability
checks.

==================================================
H. PLAY HOME
==================================================

Player can:

find people
form Round
start Round
score it
finish it
share it

without creating duplicate Round identities.

==================================================
I. MOBILE REGRESSION
==================================================

Test:

390px portrait

Course Directory
Course Studio
Play Home
Event
QR Check-In
Scoring
Rules
Series standings.

==================================================
J. DESKTOP REGRESSION
==================================================

Verify:

Course management
Event management
Series
Rule Studio
Admin Course Atlas.

==================================================
K. SECURITY
==================================================

Run Supabase/database advisors.

Fix:

RLS problems
unsafe views
unsafe functions
missing grants
excessive privileges.

==================================================
L. BUILD
==================================================

Final local/project build must succeed.

No new warnings/errors that indicate functional failure.

Cancelled page-load network requests are not treated as product errors when
they are legitimately caused by navigation/unmount.

==================================================
M. DO NOT PUBLISH AUTOMATICALLY
==================================================

Do not treat local completion as production verification.

At the end report:

READY TO PUBLISH

or:

BLOCKED.

The actual live-production validation happens only after deployment.

==================================================
FINAL COMPLETION REPORT
==================================================

Return one concise but complete report:

1. COURSE ATLAS
   - canonical Course count
   - remaining missing locations
   - source links
   - conflicts/review
   - Par provenance issues
   - Directory/map readiness

2. PERMISSIONS
   - capability system
   - Course approvals
   - Event staff
   - ownership transfer
   - finalized Event protection
   - registration migration

3. VERSION INTEGRITY
   - Layout Versions
   - Event pinning
   - Round snapshots
   - Tracker/Statboard integration

4. EVENT OPERATIONS
   - staff
   - tasks
   - volunteers
   - Event Day
   - check-in
   - closeout

5. PLAY
   - Looking-to-Play
   - local queue
   - invites
   - Open Rounds
   - friend tracking
   - Course/Event activity

6. SERIES / PRIZES
   - scoring
   - bonuses
   - qualification
   - Region Rumble import
   - awards
   - Series prize pool
   - QR awards

7. RULES
   - Rule Studio
   - governing documents
   - Event references
   - Ask Ace
   - Rule versions

8. DIVISIONS
   - Division Builder
   - age divisions
   - threshold system
   - eligibility resolver
   - final numeric values OR explicit owner-decision blocker

9. SECURITY
   - RLS
   - grants
   - advisors
   - unresolved findings

10. TESTING
   - mobile
   - desktop
   - permissions
   - history/versioning
   - build result

11. REMAINING BLOCKERS

Do not list something as complete unless it was implemented AND tested.