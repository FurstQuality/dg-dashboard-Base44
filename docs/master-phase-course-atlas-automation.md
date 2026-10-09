MASTER PHASE — COURSE ATLAS AUTOMATION
ONE-BUTTON NATIONAL COURSE INGESTION + MAP BUILDING + LAYOUT GENERATION

Rework the existing DGD Course Atlas.

The underlying ingestion system has become powerful, but the administration UI
is now far too complicated.

The user should NOT need to understand:

- source listing counts
- ingestion regions
- individual queue jobs
- OpenStreetMap scan mechanics
- PDGA batches
- retry states
- raw duplicate candidates
- internal map-pin matching
- individual source adapters
- manual "build every missing layout" operations
- manual regional Course build-out buttons.

The Course Atlas should become:

A SIMPLE ONE-BUTTON AUTOMATED NATIONAL COURSE BUILD SYSTEM.

==================================================
1. PRIMARY USER EXPERIENCE
==================================================

The main Course Atlas screen should have ONE primary action:

[ UPDATE COURSE ATLAS ]

Alternative label if clearer:

[ RUN FULL COURSE UPDATE ]

This button starts/resumes the complete national Course-data pipeline.

The button does NOT run everything in the browser.

It queues durable server-side background work.

Closing the page or browser does not stop processing.

==================================================
2. WHAT THE ONE BUTTON DOES
==================================================

UPDATE COURSE ATLAS should automatically:

1. Discover Course listings from every enabled legitimate source
2. Parse saved/new source data
3. Match source listings to canonical DGD Courses
4. Detect and merge obvious duplicate source identities
5. Reject features incorrectly classified as Courses
6. Add legitimate new Courses
7. Recover missing Course locations
8. Improve approximate locations
9. Link PDGA/UDisc/Disc Golf Scene/OpenMap source identities
10. Import Course metadata
11. Detect physical Holes
12. Import Tee-pad coordinates
13. Import Basket-position coordinates
14. Detect alternate Tees
15. Detect alternate Basket positions
16. Reconcile source geometry with existing DGD geometry
17. Detect Course boundaries/features where available
18. Detect Layouts
19. Match Layouts to physical Holes
20. Build source-backed Layout drafts
21. Import real Hole Par when available
22. Import real Hole distance when available
23. Calculate derived map distance where Tee + Basket are known
24. Build useful partial Course maps
25. Publish safe missing information where policy allows
26. Create review items for uncertain/conflicting information
27. Retry temporary source failures
28. Update national/state coverage reports
29. Recalculate Course readiness
30. Produce a final run report.

The admin should not manually trigger each one.

==================================================
3. AUTOMATION ORCHESTRATOR
==================================================

Create/reuse a central server-side:

COURSE ATLAS ORCHESTRATOR.

Conceptually:

DISCOVER
→ INGEST
→ NORMALIZE
→ MATCH
→ RECONCILE
→ LOCATE
→ GEOMETRY
→ LAYOUTS
→ VALIDATE
→ PUBLISH SAFE DATA
→ REVIEW EXCEPTIONS
→ REPORT.

The orchestrator decides what each Course needs next.

Do not make the admin decide which job to run.

==================================================
4. PROCESS ONLY WHAT NEEDS WORK
==================================================

The Full Update does NOT need to rebuild 12,000 Courses from scratch.

For every Course determine:

What is missing?

What source is stale?

What changed?

What can be improved?

Then enqueue only required work.

Examples:

Course complete and unchanged
→ skip.

Missing Basket coordinates
→ geometry pass.

Missing Layout
→ Layout detection/build.

Missing Course location
→ location resolution.

Source data changed
→ reconcile changed fields.

==================================================
5. CONTINUOUS RESUME
==================================================

The system should remember progress.

If the scan is stopped by:

deployment
rate limit
worker restart
source outage

it resumes safely.

Do not restart the United States from region 1.

==================================================
6. MAIN COURSE ATLAS SCREEN
==================================================

Completely simplify the current screen.

Top:

COURSE ATLAS

"Build and maintain the DGD Course database automatically."

Large primary card:

COURSE ATLAS STATUS

Example:

12,466 U.S. Courses

11,926 on Directory Map

3,842 with Usable Course Maps

2,110 with Complete Primary Tee/Basket Maps

8,624 still improving

[ UPDATE COURSE ATLAS ]

Below button:

Last update:
Oct 6 · 8:42 PM

Status:
Running / Up to date / Attention needed.

