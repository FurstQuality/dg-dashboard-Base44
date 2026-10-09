PHASE — PLAY HOME 2.0
LIVE DISC GOLF HOME / EVENTS + PLAYERS + COMMUNITY

Redesign the Play page into the primary DGD Home experience.

The current page contains useful features but still feels like a dashboard
made from separate widgets.

Current problems visible in the UI:

- Start Round and Active Round compete with each other.
- Friends Playing and Open Rounds are large separate cards.
- Large empty states consume too much space.
- Leagues Today has an internal scrolling list.
- Arena occupies nearly as much space as actual local disc golf activity.
- Recent Play consumes another separate strip.
- Weather is oversized.
- "Your play status lives in the header" explanatory text adds clutter.
- Feed and Community still appear as separate primary navigation concepts.
- Everything has nearly equal visual priority.
- Users must visually scan the entire page to understand what is actually
  happening around them.

The new Home should answer immediately:

WHAT CAN I PLAY RIGHT NOW?

WHO CAN I PLAY WITH?

WHAT EVENTS OR LEAGUES ARE HAPPENING?

WHAT IS MY DISC GOLF COMMUNITY DOING?

The Home page should drive:

PLAY
JOIN
REGISTER
INVITE
MESSAGE
FOLLOW
CHECK IN
WATCH
EXPLORE.

Do not turn this into another analytics dashboard.

==================================================
1. NEW PAGE HIERARCHY
==================================================

Use five primary areas:

1. PLAY NOW
2. HAPPENING NOW
3. PLAY TOGETHER
4. TODAY / COMING UP
5. COMMUNITY PULSE

Secondary quick links may follow.

Do not give every feature its own giant card.

==================================================
2. REMOVE USER "ARRANGE LAYOUT"
==================================================

Remove:

Arrange Layout

from the normal Play Home.

The Home should have an intelligent fixed hierarchy.

The application determines what is important based on context.

Do not ask users to design their own dashboard.

==================================================
3. REMOVE OVERVIEW / PRACTICE PAGE TABS
==================================================

Evaluate whether the current:

Overview
Practice

large tab cards are still necessary.

Recommended:

Remove them as major Home tabs.

Practice becomes a Play action:

Start Practice

or:

Play → Practice.

Do not dedicate significant Home space to mode navigation.

==================================================
4. PLAY NOW HERO
==================================================

Replace the existing Start Round + active Round combination with one adaptive:

PLAY NOW

surface.

If no active Round:

PLAY NOW

[ Start a Round ]

secondary actions:

[ Find Players ]
[ Looking to Play ]
[ Find Event ]

If active Round:

ROUND IN PROGRESS

Rogers Lakewood Park
Main 27
Hole 7 / 27
-2

[ RESUME ROUND ]

secondary:

Card
Caddy.

Do NOT simultaneously show another Start Round card unless clearly secondary.

==================================================
5. ACTIVE ROUND TAKES PRIORITY
==================================================

When an active Round exists:

Resume Round is the strongest CTA on the entire page.

Starting another Round should be available behind:

More

or secondary action.

Do not visually encourage accidental parallel scoring Rounds.

==================================================
6. COMPACT WEATHER
==================================================

Reduce the giant weather panel.

Use something like:

72° · Clear
11 mph SW
Good conditions

[Forecast]

Place near the Play Now area.

Do not allow weather to dominate the Home page.

==================================================
7. SAFETY WEATHER
==================================================

If legitimate severe weather/safety conditions exist:

weather can temporarily become prominent.

Normal weather remains compact.

==================================================
8. HAPPENING NOW
==================================================

Create a major:

HAPPENING NOW

section directly below Play Now.

This is the signature DGD Home feature.

Example:

7 Looking to Play

3 Open Rounds

6 Leagues Today

2 Events Today

12 Friends/Crew Active

Tap any item to filter/expand the relevant activity.

==================================================
9. ACTIVITY CHIPS
==================================================

Use interactive sports-style chips/cards.

