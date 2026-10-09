PHASE — EVENTS DISCOVERY 2.0
PLAYER-FACING EVENTS HUB / ALL CREATION + MANAGEMENT MOVES TO EVENT MANAGER

Redesign the Events section so it has one clear purpose:

DISCOVER WHAT IS HAPPENING IN DISC GOLF.

The Events area is for players and community members to:

Find events
Find leagues
Find Series
Find community/outreach events
Register
Join
Track
Follow
Check in
View schedules
View players
View results
View Series standings
See what is happening today / nearby.

The Events area is NOT where organizers create or manage events.

All:

creation
editing
staffing
operations
finance
course setup
registration administration
Series configuration
League configuration
outreach event creation

belongs inside:

EVENT MANAGER.

==================================================
1. HARD PRODUCT SEPARATION
==================================================

Establish two clear product roles:

EVENTS

= DISCOVER + PARTICIPATE.

EVENT MANAGER

= CREATE + MANAGE.

Do not mix them.

==================================================
2. REMOVE CREATION FROM EVENTS
==================================================

Remove from Events discovery pages:

+ New Event

Create Outreach Event

Create Community Event

TD Dashboard

host/organizer setup forms

event editing controls

Series creation

League creation.

These belong in Event Manager.

==================================================
3. AUTHORIZED ORGANIZER ACCESS
==================================================

If the current user manages Events:

Events may include one subtle contextual link:

MANAGE MY EVENTS →

This navigates to Event Manager.

Do NOT expose:

New Event
TD Dashboard
Edit Event

as competing primary actions on the discovery page.

==================================================
4. REMOVE DUPLICATE EVENT TRACKER ENTRY
==================================================

The global app already has:

Trackers.

Do not maintain a large:

Event Tracker

button in the Events header if it simply duplicates the Tracker destination.

Instead:

every Event card can have:

Track

Follow

Watch Live

where relevant.

Tracked Events appear in:

My Events

and:

Trackers.

==================================================
5. EVENTS INFORMATION ARCHITECTURE
==================================================

Replace the current:

All Events
My Events & Calendar
Outreach & Growth

model with a clearer player-facing structure:

DISCOVER

MY EVENTS

COMMUNITY EVENTS

Optionally:

SERIES

if Series discovery deserves a first-class destination.

Recommended top navigation:

[ Discover ] [ My Events ] [ Community ] [ Series ]

Keep this compact.

==================================================
6. DISCOVER IS DEFAULT
==================================================

Events opens to:

DISCOVER.

This should answer:

What's happening?

What's near me?

What's happening today?

What can I register for?

What are my friends playing?

What Series are active?

==================================================
7. DISCOVER HERO
==================================================

Simplify the large Events header.

Suggested:

EVENTS

Find tournaments, leagues, Series and community events.

Then compact actions:

Search

Near Me

Today

This Week.

Do not put organizer controls here.

==================================================
8. HAPPENING NOW
==================================================

At the top of Discover show contextual current activity.

Example:

HAPPENING NOW

● Portage Sanctioned Singles
Scoring live
[WATCH]

RR #6 Valpo Champs
Registration closes soon
[REGISTER]

Friday Night Glow
Tonight · 6:30 PM
[VIEW].

Only show items that are actually relevant/current.

==================================================
9. REMOVE GIANT "SCORING NOW" IF EMPTY
==================================================

If no Event is live:

do not reserve a large empty live card.

If one or more are live:

show a compact:

LIVE NOW

section.

==================================================
10. EVENT TYPE FILTERS
==================================================

Use understandable discovery filters:

ALL

TOURNAMENTS

LEAGUES

SERIES

COMMUNITY

CASUAL.

Do not make users understand internal Event architecture.

==================================================
11. SANCTIONING FILTERS
==================================================

Secondary filters may include:

DGD

PDGA

Unsanctioned

Other.

But sanctioning should not be the main Event taxonomy.

==================================================
12. SEARCH
==================================================

Search:

Event name

Course

City

State

Series

Organization

Division where appropriate.

==================================================
13. QUICK TIME FILTERS
==================================================

Provide:

Today

Tomorrow

This Week

This Weekend

Next 30 Days

Custom.

More useful than forcing date-picker use for common discovery.

==================================================
14. LOCATION
==================================================

Provide:

Near Me

Within 25 mi

50 mi

100 mi

State

Anywhere.

Do not require precise GPS.

==================================================
15. EVENT CARD REDESIGN
==================================================

Current Event cards are visually repetitive and crowded.

Create one canonical Event card.

Priority:

Event image / identity

Event name

Event type

Date/time

Course/location

Registration/status

friends / attendance where useful

primary CTA.

Example:

RR #6 VALPO CHAMPS

Tournament · Finale

SAT OCT 17

Rogers Lakewood Park
Valparaiso, IN

Registration Open

24 players

[REGISTER]

secondary:
Track
Details.

==================================================
16. DO NOT DOMINATE WITH SOURCE BADGES
==================================================

Current cards prominently show:

DGD

PDGA

source information.

Source/sanctioning remains visible but subtle.

Player priority is:

what
when
where
can I join.

==================================================
17. EVENT SOURCE DEDUPLICATION
==================================================

If Event exists on:

PDGA

Disc Golf Scene

UDisc

DGD

show ONE canonical Event.

Optional:

Listed on 3 sources.

Do not display duplicates.

==================================================
18. PRIMARY EVENT ACTION
==================================================

CTA changes by state.

Examples:

REGISTER

JOIN LEAGUE

VIEW EVENT

CHECK IN

WATCH LIVE

VIEW RESULTS.

Do not show several equally strong buttons.

==================================================
19. TRACKING
==================================================

Secondary action:

♡ TRACK

or:

FOLLOW.

Tracked Event appears in:

My Events

and Tracker ecosystem.

==================================================
20. SERIES CONTEXT
==================================================

Event card belonging to Series may show:

Region Rumble
Event 6 of 6

or:

FINALE.

Click Series name to open Series.

==================================================
21. SERIES DISCOVERY
==================================================

Create a clean Series browsing experience.

Series card:

REGION RUMBLE

6 Events

Next:
Valpo Champs · Oct 17

Your position:
3rd

[VIEW SERIES].

Only show personal position when relevant.

==================================================
22. COMMUNITY EVENTS REPLACES "OUTREACH & GROWTH"
==================================================

Rename:

OUTREACH & GROWTH

to something player-friendly such as:

COMMUNITY EVENTS

or:

COMMUNITY & OUTREACH.

Recommended:

COMMUNITY EVENTS.

This destination is discovery only.

==================================================
23. COMMUNITY EVENTS PURPOSE
==================================================

Community Events contains:

Course Cleanups

Clinics / Lessons

Fundraisers

Group Rounds

Meetups

Players Parties

Volunteer Events

Disc Golf Workshops

Charity Events

Other community gatherings.

==================================================
24. REMOVE CREATION FROM COMMUNITY EVENTS
==================================================

Remove:

Create outreach event

Create community event

hosting templates intended for event creation.

Those belong in:

Event Manager
→ Create Event
→ Community.

==================================================
25. COMMUNITY TYPE FILTERS
==================================================

Discovery filters:

ALL

CLEANUPS

GROUP ROUNDS

CLINICS

CHARITY

MEETUPS

VOLUNTEER.

These filter canonical Events.

==================================================
26. COMMUNITY EVENT CARDS
==================================================

Example:

COURSE CLEANUP

Rogers Lakewood Park

Saturday · 9:00 AM

14 volunteers interested

Bring gloves if you have them.

[JOIN]
[VIEW].

No organizer controls.

==================================================
27. EMPTY COMMUNITY STATE
==================================================

Current UI says:

You're not hosting an outreach event yet.

This is incorrect for a discovery page.

Replace with:

No community events match these filters.

[Show all upcoming]