==================================================
7. SIMPLE PROGRESS DISPLAY
==================================================

While running show:

COURSE ATLAS UPDATE

Discovering Courses         ✓
Matching & reconciling      ✓
Finding locations           83%
Building Course maps        41%
Building Layouts            35%
Checking results            Waiting

Overall:
42%

This is much easier to understand than:

41 / 2,430 regions
249 review pins
9 retrying
etc.

Those technical values remain available under:

Advanced Diagnostics.

==================================================
8. DO NOT CLAIM FAKE PERCENT PRECISION
==================================================

Overall progress should be based on actual queued/completed work.

Do not manufacture an arbitrary progress bar.

If exact remaining work cannot be known:

show stages and counts instead.

==================================================
9. SIMPLE RESULTS SECTION
==================================================

After/update during a run:

THIS UPDATE

+ 214 Courses discovered
+ 183 Course locations improved
+ 92 duplicates reconciled
+ 1,430 Tee pads imported
+ 1,612 Basket positions imported
+ 218 Course maps improved
+ 86 Layouts created
+ 127 Layouts improved

24 items need review.

[ REVIEW 24 ISSUES ]

Use actual values.

==================================================
10. THREE PRIMARY COURSE ATLAS VIEWS
==================================================

Reduce Course Atlas navigation to:

OVERVIEW

NEEDS REVIEW

REPORTS

Optionally:

ADVANCED

for super admins only.

Do not expose all ingestion internals in the main navigation.

==================================================
11. OVERVIEW
==================================================

Overview contains:

Update Course Atlas button

Current status/progress

National coverage

Latest update summary

High-priority issues.

Nothing else.

==================================================
12. NEEDS REVIEW
==================================================

All ambiguous/problematic information goes into ONE unified review queue.

Do not scatter reviews across:

duplicate Courses

missing locations

Hole order

pin matching

source conflicts

Layout corrections.

==================================================
13. REVIEW CATEGORIES
==================================================

Review queue can be filtered by:

COURSE IDENTITY

LOCATION

COURSE MAP

HOLE ORDER

LAYOUT

SOURCE CONFLICT

DUPLICATE

OTHER.

But default:

ALL ISSUES.

==================================================
14. ONE ISSUE AT A TIME
==================================================

The review experience should be simple.

Example:

ROBERSTON PARK DGC

We found two possible versions of this Course.

DGD:
Robertson Park Disc Golf Course

Open map:
Robertson Park DGC

420 ft apart
same city
similar name

Likely:
SAME COURSE

[ SAME COURSE ]
[ DIFFERENT COURSES ]
[ SKIP ]

Then immediately load next issue.

==================================================
15. DO NOT SHOW DATABASE-LIKE DUPLICATE TABLES
==================================================

The current screen displaying dozens of:

Disc Golf Net #5
Disc Golf Net #2
Disc Golf Basket #6

as possible Course duplicates indicates classification problems.

Fix the underlying classifier.

Individual:

Hole

Tee

Basket

Practice Basket

must NOT become canonical Course records.

Review should only show legitimate ambiguous Course identities.

==================================================
16. AUTO-REJECT OBVIOUS NON-COURSES
==================================================

Source features named/tagged as:

Hole 1

Basket #7

Tee #4

Practice Basket

disc golf net

must normally be classified as physical Course features.

They should NOT populate:

Possible duplicate Courses.

==================================================
17. LOCATION REVIEW
==================================================

Example:

BUOY DUNES

Course location unavailable.

Evidence:

PDGA:
Saint Paul Island, AK

UDisc:
No exact coordinate

Open map:
No match.

Actions:

[ FIND ON MAP ]

[ ENTER COORDINATES ]

[ LEAVE UNRESOLVED ]

Do not display 540 text-entry rows on the main Atlas screen.

==================================================
18. COURSE MAP REVIEW
==================================================

Example:

PALOMINO PARK

18 Holes

18 Tee candidates
17 Basket candidates
14 confidently assigned
4 need Hole assignment

[ REVIEW MAP ]

Open visual geometry reviewer.

Do not ask:

Fill in walking order

directly from a giant admin table.

==================================================
19. LAYOUT REVIEW
==================================================

Example:

MAIN 18

17/18 Hole relationships resolved

Hole 14 requires confirmation.

[ REVIEW LAYOUT ]

Open visual layout tool.

==================================================
20. REPORTS
==================================================

Reports should answer:

What does DGD know?

How much improved?

What remains?

Do not make reports into editing interfaces.