Example:

🟢 7 LOOKING

🥏 3 ROUNDS FORMING

🏆 2 EVENTS TODAY

📅 6 LEAGUES

👥 4 FRIENDS PLAYING.

Do not style these as business KPI tiles.

They are actions.

==================================================
10. ZERO COUNTS
==================================================

Do not show large empty panels.

Example:

0 Open Rounds

should become:

No open rounds nearby.

[Post one]

or the chip may disappear if another action is more relevant.

==================================================
11. HAPPENING NOW TIMELINE
==================================================

Under the summary chips create one combined chronological/activity stream.

Possible item types:

PLAYER_LOOKING

OPEN_ROUND

LEAGUE

EVENT

FRIEND_PLAYING

EVENT_CHECKIN

ROUND_INVITE

JOIN_REQUEST

COURSE_ACTIVITY.

All use one visual system.

==================================================
12. DO NOT CREATE DUPLICATE ENTITIES
==================================================

"Happening Now" is a presentation layer.

It references:

canonical Event
canonical Round
canonical Player
canonical Course
canonical League.

Do not create duplicate Home-specific Event/Round records.

==================================================
13. HOME ACTIVITY RANKING
==================================================

Rank activity by usefulness.

Suggested initial factors:

user has direct invitation

registered Event today

active Round

same/saved Course

friend/crew relationship

time proximity

distance

registration deadline

open-player spots

user preferences.

Do not simply sort everything by newest timestamp.

==================================================
14. DIRECT ACTION ALWAYS WINS
==================================================

Examples:

Brandon invited you to play

should rank above:

random league 45 miles away.

Your Event check-in is open

should rank above:

general Community activity.

==================================================
15. PLAY TOGETHER
==================================================

Replace current separate:

Friends Playing

and:

Open Rounds

cards with one:

PLAY TOGETHER

section.

Tabs/filters inside:

Looking
Rounds
Friends
Crew.

Keep this compact.

==================================================
16. LOOKING TO PLAY
==================================================

Default Play Together view should prioritize:

players actively looking for a game.

Example:

LOOKING NOW

Brandon
DGD 927
Available until 6 PM

Rogers Lakewood preferred
or anywhere nearby

[ Invite ]
[ Message ]

Sarah
Available within an hour
2 players interested

[ Join Group ].

==================================================
17. "I'M LOOKING TO PLAY"
==================================================

Provide a prominent quick action:

I'M LOOKING TO PLAY

This should take only a few taps.

Ask:

WHEN?

Now
Within an hour
Later today

WHERE?

Nearby
Specific Course.

Optional advanced:

Format
Pace
Skill preference
Players needed.

==================================================
18. PLAY STATUS
==================================================

Continue the persistent DGD Play Status system.

Examples:

AVAILABLE
LOOKING TO PLAY
HEADING TO COURSE
PLAYING
PRACTICING
AT EVENT.

Header status remains useful.

Remove explanatory Home text such as:

"Your play status lives in the header..."

The interface should explain itself.

==================================================
19. STATUS AUTOMATION
==================================================

When DGD already knows the truth:

derive status.

Active casual Round:
PLAYING.

Practice:
PRACTICING.

Active Event Round:
PLAYING EVENT.

Event check-in:
AT EVENT.

Do not force manual updates.

==================================================
20. LOOKING STATUS REMAINS EXPLICIT
==================================================

Looking to Play is an intentional social signal.

It must have:

visibility

time window

expiration.

Do not infer "looking" just because someone opened DGD.

==================================================
21. OPEN ROUNDS
==================================================

Open Rounds live inside:

PLAY TOGETHER.

Example:

ROGERS LAKEWOOD

3:30 PM

Singles

2 / 4 Players

Brandon
Mike

2 spots open

[ JOIN ].

==================================================
22. POST OPEN ROUND
==================================================

Primary Play Together action:

+ POST A ROUND

Fields:

Course
Start time
Format
Players needed
Visibility.