or:

Nothing nearby yet.

[Explore farther away].

Do not mention whether the user is hosting.

==================================================
28. COMMUNITY DISCOVERY HERO
==================================================

Remove the current large:

Course Cleanup
Group Round
Clinic
Charity
Meetup

cards if they exist primarily as creation templates.

If useful for discovery:

turn them into compact filter chips.

Example:

🧤 Cleanups
🥏 Group Rounds
🎓 Clinics
❤️ Charity
☕ Meetups.

They filter Events.

They do not create Events.

==================================================
29. MY EVENTS
==================================================

MY EVENTS is completely player-centered.

It contains:

Registered

Joined

Tracked

Series

Past.

Do not mix organizer management here.

==================================================
30. MY EVENTS TOP SUMMARY
==================================================

Show the most useful next commitment first.

Example:

UP NEXT

Friday Night Glow

Oct 9 · 6:30 PM

Valparaiso University

REGISTERED

[VIEW EVENT].

==================================================
31. CALENDAR
==================================================

Keep Calendar.

But current screenshot shows a nearly empty giant month view while the
registered Event is not visually prominent enough.

Improve event visibility.

Each Event should render directly on calendar date.

==================================================
32. CALENDAR EVENT DOTS/CARDS
==================================================

Calendar day should show:

Event name

or compact colored item.

Example:

9
Friday Night Glow

17
Valpo Champs.

Do not make users read separate cards to understand calendar.

==================================================
33. CALENDAR FILTER
==================================================

Calendar may include:

Registered

Tracked

Series

Community

all depending on user settings.

==================================================
34. "UP NEXT"
==================================================

The current Up Next card says:

Nothing scheduled

despite the page showing a registered Event.

Fix data integration.

Up Next should use the same canonical participation records as My Events.

There must be one source of truth.

==================================================
35. MY EVENTS LIST
==================================================

Provide:

Upcoming

Past

Tracked

Registered.

The user should not need to use Calendar if they prefer a simple list.

==================================================
36. PARTICIPATION STATES
==================================================

Normalize user/Event relationship:

REGISTERED

WAITLISTED

JOINED

TRACKING

STAFF

VOLUNTEER

INTERESTED

COMPLETED.

Avoid different pages inventing their own relationship labels.

==================================================
37. TODAY
==================================================

Create useful:

TODAY

filter across Events.

Show:

events happening

leagues

community events

check-ins

live scoring.

==================================================
38. THIS WEEKEND
==================================================

This should be one of the strongest discovery shortcuts.

Disc golfers often plan around weekends.

==================================================
39. FRIEND ACTIVITY
==================================================

Where privacy permits:

Brandon is registered

3 friends are playing

2 Crew members attending.

This makes Event discovery social.

==================================================
40. COMPARE WITH FRIENDS
==================================================

Current My Events page has:

Compare with Friends.

Keep only if it provides meaningful value.

Prefer contextual:

3 friends attending

[See who]

rather than a large permanent header action.

==================================================
41. EVENT MAP
==================================================

Keep Map view for discovery.

Use canonical Course locations.

Map pins should represent Events.

Click:

Event preview.

==================================================
42. EVENT CALENDAR
==================================================

Calendar view in Discover should show Events matching current filters.

Separate from:

My Calendar

which shows personal Event relationships.

==================================================
43. WEEK VIEW
==================================================

Keep Week if useful, but ensure it has a distinct purpose.

For dense local schedules:

Week can be useful.

Do not have:

Calendar
Week
List
Cards
Table

if users are unlikely to need all five.

==================================================
44. REMOVE TABLE FROM NORMAL MOBILE
==================================================

Desktop may retain optional Table for power users.

Mobile discovery should focus:

Cards

List

Map

Calendar.

==================================================
45. SIMPLIFY VIEW SWITCHER
==================================================

Recommended:

Cards
List
Map
Calendar.

Move:

Table
Export

into:

More

or desktop-only utility.