==================================================
21. NATIONAL REPORT
==================================================

Show:

CANONICAL U.S. COURSES

DIRECTORY MAP COVERAGE

USABLE COURSE MAPS

FULL PRIMARY MAPS

LAYOUT COVERAGE

SCORING-READY LAYOUTS

SOURCE COVERAGE

REMAINING REVIEW ITEMS.

==================================================
22. STATE REPORT
==================================================

Simple table:

State
Courses
On Directory
Usable Maps
Layouts
Needs Review.

Example:

TX     815     802     146     640     18
MI     729     718     201     620      9

Click a state for detail.

==================================================
23. COURSE DETAIL REPORT
==================================================

Click Course:

Identity
Location
Sources
Physical map
Layouts
Remaining issues
History.

Keep technical provenance available but not overwhelming.

==================================================
24. ADVANCED DIAGNOSTICS
==================================================

Move the current technical information here.

Super-admin only.

Tabs may include:

Sources

Queues

Regions

Parser Health

Source Health

Raw Matches

Failed Jobs.

This is where values such as:

41 / 2,430 regions

retrying 9

249 awaiting geometry review

belong.

Not on the normal Course Atlas page.

==================================================
25. HIDE REGIONAL SCAN MECHANICS
==================================================

Remove from the normal interface:

Read next region now

Line up 500 more

Build main layouts here

Import mapped Tee pads & baskets

Refresh national list

Build every missing layout

Fill in walking order.

The orchestrator performs these automatically.

Advanced controls may remain for debugging.

==================================================
26. ONE SOURCE PIPELINE
==================================================

PDGA

UDisc

Disc Golf Scene

Open map data

DGD-native data

should feed ONE Course Atlas.

Do not require admins to separately run:

PDGA Knowledgebase

Course Build-out

Tee/Basket Harvester

Layout Builder.

==================================================
27. SOURCE ADAPTERS REMAIN INTERNAL
==================================================

Each source may still have:

parser

queue

rate limit

health

retry policy.

But Course Atlas orchestrates them.

==================================================
28. SMART SOURCE ORDER
==================================================

For each Course use the cheapest/strongest relevant information first.

Example:

Existing DGD verified data
→ preserve.

Stored source snapshot available
→ parse without refetch.

Source link exists
→ refresh if due.

Geometry source not checked
→ check.

Do not blindly call every source every run.

==================================================
29. FIELD-LEVEL RECONCILIATION
==================================================

For each fact:

Course name

location

Hole count

Par

distance

Tee

Basket

Layout

keep provenance.

The orchestrator decides:

ACCEPT

PRESERVE EXISTING

CREATE CANDIDATE

REVIEW.

==================================================
30. VERIFIED DATA PROTECTION
==================================================

Never overwrite:

steward verified

admin verified

trusted DGD GPS

published structural data

simply because an external source differs.

Create reconciliation issue.

==================================================
31. STARTER MAP PHILOSOPHY
==================================================

Do not wait for Course perfection.

Automatically create/publish useful:

COMMUNITY MAPS

where safe.

Example:

18-hole Course

16 Tees
15 Baskets
14 complete Hole pairs.

Show that map.

Status:

COMMUNITY MAP
14/18 Holes mapped

[Help improve]

==================================================
32. MAP READINESS STATES
==================================================

Use simple public/admin states:

MAP NEEDED

PARTIAL MAP

COMMUNITY MAP

VERIFIED MAP.

Do not require every alternate Tee/Basket to reach Community Map.

==================================================
33. BUILD PHYSICAL ASSETS BEFORE LAYOUTS
==================================================

Correct architecture:

COURSE

→ PHYSICAL HOLES

→ TEES

→ BASKET POSITIONS

→ LAYOUTS.

The ingestion pipeline may create physical assets without a Layout.

==================================================
34. BUILD ALL JUSTIFIABLE LAYOUTS
==================================================

The orchestrator should attempt to construct EVERY Layout that source data
actually supports.

Examples:

Main 18

Short Layout

Long Layout

Blue Tees

White Tees

A Pins

B Pins

Championship Layout.

Do not artificially limit Course to one Main Layout.

==================================================
35. DO NOT INVENT A LAYOUT
==================================================

A source saying:

18 Holes

does not prove:

Main 18
Par 54.

Do not create fake scoring data.

==================================================
36. REMOVE THE CURRENT PAR-3 PLACEHOLDER RULE
==================================================

The existing Course Atlas says:

"Anything still without a layout gets a main layout with real hole numbers,
par 3 until someone measures them."

REMOVE THIS.

This violates DGD data-quality requirements.

Never assign:

Par 3

solely because Par is unknown.

Unknown Par = NULL.

==================================================
37. SCORING READY MUST MEAN REAL SCORING DATA
==================================================

The current UI showing:

12,563 of 12,563 Courses Ready to Score

must be audited.

A Course is NOT scoring ready simply because it has a Layout row.

Require a legitimate Layout with:

Hole sequence
+
Par for every scoring Hole.

==================================================
38. MAP READY DOES NOT REQUIRE PAR
==================================================

Course may have a complete physical map while Par remains unknown.

That is okay.

MAP READY
≠
SCORING READY.

==================================================
39. PARTIAL LAYOUT
==================================================

If source supports most of a Layout:

build Draft.

Example:

Hole 1 ✓
Hole 2 ✓
...
Hole 17 ✓
Hole 18 needs Basket association.

Do not throw away the other 17.

==================================================
40. AUTO-RESOLVE EASY ISSUES
==================================================

Do not create human review for trivial cases.

Examples:

same source ID

exact existing canonical relationship

identical source coordinate

obvious duplicate source listing

explicit Hole relation.

Resolve automatically.

==================================================
41. HUMAN REVIEW ONLY WHEN NECESSARY
==================================================

Review should be limited to:

ambiguous identity

structural conflict

uncertain Hole assignment

conflicting location

Course complex ambiguity

protected verified-data change.

==================================================
42. ISSUE PRIORITY
==================================================

Review queue ordering:

UPCOMING EVENT

HIGH-USE COURSE

ONE FIX FROM USABLE MAP

ONE FIX FROM SCORING READY

NORMAL

LOW PRIORITY.

==================================================
43. COURSE POPULARITY PRIORITY
==================================================

Use DGD data:

Rounds

Events

followers/saves

Course views

to prioritize data completion.

==================================================
44. EVENT COURSE PRIORITY
==================================================

Upcoming Event Course receives HOT processing automatically.

TD should not need to visit Course Atlas.

==================================================
45. RECONCILIATION REPORT
==================================================

After every run report:

Automatically resolved:
x

Needs review:
x

Protected conflicts:
x

Failed source requests:
x

Retries scheduled:
x.

==================================================
46. REPORT CHANGES, NOT JUST TOTALS
==================================================

Example:

COURSE ATLAS UPDATE #184

Duration:
2h 14m

New Courses:
137

Existing Courses enriched:
1,842

Locations improved:
214

Tee pads added:
1,093

Basket positions added:
1,281

Layouts built:
173

Layouts updated:
328

Duplicates merged:
42

Issues awaiting review:
31.

==================================================
47. RUN HISTORY
==================================================

Reports should retain prior Atlas runs.

Show:

date

duration

coverage improvement

issues

errors.

Useful for diagnosing regressions.

==================================================
48. AUTOMATIC DAILY MAINTENANCE
==================================================

After the first national build-out:

Atlas should maintain itself automatically.

Scheduled work:

new Course discovery

source refreshes

retry failed items

update changed Courses

process new geometry

reconcile changes.

Admin should not need to keep pressing the button forever.

==================================================
49. ONE BUTTON MEANING
==================================================

After automatic maintenance is active:

UPDATE COURSE ATLAS

means:

run everything due now

+
prioritize unfinished work.

It does not duplicate scheduled jobs.

==================================================
50. PAUSE
==================================================

Super Admin may:

Pause automation

Resume automation.

Pause should stop seeding new jobs.

Do not corrupt already-running work.

==================================================
51. FAILURE HANDLING
==================================================

Source unavailable?

Schedule retry.

Rate limited?

Back off.

Parser broken?

Mark source degraded.

One source failure does not stop entire Atlas.

==================================================
52. DO NOT MAKE ADMIN FIX SOURCE OUTAGES
==================================================

Normal Course Atlas should simply show:

1 source temporarily delayed.

Automatic retry scheduled.

Detailed HTTP/parser info goes under Advanced.

==================================================
53. HEALTH BANNER
==================================================

Example:

COURSE ATLAS HEALTHY
Last update 18 minutes ago.

or:

COURSE ATLAS NEEDS ATTENTION
31 data conflicts need review.

or:

SOURCE DELAY
Open map geometry temporarily rate limited.
Other processing continues.

==================================================
54. RECONCILIATION INBOX
==================================================

One button:

REVIEW ISSUES.

Within it:

Start Review.

Process items sequentially.

Show progress:

8 of 31 reviewed.

==================================================
55. BULK REVIEW
==================================================

Allow safe bulk actions for highly similar items.

Example:

42 exact duplicate source links.

[Accept All Exact Matches]

Do not offer bulk actions for ambiguous Course identity changes.

==================================================
56. ISSUE RESOLUTION SHOULD FEED THE ENGINE
==================================================

Once admin says:

These are different Courses

store that decision.

Do not show the same candidate again every future scan.

==================================================
57. COURSE CLASSIFIER FEEDBACK
==================================================

Likewise:

"Disc Golf Basket #5 is not a Course"

should improve persistent classification/rejection state.

Do not recreate the false Course next scan.

==================================================
58. DIRECTORY MAP INTEGRATION
==================================================

Every valid public canonical Course with a usable representative location
appears on Directory map.

Course physical-map completeness does not affect Directory visibility.

==================================================
59. DATA QUALITY LABELS
==================================================

Do not expose complex ingestion terminology publicly.

Public Course page:

Community Map

Verified Map

Help Improve.

Admin sees detailed provenance.

==================================================
60. EXISTING DATA CLEANUP
==================================================

As part of first automated Atlas run:

audit current data for:

fake Par 3 placeholders

false Course records from Tee/Basket/Hole features

generic duplicate layouts

source-only duplicates

invalid coordinates

legacy NULL readiness values

incorrect scoring-ready flags.

Repair safely.

Do not rewrite historical Round/Event snapshots.

==================================================
61. CURRENT SCREEN CLEANUP
==================================================

Remove the giant sections currently visible on one page:

Course Maps by State table
Tee Pads and Baskets Nationwide controls
Directory Map Coverage cards
Course Data at a Glance
Build-Out Stages
Source Listings
540 missing-location rows
50 duplicate rows.

These are useful DATA.

They are poor primary UX.

Move them into:

Reports

Review

Advanced.

==================================================
62. NEW OVERVIEW MOCK STRUCTURE
==================================================

COURSE ATLAS

Keep every DGD Course automatically updated.

[ UPDATE COURSE ATLAS ]

Status:
● Up to date

12,466 Courses
11,926 Directory locations
3,842 Community/Verified maps
10,921 scoring-ready Layouts

------------------------------------------------

LAST UPDATE

+ 42 Courses
+ 173 Maps improved
+ 86 Layouts built
+ 212 Tee/Basket positions

18 issues need review

[ REVIEW ISSUES ]

------------------------------------------------

NATIONAL COVERAGE

Directory Map      96%
Usable Course Map  31%
Scoring Ready      88%

[ VIEW REPORTS ]

Do not overcrowd this page.

==================================================
63. MOBILE/SMALL ADMIN VIEW
==================================================

Even though this is primarily admin desktop functionality:

make Overview responsive.

No 12-column metric grid.

Use stacked summary cards.

==================================================
64. ADVANCED MODE
==================================================

Provide:

Advanced Diagnostics

link for Super Admin.

This reveals:

source adapter controls

region progress

queue metrics

failed jobs

parser versions

manual requeue

raw source IDs.

Keep this out of normal workflow.

==================================================
65. SUPABASE IMPLEMENTATION REQUIREMENT
==================================================

Before backend/database changes:

check current Supabase changelog and docs.

Use existing canonical structures where possible.

Do not create duplicate ingestion/job systems.

==================================================
66. DURABLE BACKGROUND WORK
==================================================

Course Atlas automation must be server-side and durable.

Do not depend on React/browser state.

Use existing queue/job architecture where valid.

==================================================
67. RLS
==================================================

Raw ingestion:

server/admin.

Review actions:

authorized admin/steward based on scope.

Canonical public Course data:

appropriate read access.

Do not use authenticated-role-only policies as authorization.

==================================================
68. DATA API GRANTS
==================================================

Explicitly verify grants independently from RLS.

Do not expose:

raw scraper data

national worker queues

parser internals

through public API unnecessarily.

==================================================
69. VIEWS
==================================================

If summary/report views are client accessible:

ensure they preserve underlying security using current Supabase view practices.

==================================================
70. SECURITY DEFINER
==================================================

Do not use SECURITY DEFINER simply to bypass authorization problems.

==================================================
71. VERIFY ACTUAL OUTPUT
==================================================

Do not mark phase complete because:

button renders

jobs enqueue

build succeeds.