Advanced preferences remain optional.

==================================================
23. FRIENDS CURRENTLY PLAYING
==================================================

Friends/Crew view shows:

Brandon
Playing Rogers Lakewood
Hole 8 / 18

[Follow]
[Message].

Use existing Tracker architecture.

Do not build another Round watcher.

==================================================
24. AVAILABLE FRIEND
==================================================

Example:

Sarah
Available to play

[Invite].

One tap starts:

select existing Round

or:

create Round.

==================================================
25. PLAY TOGETHER EMPTY STATE
==================================================

Do NOT show:

Nobody in your crew is out playing yet...

inside a huge empty card.

Instead:

Nobody in your crew is active right now.

[Looking to Play]
[Invite Friend].

Keep it small.

==================================================
26. TODAY / COMING UP
==================================================

Combine the current giant:

Leagues happening today

with nearby Event activity.

New section:

TODAY NEAR YOU

Content types:

League

Tournament

Casual organized play

Clinic

Fundraiser

Community Event

Glow

Doubles.

==================================================
27. ONE EVENT CARD DESIGN
==================================================

Example:

TONIGHT · 5:30 PM

Portage Sanctioned Singles

Glenn C. Nicholson DGC
17 mi

League · PDGA

18 players

[VIEW]
[JOIN / REGISTER]

Do not display source metadata as the primary content.

==================================================
28. SOURCE LABELS
==================================================

Current cards prominently show:

PDGA

UDisc

Listed on 2 sites.

Keep provenance available but reduce visual importance.

The user cares first about:

WHAT

WHEN

WHERE

CAN I JOIN?

==================================================
29. EVENT DEDUPLICATION
==================================================

If the same league/event exists on:

PDGA

UDisc

Disc Golf Scene

DGD

show it once.

Use canonical Event identity.

Optional small label:

Listed on 2 sources.

==================================================
30. NO INTERNAL SCROLL BOX
==================================================

The current League list has its own scrollbar.

Remove this pattern from Home.

Show:

3–5 best items.

Then:

SEE ALL EVENTS.

The Home page itself scrolls normally.

==================================================
31. TODAY RANKING
==================================================

Rank:

registered Event

saved/followed Event

friend participation

nearby

starting soon

registration available

saved Course

before generic distant activity.

==================================================
32. YOUR EVENT TODAY
==================================================

If user is registered:

YOUR EVENT TODAY

should become one of the strongest Home cards.

Example:

RR #6 VALPO CHAMPS

Check-in:
OPEN

Round 1:
10:00 AM

[CHECK IN]
[EVENT CADDY]
[VIEW EVENT].

==================================================
33. EVENT STAFF HOME
==================================================

If user is authorized Event staff and Event is today:

show contextual:

MANAGE TODAY'S EVENT

not a permanent giant Event Manager module.

==================================================
34. REGISTERED LEAGUE
==================================================

If League night is today:

YOUR LEAGUE TONIGHT

6:00 PM

[VIEW NIGHT]
[CHECK IN].

==================================================
35. COMING UP
==================================================

Below Today:

COMING UP

Show only highly relevant:

registration closing soon

Events user follows

Series user participates in

nearby major Events.

Do not turn Home into full Event Directory.

==================================================
36. COMMUNITY PULSE
==================================================

Add:

COMMUNITY PULSE

near lower Home.

This replaces the need for Social Feed to be the Home itself.

Show perhaps:

3–5 relevant recent items.

Examples:

friend Round result

local ace

Course condition update

Event announcement

photo

local club post.

==================================================
37. COMMUNITY PULSE CTA
==================================================

End:

VIEW COMMUNITY FEED.

The Feed remains full-featured under:

Community → Feed.

==================================================
38. REMOVE TOP-LEVEL FEED DUPLICATION
==================================================

Current navigation still shows:

Feed

and:

Community.

Clean this up.

Recommended:

Community
  Feed
  Clubs / Groups
  Posts
  other social features.