==================================================
46. LAYOUT & EXPORT
==================================================

Current:

Layout & Export

does not belong prominently in player Event discovery.

Move exports to:

More

or Event Manager when administrative.

Player-facing Event discovery should not feel like reporting software.

==================================================
47. OUTREACH CREATION ROUTE
==================================================

Any old:

Create outreach event

route/button should redirect into:

Event Manager
→ Create Event
→ Community Event.

Do not maintain another Event creator.

==================================================
48. NEW EVENT ROUTE
==================================================

Likewise:

+ New Event

should live only in Event Manager.

If a deep legacy link exists:

redirect into Event Manager Create Event.

==================================================
49. EVENT MANAGER
==================================================

Event Manager remains fully capable for:

Create Event

Tournament

League

Series

Community Event

Glow

Doubles

Clinic

Fundraiser

Cleanup

Custom.

Discovery pages merely render canonical Events it creates.

==================================================
50. EVENT MANAGER NAVIGATION
==================================================

From Events an authorized organizer may have:

Manage My Events →

This goes to Event Manager.

Event Manager should NOT appear as another set of management panels inside
Events.

==================================================
51. GLOBAL TOP NAV CLEANUP
==================================================

Current navigation contains:

Play
Events
Courses
Feed
Community
Event Manager
Trackers
DG Statboard.

Per previous Home cleanup:

remove Feed as separate primary item.

Recommended desktop:

Play
Events
Courses
Community
Trackers
Statboard
Manage.

Manage may contain:

Event Manager
Course Management
Organization
Admin

according to permissions.

==================================================
52. EVENTS PAGE HEADER
==================================================

Remove current:

TD Dashboard

+ New Event

from player Events header.

Recommended header:

EVENTS

Find tournaments, leagues, Series and community events.

Optional actions:

Near Me

Calendar

Tracked.

Organizer-specific:

Manage Events →

small contextual link only.

==================================================
53. SHARE
==================================================

A generic page-level Share action is low value.

Prioritize sharing:

specific Event

specific Series.

Remove page-level Share if it does not provide a clear useful destination.

==================================================
54. PLAYER-FACING EVENT DETAIL
==================================================

Selecting an Event opens player Event page.

Sections:

Overview

Register / Participation

Schedule

Course & Caddy

Players

Series

Live / Results

Updates.

Show only relevant tabs.

==================================================
55. EVENT DETAIL MANAGEMENT
==================================================

For authorized staff:

small:

MANAGE EVENT

button routes to Event Manager workspace.

Do not inject administrative editing fields into player Event Detail.

==================================================
56. LIVE EVENT
==================================================

When Event active:

player-facing page emphasizes:

Check In

Schedule

Card / Tee Time

Caddy

Live Scores

Announcements

Results.

==================================================
57. POST EVENT
==================================================

Completed Event emphasizes:

Results

Payouts/Prizes

Photos

Series impact

Round ratings.

==================================================
58. EVENT STATUS MODEL
==================================================

Use canonical lifecycle:

DRAFT

PLANNING

PUBLISHED

REGISTRATION_OPEN

REGISTRATION_CLOSED

READY

LIVE

COMPLETE

ARCHIVED.

Discovery normally shows appropriate public states.

==================================================
59. DRAFTS
==================================================

Draft Events do not appear publicly unless intentionally previewed by
authorized staff.

==================================================
60. REGISTRATION STATUS
==================================================

Discovery cards should understand:

Opens soon

Open

Almost full

Waitlist

Closed

Day-of

Completed.

==================================================
61. CAPACITY
==================================================

Useful card:

42 / 72 registered.

Only show when meaningful.

==================================================
62. PLAYER VALUE
==================================================

Show useful Event details:

Entry fee

Format

Rounds

Course

Player pack

Added cash/value

where available.

Do not overload every card.

Put deeper information in Event Detail.

==================================================
63. MOBILE EVENTS HOME
==================================================

Mobile hierarchy:

EVENTS

Search