Test actual canonical data changes.

==================================================
72. ACCEPTANCE — ONE BUTTON
==================================================

Admin enters Course Atlas.

Clicks:

UPDATE COURSE ATLAS.

Expected:

entire due national pipeline begins.

No other button required.

==================================================
73. ACCEPTANCE — CLOSE BROWSER
==================================================

Close browser.

Return later.

Expected:

processing continued.

==================================================
74. ACCEPTANCE — NEW COURSE
==================================================

Source discovers legitimate new Course.

Expected:

canonicalized

location resolved

Directory added

geometry/Layout processing starts automatically.

==================================================
75. ACCEPTANCE — FALSE COURSE FEATURE
==================================================

Source:

Disc Golf Basket #5.

Expected:

classified as physical feature.

Does not become Course or duplicate Course review.

==================================================
76. ACCEPTANCE — MISSING LAYOUT
==================================================

Source contains enough legitimate Layout data.

Expected:

Layout Draft automatically constructed.

No admin:

"Build missing layout"

button needed.

==================================================
77. ACCEPTANCE — UNKNOWN PAR
==================================================

18 Holes known.

Par unknown.

Expected:

Par remains NULL.

No fake Par 54.

Not Scoring Ready until legitimate Par exists.

==================================================
78. ACCEPTANCE — PARTIAL MAP
==================================================

18 Hole Course:

15 usable complete Hole geometries.

Expected:

Community/Partial map available.

Missing Holes become improvement tasks.

==================================================
79. ACCEPTANCE — DUPLICATE
==================================================

Strong exact duplicate source record.

Expected:

automatically linked/merged safely.

Ambiguous duplicate:

Review Issue.

==================================================
80. ACCEPTANCE — SOURCE FAILURE
==================================================

Open map provider rate limits.

Expected:

Atlas continues other work.

Retry scheduled.

Overview simply indicates delayed source.

==================================================
81. ACCEPTANCE — VERIFIED DATA CONFLICT
==================================================

External source suggests moving verified Basket.

Expected:

protected.

Review issue generated.

==================================================
82. ACCEPTANCE — RUN REPORT
==================================================

When processing pass completes:

one understandable report appears.

Admin can see exactly:

what changed
what failed
what needs review.

==================================================
83. IMPLEMENTATION ORDER
==================================================

1. Audit existing Course Atlas actions/jobs.
2. Identify all current manual buttons.
3. Map them to orchestrator operations.
4. Build central Course Atlas run/orchestration model.
5. Build due-work resolver.
6. Connect existing source adapters.
7. Automate Course discovery.
8. Automate canonical matching.
9. Automate location repair.
10. Automate geometry harvesting.
11. Automate physical asset reconciliation.
12. Automate Layout detection/build.
13. Remove fake Par/layout creation.
14. Fix Scoring Ready definition.
15. Automate safe publication.
16. Build unified Review queue.
17. Persist review decisions.
18. Build run reports.
19. Build simplified Overview.
20. Move technical data to Advanced Diagnostics.
21. Enable scheduled maintenance.
22. Backfill/repair current Course data.
23. Run full national update.
24. Verify multi-state results.
25. RLS/grant audit.
26. Run database/security advisors.
27. Fix regressions.
28. production-ready verification.

==================================================
84. FINAL COMPLETION REPORT
==================================================

Return:

COURSE ATLAS AUTOMATION

A. manual actions eliminated
B. operations now automated
C. scheduled maintenance status

COURSES

D. canonical U.S. Courses
E. newly discovered
F. merged/reconciled
G. false Courses removed/reclassified
H. Directory visible
I. missing locations

MAPS

J. physical Holes
K. Tees
L. Basket Positions
M. Partial Maps
N. Community Maps
O. Verified Maps

LAYOUTS

P. Layouts detected
Q. Layouts created
R. Layouts updated
S. Scoring Ready
T. unknown-Par Layouts
U. fake/placeholder Pars removed

RECONCILIATION

V. issues auto-resolved
W. issues requiring human review
X. protected conflicts
Y. duplicate issues
Z. Hole-order issues

SYSTEM

AA. last run duration
AB. active jobs
AC. retries
AD. failed/dead-letter
AE. source health
AF. RLS/security results
AG. Data API grants
AH. advisor findings.

Most importantly:

AI. What does the admin still have to do manually?

The desired answer should be approximately:

"Click Update Course Atlas, then resolve only the small number of ambiguous
issues DGD cannot safely decide automatically."