Remove Feed as a competing primary top-level destination.

==================================================
39. ARENA
==================================================

Arena is useful but currently takes too much Home space.

Move it lower.

Default Home representation:

ARENA

King of the Hill:
#1

2 friends available for a challenge

[OPEN ARENA].

Do not permanently show all challenge game choices.

==================================================
40. ARENA GAMES
==================================================

Distance Derby

Trick Shot Throwdown

Form Check Duel

live inside Arena.

Do not show three game pills permanently on Home unless contextually relevant.

==================================================
41. RECENT PLAY
==================================================

Current:

Recent Play
1 this week
1 last 30 days
1 Courses

does not need its own wide Home strip.

Replace with small:

YOUR PLAY

Last:
Glenn C. Nicholson · Oct 5

This week:
1 Round

[View History].

Or move detailed Recent Play to:

Me / Statboard.

==================================================
42. EXPLORE DGD
==================================================

Add a compact quick-link area to draw users into other major features.

Potential cards:

FIND A COURSE

FIND AN EVENT

TRACK PLAYERS

MY STATBOARD

MY BAG / CADDY

COMMUNITY.

Do not duplicate full navigation.

==================================================
43. CONTEXTUAL EXPLORE
==================================================

Adapt quick links.

Example:

user has never played tracked Round:

Start Your First Round.

user has upcoming Event:

Event Caddy.

user has no saved Courses:

Find Courses Near You.

==================================================
44. COURSE ACTIVITY
==================================================

DGD Course data should contribute to Home.

Example:

ROGERS LAKEWOOD

3 players looking

2 open Rounds

Course conditions:
Good

[VIEW COURSE].

==================================================
45. COURSE ACTIVITY PRIVACY
==================================================

Never expose individual exact location without permission.

Aggregate Course-level activity is preferred.

==================================================
46. COMMUNITY CONDITIONS
==================================================

Important Course condition can appear contextually:

⚠ COUNTRYSIDE

Hole 12 temporarily closed.

Only surface meaningful/current conditions.

Do not fill Home with maintenance reports.

==================================================
47. LIVE PLAYER ACTIVITY
==================================================

Happening Now may display:

Brandon started a Round
Rogers Lakewood

Sarah is looking to play

Local league check-in opened

Valpo Champs registration closes tonight.

This gives the Home energy.

==================================================
48. NOT AN INFINITE ACTIVITY FEED
==================================================

Do not convert Happening Now into another Social Feed.

Activity entries must be:

current

actionable

play-related.

Community posts belong in Community Pulse.

==================================================
49. HOME ITEM LIFECYCLE
==================================================

Items should disappear when stale.

Examples:

Looking intent:
expires.

Open Round:
disappears after start/closure.

League:
moves out after completion.

Invitation:
disappears once resolved.

Do not build permanent clutter.

==================================================
50. MOBILE-FIRST DESIGN
==================================================

Mobile hierarchy:

HEADER
status + compact weather

PLAY NOW

HAPPENING NOW CHIPS

PLAY TOGETHER

TODAY NEAR YOU

COMMUNITY PULSE

EXPLORE.

Everything stacked.

==================================================
51. MOBILE PLAY NOW
==================================================

If active Round:

large:

RESUME ROUND

sticky action may appear at bottom.

Otherwise:

+ PLAY

opens:

Start Round
Looking to Play
Post Open Round
Practice.

==================================================
52. MOBILE HAPPENING NOW
==================================================

Use horizontal chips or compact counters.

Do not make a grid of eight statistics.

==================================================
53. MOBILE PLAYER CARDS
==================================================

Looking queue:

avatar

name

status

Course/area

time

one primary button.

Keep cards short.

==================================================
54. DESKTOP STRUCTURE
==================================================

Desktop suggested layout:

PLAY NOW
full width

HAPPENING NOW
full width

PLAY TOGETHER       TODAY NEAR YOU
~50%                ~50%

COMMUNITY PULSE     EXPLORE DGD
~65%                ~35%