quick filters:
Today / Weekend / Near Me

tabs:
Discover / My Events / Community / Series

featured/relevant Event

Event cards.

No tiny desktop filter wall.

==================================================
64. MOBILE FILTER SHEET
==================================================

Advanced filters open bottom sheet:

Date

Distance

Type

Sanctioning

Division

Entry fee

Registration status

Course

Series.

==================================================
65. MOBILE MY EVENTS
==================================================

First:

UP NEXT.

Then:

Upcoming list.

Optional Calendar.

Do not default to giant month calendar on small phone.

==================================================
66. DESKTOP DISCOVER
==================================================

Desktop may use:

search/filter strip

results

cards/list/map.

Reduce vertical filter rows.

Current page has too many rows of controls.

==================================================
67. FILTER CONSOLIDATION
==================================================

Default visible filters:

Search

Date

Distance

Type

More Filters.

Do not permanently show:

multiple sanction pills
multiple type rows
view switches
filter reset

all at once.

==================================================
68. ACTIVE FILTERS
==================================================

Below filters show compact removable chips.

Example:

This Weekend ×
Within 50 mi ×
Tournaments ×.

==================================================
69. SORTING
==================================================

Default smart sort:

RECOMMENDED.

Other:

Soonest

Closest

Most Registered

Registration Closing.

Do not force distance-only ranking.

==================================================
70. RECOMMENDED SORT
==================================================

Use signals such as:

registration status

time

distance

friends

Series participation

saved Courses

tracked Organizations.

Avoid opaque excessive personalization.

==================================================
71. EVENT COUNTS
==================================================

Current page shows enormous counts such as:

3323 Events.

That can be useful but should not dominate.

Example:

3,323 events found

small text.

Focus on relevant results.

==================================================
72. DUPLICATE LEAGUE NIGHTS
==================================================

The current screenshot shows many separate Friday Night Glow league nights.

This is correct if they are canonical occurrence Events, but visually show
their League relationship.

Example:

NWI HIGH FLYERS FRIDAY NIGHT GLOW

Night 2 of 11

Valparaiso University

rather than making each look like an unrelated Event.

==================================================
73. FULL LEAGUE
==================================================

Click:

Friday Night Glow

can open League/Series container.

Individual nights remain canonical Events.

==================================================
74. LEAGUE CARD
==================================================

Occurrence card:

FRIDAY NIGHT GLOW

Night 2 of 11

Thu Oct 9

Glenn C. Nicholson

[JOIN NIGHT]

[VIEW LEAGUE].

==================================================
75. SERIES CARD
==================================================

Series container is not a Course-dependent Event.

Show:

event count

standings

next Event

Series schedule.

==================================================
76. COMMUNITY EVENT RELATIONSHIP
==================================================

Community/outreach events remain the same canonical Event entity.

They are filtered by:

event_type.

Do NOT create separate:

outreach_events

that duplicate Events.

==================================================
77. ONE EVENT ENTITY
==================================================

Reinforce:

Tournament

League Night

Community Cleanup

Clinic

Fundraiser

Players Party

Glow Event

are all canonical Events with enabled modules.

Different type does not mean separate disconnected database/product.

==================================================
78. DISCOVERY DATA
==================================================

Events Discovery reads public projection of canonical Event data.

Event Manager writes/manages canonical Event data.

Same records.

==================================================
79. EVENT SOURCE INGESTION
==================================================

Imported:

PDGA

UDisc

Disc Golf Scene

Events must reconcile into canonical Event identities.

Discovery should not render source duplicates.

==================================================
80. EXTERNAL REGISTRATION
==================================================

If an imported Event uses external registration:

REGISTER

may open external registration.

Clearly indicate:

External registration.

Do not create fake DGD registration.

==================================================
81. DGD REGISTRATION
==================================================

DGD-hosted:

REGISTER

uses canonical DGD registration.

==================================================
82. TRACK VS REGISTER
==================================================

Track:

follow updates.

Register:

participate.

Keep distinct.