ARENA
compact lower section.

Do not create four equal dashboard boxes.

==================================================
55. DESKTOP DENSITY
==================================================

Use fewer borders and nested cards.

Group related content visually.

Avoid:

card inside card inside card.

The current app still feels too much like enterprise software.

==================================================
56. SPORTS-APP FEEL
==================================================

Use:

avatars

Course images

small player stacks

time labels

activity status

Event artwork

live indicators

strong CTAs.

Reduce:

administrative labels

source text

dense explanatory paragraphs.

==================================================
57. SHORTER COPY
==================================================

Current UI contains explanations such as:

"Rounds players posted with a course, tee time, and format so others can ask
to join."

This level of explanation should not remain permanently visible.

Use:

OPEN ROUNDS

Find a card to join.

or no explanation once feature is understandable.

==================================================
58. REMOVE DATA-SOURCE COPY FROM NORMAL HOME
==================================================

Current UI contains:

Data source:
Rounds scored in DG Dashboard...

and Arena data-source explanations.

Remove from normal Home.

Put provenance/help behind:

info tooltip

or About Data.

Player Home should not read like a data dashboard.

==================================================
59. EVENT ACTION LANGUAGE
==================================================

Use context-specific CTAs.

Examples:

REGISTER

JOIN LEAGUE

CHECK IN

VIEW EVENT

FOLLOW

WATCH LIVE.

Avoid generic:

Open.

==================================================
60. PERSONALIZATION
==================================================

Home priority should adapt automatically.

Do not require user customization.

Possible context:

active Round

active Looking intent

registered Event

friend activity

saved Course

saved Series

location/area

time of day.

==================================================
61. MORNING EXAMPLE
==================================================

Morning with Event today:

Valpo Champs
Check-in opens 8:30 AM

Friends attending

Course conditions

Event Caddy.

That outranks casual Arena content.

==================================================
62. NORMAL AFTERNOON EXAMPLE
==================================================

No Event:

4 players looking nearby

1 open Round at Rogers

League at 6 PM

Friends playing.

Those become primary.

==================================================
63. QUIET DAY EXAMPLE
==================================================

No local activity:

PLAY NOW

Find Course

I'm Looking to Play

Upcoming Events

Community Pulse.

Do not fill screen with empty boxes.

==================================================
64. LOOKING QUEUE DATA
==================================================

Use durable:

Play Intent

records.

Do not derive the queue solely from Realtime Presence.

Closing the app should not immediately remove a valid:

Looking until 6 PM

intent.

==================================================
65. REALTIME PRESENCE
==================================================

Use Realtime Presence only for limited ephemeral awareness.

Examples:

online

currently active

currently viewing a Round.

Durable play state lives in database.

==================================================
66. REALTIME UPDATES
==================================================

When:

player starts looking

player joins Round

Round fills

Event check-in opens

friend starts Round

Home should update quickly.

Use appropriate realtime transport while keeping database state authoritative.

==================================================
67. HOME AGGREGATION SERVICE
==================================================

Do NOT make the browser issue dozens of unrelated queries and assemble the
entire Home itself.

Build/reuse a bounded server-side Home/activity query layer.

It may produce typed Home items such as:

type
entity_id
priority
starts_at
distance
relationship
actions.

==================================================
68. DO NOT DUPLICATE SOURCE DATA
==================================================

The Home aggregation layer references canonical records.

It does not own:

Event title

Course name

Player profile

Round score.

==================================================
69. HOME QUERY SECURITY
==================================================

All Home activity must respect:

Event visibility

Play Intent visibility

friend/crew relationships

blocks

Course status

Round membership

privacy.

Do not return private items and hide them only with React.

==================================================
70. BLOCKED USERS
==================================================

Blocked users must not appear through:

Looking queue

Friend activity

Open Round recommendations

Community Pulse

direct invites.

Enforce server-side.

==================================================
71. GEO QUERY
==================================================

Use indexed geographic queries where needed for:

nearby players

nearby Rounds

nearby Events

nearby Courses.

Avoid repeatedly calculating nationwide distances client-side.

==================================================
72. LOCALITY SETTINGS
==================================================

Allow user to choose:

Nearby radius

or city/area.

Do not require exact live GPS.

==================================================
73. EVENT SEARCH AREA
==================================================

"Today Near You" should be easy to widen.

Example:

Within 25 mi
Within 50 mi
Within 100 mi.

Remember reasonable preference.

==================================================
74. QUICK REGISTRATION
==================================================

If Event allows DGD registration:

REGISTER

should open direct registration.

If external registration:

clearly route externally.

Do not create duplicate registration records without source reconciliation.

==================================================
75. SERIES CONTEXT
==================================================

If Event belongs to a Series:

show small:

Region Rumble · Event 6 of 6

Current Series position:
3rd

where useful.

Do not overwhelm normal Event card.

==================================================
76. SERIES FINALE
==================================================

If user is qualified for Finale:

QUALIFIED

should make Finale Event particularly prominent.

==================================================
77. HOME NOTIFICATIONS
==================================================

Direct play-related notifications should appear contextually on Home.

Examples:

Round invitation

Join request

Event check-in

Schedule change.

Do not rely only on notification bell.

==================================================
78. NEW USER HOME
==================================================

A new user with:

no friends
no Rounds
no registrations

must still have a useful Home.

Show:

Start a Round

Looking to Play

Courses Nearby

Events Today/Upcoming

Community Pulse.

==================================================
79. EXISTING PLAYER HOME
==================================================

Active user sees:

friends

Crew

Events

Series

recent Course activity.

==================================================
80. EVENT DIRECTOR HOME
==================================================

If Event Director has Event today:

small contextual:

MANAGE TODAY

button.

Do not transform player Home into Event Admin dashboard.

==================================================
81. NAVIGATION CLEANUP
==================================================

Desktop target:

Play
Events
Courses
Community
Trackers
Statboard
Manage

where Manage appears based on authorization/usefulness.

Feed belongs under Community.

Avoid:

Play
Events
Courses
Feed
Community
Event Manager
Trackers
Statboard

all at equal level.

==================================================
82. MOBILE NAVIGATION
==================================================

Target:

PLAY
COURSES
EVENTS
COMMUNITY
ME.

Secondary:

Trackers
Statboard
Manage

inside appropriate destinations/menu.

==================================================
83. HOME ROUTE
==================================================

Play remains authenticated default Home.

Do not introduce another:

Dashboard

or:

Overview

as separate Home.

==================================================
84. REMOVE REDUNDANT ROUTES
==================================================

Audit:

old Social Feed Home

old Play Overview

other landing routes.

Use redirects as needed.

Do not leave multiple competing home pages.

==================================================
85. PERFORMANCE
==================================================

Load highest-priority Home content first.

Example:

active Round
invites
Looking matches.

Defer:

Community Pulse
Arena

if needed.

==================================================
86. SKELETONS
==================================================

Use lightweight loading states.

Do not create giant empty cards saying:

Loading...

for every Home module.

==================================================
87. ERROR ISOLATION
==================================================

Failure of:

Arena

Community Feed

external Event source

must not prevent:

Start Round

Resume Round

Looking to Play.

==================================================
88. NO PAGE-LOAD RATING CALCULATION
==================================================

Home only reads persisted DGD Rating/status.

Do not trigger Rating recomputation while building player cards.

==================================================
89. ANALYTICS
==================================================

Internally measure:

Start Round clicks

Looking posts

Player invites

Open Round joins

Event views

Event registrations

Course views

Rounds started from matchmaking.

Do not expose these product metrics as Home KPI cards.

==================================================
90. FIRST ACCEPTANCE — ACTIVE ROUND
==================================================

User has active Round.

Expected top of Home:

RESUME ROUND.

No duplicate active-Round card.

Start-new-round action is secondary.