==================================================
83. MY EVENTS DATA OWNER
==================================================

My Events derives from:

registration

membership

tracking

staff

volunteer

Series participation.

Do not maintain manually copied "My Event" records.

==================================================
84. CALENDAR DATA OWNER
==================================================

My Calendar derives from those same relationships.

Fix inconsistencies such as:

registered Event shown above calendar

while:

Up Next says nothing scheduled.

==================================================
85. COMMUNITY "I'M GOING"
==================================================

Community participation should feed My Events.

If user joins a cleanup:

it appears in:

My Events.

No special outreach-only calendar.

==================================================
86. STAFF EVENT
==================================================

If user staffs Event:

My Events can show:

STAFF.

But management still opens Event Manager.

==================================================
87. EVENT MANAGER CONTEXT
==================================================

Player Event page:

MANAGE EVENT

if authorized.

Click it:

Event Manager → selected Event workspace.

==================================================
88. EVENT CREATION CTA
==================================================

Only Event Manager should display:

+ CREATE EVENT.

No other page should have a second creator.

==================================================
89. SERIES CREATION
==================================================

Only:

Event Manager → Series & Leagues.

Never inside player Series discovery.

==================================================
90. LEAGUE CREATION
==================================================

Same.

Only Event Manager.

==================================================
91. COMMUNITY CREATION
==================================================

Only Event Manager.

Create Event
→ Community.

==================================================
92. PLAYER EVENT DISCOVERY LANGUAGE
==================================================

Use:

Find
Join
Register
Follow
Attend
Volunteer.

Avoid:

Create
Configure
Publish
Manage

unless linking explicitly to Event Manager for authorized organizer.

==================================================
93. EVENT EMPTY STATES
==================================================

Discovery empty:

No events match these filters.

[Clear Filters]

My Events empty:

Nothing on your schedule yet.

[Find Events]

Community empty:

No community events nearby.

[Explore farther]

Series empty:

No Series match these filters.

==================================================
94. NO HOSTING EMPTY STATES IN DISCOVERY
==================================================

Never show:

You're not hosting...

on the Events discovery side.

Hosting belongs in Event Manager.

==================================================
95. EVENT ART
==================================================

Where available use:

Event image

Course image

Series branding

instead of identical abstract graphics on every card.

This should feel like a sports/events app.

==================================================
96. VISUAL HIERARCHY
==================================================

Reduce:

borders

nested containers

dense administrative metadata.

Increase:

event identity

dates

Course imagery

status

friends/players

strong action buttons.

==================================================
97. DISCOVERY SHOULD FEEL ACTIVE
==================================================

Example:

THIS WEEKEND NEAR YOU

Valpo Champs
48 registered

Friday Night Glow
Tonight

Riverside Cleanup
12 volunteers

Region Rumble Finale
Registration closes tomorrow.

This is more useful than presenting database categories first.

==================================================
98. PLAY HOME INTEGRATION
==================================================

The new Play Home:

Today Near You

should use this same Event discovery system.

Click:

See All

opens Events with:

Today/Nearby filters already applied.

==================================================
99. COURSE PAGE INTEGRATION
==================================================

Course page:

UPCOMING EVENTS

uses canonical Event data.

See All:

opens Events filtered to that Course.

==================================================
100. COMMUNITY PAGE INTEGRATION
==================================================

Community may preview:

community events.

See All:

opens:

Events → Community.

No duplicate Event lists.

==================================================
101. SERIES / TRACKERS
==================================================

Tracking Event/Series uses existing Trackers system.

Do not create Event-specific duplicate tracker stores.

==================================================
102. RLS
==================================================

Public discovery must expose only:

published/public Event data.

Draft/private staff information protected.

Registration/private participation protected according to rules.

Do not fetch protected data then hide it in frontend.

==================================================
103. MANAGER SECURITY
==================================================

Removing management UI from Events does NOT replace backend security.

Event Manager operations still require capability-based server authorization.