==================================================
91. SECOND ACCEPTANCE — PLAYER LOOKING
==================================================

User posts:

Looking until 6 PM.

Expected:

status updates.

Player appears in appropriate visible queues.

Refreshing/closing app does not remove valid intent.

==================================================
92. THIRD ACCEPTANCE — LOCAL ACTIVITY
==================================================

Nearby:

3 Looking players

2 open Rounds

1 League tonight

1 Event today.

Home displays these in:

Happening Now

and appropriately ranked content.

==================================================
93. FOURTH ACCEPTANCE — INVITE
==================================================

Friend invites user.

Expected:

invite appears near top.

Accept.

Canonical Round membership updates.

Home changes appropriately.

==================================================
94. FIFTH ACCEPTANCE — EVENT
==================================================

User has registered Event today.

Expected:

Event card ranks very high.

Actions:

Check In
Event Caddy
View Event.

==================================================
95. SIXTH ACCEPTANCE — NO ACTIVITY
==================================================

No local activity.

Expected:

no giant blank Friends/Open Round cards.

Instead:

Be the first to look for a group

Post a Round

Find Events

Find Courses.

==================================================
96. SEVENTH ACCEPTANCE — MOBILE
==================================================

390px portrait.

Within first useful viewport user can see:

Play Now

Happening Now

first Play Together content.

No horizontal dashboard squeeze.

==================================================
97. EIGHTH ACCEPTANCE — DESKTOP
==================================================

Desktop feels like an interactive sports Home.

Not:

a grid of business cards.

No nested scrolling League module.

==================================================
98. NINTH ACCEPTANCE — PRIVACY
==================================================

Private Looking status:

cannot be retrieved by unauthorized player through API.

Blocked user cannot see/match/invite.

==================================================
99. TENTH ACCEPTANCE — COMMUNITY
==================================================

Community Pulse shows relevant recent activity.

View Feed opens:

Community → Feed.

No separate Feed Home needed.

==================================================
100. FINAL DESIGN RULE
==================================================

Every prominent Home element must answer one of:

CAN I PLAY THIS?

CAN I JOIN THIS?

WHO CAN I PLAY WITH?

WHAT IS HAPPENING?

WHAT SHOULD I DO NEXT?

If a permanent Home element does not answer one of those questions:

move it elsewhere.

==================================================
101. IMPLEMENTATION ORDER
==================================================

1. Audit current Play modules and routes
2. Remove Arrange Layout
3. Consolidate Start/Active Round into Play Now
4. Compact weather
5. Build Happening Now aggregation
6. Combine Friends/Open Rounds into Play Together
7. Complete Looking-to-Play queue
8. Integrate Open Rounds
9. Add Friends/Crew live awareness
10. Merge Leagues + Events into Today Near You
11. Remove nested Event/League scrolling
12. Add registered Event priority
13. Condense Arena
14. Condense Recent Play
15. Add Community Pulse
16. Add Explore DGD quick links
17. Remove Feed top-level duplication
18. Clean desktop navigation
19. Clean mobile navigation
20. Add responsive mobile Home
21. Add privacy/RLS protections
22. Add realtime refresh
23. Test empty/active/Event/social states
24. Fix regressions
25. production-ready verification.

==================================================
102. COMPLETION REPORT
==================================================

Return:

A. Play Now redesign
B. active Round consolidation
C. weather cleanup
D. Happening Now
E. Looking-to-Play queue
F. Open Rounds
G. Friends/Crew activity
H. Today's Events/Leagues
I. registered Event behavior
J. Course activity
K. Community Pulse
L. Arena condensation
M. Recent Play condensation
N. Explore DGD
O. desktop navigation
P. mobile navigation
Q. privacy/RLS
R. realtime behavior
S. desktop QA
T. mobile QA
U. remaining blockers.

Do not mark the phase complete merely because the components render.

Actually test the full interaction:

discover
→ invite/join
→ form Round
→ start Round
→ score
→ finish
→ share/community.