==================================================
104. ADMIN
==================================================

Global Admin may see additional internal actions in:

Event Manager/Admin.

Do not contaminate player discovery UI merely because Global Admin is logged
in.

==================================================
105. DISCOVER ACCEPTANCE
==================================================

Open Events.

Expected:

player-facing discovery.

No:

New Event

TD Dashboard

Create outreach event.

Search/filter Event.

Register/track.

==================================================
106. MY EVENTS ACCEPTANCE
==================================================

Register for Event.

Expected:

appears immediately in:

My Events

Up Next

Calendar date.

No inconsistent states.

==================================================
107. COMMUNITY ACCEPTANCE
==================================================

Open:

Community Events.

Expected:

discover:

cleanups
clinics
charity
group Rounds
meetups.

No creation tools.

==================================================
108. ORGANIZER ACCEPTANCE
==================================================

Authorized TD opens public Event.

Expected:

small:

Manage Event

action.

Click:

Event Manager workspace.

No inline admin editor.

==================================================
109. CREATE ACCEPTANCE
==================================================

Need to create Cleanup.

Expected workflow:

Event Manager
→ Create Event
→ Community
→ Cleanup.

After publishing:

Event appears automatically under:

Events → Community.

==================================================
110. LEAGUE ACCEPTANCE
==================================================

League container with recurring nights.

Discovery shows:

League identity

individual nights

correct Course/date.

My Events reflects joined/registered nights.

==================================================
111. SERIES ACCEPTANCE
==================================================

Series has multiple different Course Events.

Series page does not require Course.

Each Event owns its Course.

==================================================
112. MOBILE ACCEPTANCE
==================================================

390px portrait:

Events immediately offers:

Discover
My Events
Community
Series

Search

Today
Weekend
Near Me.

No desktop filter matrix squeezed onto phone.

==================================================
113. DESKTOP ACCEPTANCE
==================================================

Desktop:

clean discovery

compact filters

no nested scroll areas

cards use space effectively.

==================================================
114. NAVIGATION ACCEPTANCE
==================================================

No duplicate:

Feed

Community

New Event

TD Dashboard

Event Tracker

management routes

at equal primary level.

==================================================
115. HARD RULE
==================================================

EVENTS ANSWERS:

WHAT'S HAPPENING?

WHAT CAN I JOIN?

WHAT AM I PLAYING?

EVENT MANAGER ANSWERS:

WHAT AM I RUNNING?

WHAT DO I NEED TO CONFIGURE?

WHAT NEEDS MY ATTENTION?

Never mix those two jobs.

==================================================
116. IMPLEMENTATION ORDER
==================================================

1. Audit Events routes/components
2. Remove creation/management CTAs from Events
3. Rename Outreach & Growth → Community Events
4. Remove community creation templates/actions
5. Consolidate navigation into Discover / My Events / Community / Series
6. Simplify Events header
7. Redesign filters
8. Redesign canonical Event card
9. Build Happening Now/Today shortcuts
10. Fix My Events data consistency
11. Improve Calendar
12. Build Community discovery
13. Improve League occurrence presentation
14. Improve Series discovery
15. Connect Manage Event → Event Manager
16. Redirect legacy create routes to Event Manager
17. Remove Event Tracker duplication where redundant
18. Clean desktop navigation
19. Clean mobile navigation
20. Verify event/source deduplication
21. Verify RLS/privacy
22. Test desktop/mobile
23. Fix regressions
24. production-ready verification.

==================================================
117. COMPLETION REPORT
==================================================

Return:

A. Events navigation
B. Events header cleanup
C. removed creation/admin actions
D. Discover redesign
E. filters
F. Event card redesign
G. live/current Events
H. My Events
I. Calendar
J. Community Events
K. League discovery
L. Series discovery
M. source deduplication
N. Event Manager handoff
O. Play Home integration
P. Course integration
Q. mobile UI
R. desktop UI
S. RLS/privacy
T. legacy route cleanup
U. remaining blockers.