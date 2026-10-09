PHASE — DGD CLUBHOUSE 2.0
LIVE EVENT STAGING + COMMUNITY HANGOUT + MATCHMAKING LOBBY

Build the DGD Clubhouse into a first-class social/play experience.

The current Clubhouse prototype already contains:

- a shared lawn / staging area
- player avatars
- movement
- speech bubbles
- putting
- disc toss
- trivia
- Course lobby search

Continue this work, but connect it deeply to the actual DGD platform.

The Clubhouse should serve TWO related jobs:

1. EVENT CLUBHOUSE
   - players waiting for an Event
   - check-in awareness
   - Tournament Central
   - player meeting
   - card/pool/start information
   - social games
   - live interaction

2. COMMUNITY CLUBHOUSE
   - players looking to play
   - Course lobbies
   - open Rounds
   - matchmaking
   - friend/Crew interaction
   - casual games
   - social hangout

Do NOT create duplicate Player, Event, Round, Course or registration records.

The Clubhouse is an EXPERIENCE LAYER over canonical DGD data.

==================================================
1. FINAL PRODUCT CONCEPT
==================================================

The Clubhouse should feel like:

A DIGITAL TOURNAMENT CENTRAL

plus:

A DISC GOLF CLUBHOUSE / PRACTICE GREEN.

Players should be able to:

walk around

see who is present

see who is checked in

talk

wave / emote

challenge someone

practice putting

play mini-games

find players

join an open Round

form a card

wait for an Event

receive Event announcements

see their Event assignment

launch into scoring when play begins.

==================================================
2. CLUBHOUSE TYPES
==================================================

Support explicit room types:

EVENT_CLUBHOUSE

COURSE_CLUBHOUSE

COMMUNITY_LOBBY.

Do not build separate engines.

Use one Clubhouse engine with different context.

==================================================
3. EVENT CLUBHOUSE
==================================================

An Event Clubhouse belongs to:

canonical event_id

and where necessary:

event occurrence / Event day.

It should know:

Event
Course
Event schedule
registrations
check-ins
staff
division
pool
card
tee time
start Hole
announcements
live status.

==================================================
4. COMMUNITY LOBBY
==================================================

The Community Clubhouse connects to:

Play Home

Looking-to-Play

Open Rounds

Friends/Crew

Course lobbies.

It should help people convert:

"I want to play"

into:

"we have a card and a Course."

==================================================
5. COURSE CLUBHOUSE
==================================================

Every canonical Course may have a lightweight social lobby.

Example:

ROGERS LAKEWOOD CLUBHOUSE

4 here now

3 looking to play

2 open Rounds

1 Round underway.

[Enter Clubhouse]

[Join Round]

[I'm Looking to Play].

Do not create a separate Course identity.

==================================================
6. CLUBHOUSE ACCESS
==================================================

Community/Course lobby:

authenticated DGD users according to visibility policy.

Event Clubhouse:

access may include:

registered players

checked-in players

staff

volunteers

spectators

depending on Event configuration.

==================================================
7. CHECKED IN ≠ LIVE PRESENCE
==================================================

This is critical.

Maintain separately:

EVENT CHECK-IN

and:

CLUBHOUSE PRESENCE.

Example:

74 players checked in

18 currently in Clubhouse.

Do NOT remove checked-in players from Event roster merely because they close
the Clubhouse.

==================================================
8. ENTERING CLUBHOUSE DOES NOT AUTO-CHECK-IN
==================================================

Simply opening an Event Clubhouse must NOT automatically mark a player
checked in unless Event policy explicitly provides a secure self-check-in
workflow.

Check-in remains authoritative Event data.

Possible valid check-in methods:

Player QR
Event QR
Staff scan
Kiosk
authorized self-check-in.

Clubhouse entry alone is not proof of Event attendance.

==================================================
9. CHECKED-IN ROSTER
==================================================

Event Clubhouse should show:

CHECKED IN

62 / 72

with searchable roster.

Statuses:

Checked In

Not Checked In

Playing

At Clubhouse

Staff.

==================================================
10. LIVE OCCUPANTS
==================================================

Separate:

WHO'S HERE NOW

showing only actively connected Clubhouse users.

Example:

18 here now.

These users may appear as avatars in the scene.

==================================================
11. ROSTER VS AVATARS
==================================================

Do not attempt to place 150 inactive avatars on the lawn.

Visual scene:

active Clubhouse occupants.

Roster:

all appropriate Event players/check-ins.

==================================================
12. PLAYER AVATAR
==================================================

Use canonical DGD Player identity.

Avatar may show:

profile image

first name / display name

DGD Tier badge subtly

Play status

Event division

optional card/pool.

Do not show unnecessary personal information.

==================================================
13. TAP PLAYER
==================================================

Tap/click player avatar:

PLAYER CARD

Name

DGD Rating

Tier

Event division where relevant

Play status

mutual Crew/Friends

actions:

Message

Invite to Round

Challenge

View Profile

Add Friend

Wave.

Only show actions permitted by relationship/context.

==================================================
14. LOOKING TO PLAY
==================================================

Players with an active:

LOOKING_TO_PLAY

intent should visually stand out.

Example:

green ring

"Looking"

small icon.

Do not create Clubhouse-specific LFG status.

Use canonical Play Intent.

==================================================
15. QUICK LFG ACTION
==================================================

Inside Community Clubhouse:

[ I'M LOOKING TO PLAY ]

opens the same canonical Play Intent flow used by Play Home.

==================================================
16. MATCH PLAYERS
==================================================

When several compatible players are in the lobby:

suggest:

3 players here are looking to play.

[Form a Group]

Do not auto-enroll users.

==================================================
17. FORM A ROUND
==================================================

Select players.

Choose:

Course

time

format.

Create/reuse canonical:

planned/open Round.

Do NOT create:

Clubhouse Round

followed by a second scoring Round.

==================================================
18. START ROUND
==================================================

When the group is ready:

START ROUND

uses:

members
Course
format

already established.

Scorecard opens with cardmates already populated.

==================================================
19. COURSE LOBBY SEARCH
==================================================

Improve current:

Course Lobbies

search.

Search canonical Course Directory.

Results:

Rogers Lakewood
3 here · 2 looking

Countryside
5 here · 1 Round forming

[Enter].

==================================================
20. NEARBY CLUBHOUSES
==================================================

Play Home may show:

ACTIVE CLUBHOUSES

based on user-selected area / appropriate location context.

Do not expose exact live player coordinates.

==================================================
21. EVENT CLUBHOUSE ENTRY
==================================================

Event page:

CLUBHOUSE

becomes available according to Event schedule.

Example:

CLUBHOUSE OPEN

62 players checked in
18 hanging out

[ENTER].

==================================================
22. CLUBHOUSE OPEN TIME
==================================================

TD may configure:

Open 2 hours before Event

Open after Event

Close automatically

Always available for League Series

or Custom.

==================================================
23. EVENT DAY LIFECYCLE
==================================================

Example:

BEFORE CHECK-IN
Clubhouse preview / Event info

CHECK-IN OPEN
Clubhouse fully active

PLAYER MEETING
Announcement mode

ROUND START
Launch players to cards/scoring

BETWEEN ROUNDS
Clubhouse reopens prominently

EVENT COMPLETE
Celebration/results mode.

==================================================
24. BETWEEN-ROUND CLUBHOUSE
==================================================

Multi-round Event:

Clubhouse becomes useful during lunch/intermission.

Show:

Round 1 complete

Round 2 starts 1:30 PM

Next card:
Hole 7

[Hang Out]
[Practice Putting]
[View Results].

==================================================
25. PLAYER MEETING MODE
==================================================

TD can trigger:

PLAYER MEETING.

Scene displays:

announcement banner

countdown

Event info.

Players can still remain in Clubhouse.

==================================================
26. STAFF ANNOUNCEMENTS
==================================================

Authorized Event staff can broadcast:

Player meeting begins in 10 minutes

Round 1 cards are posted

Weather delay

Hole 7 update

etc.

These are Event announcements.

They should persist appropriately.

==================================================
27. CHAT TYPES
==================================================

Do not treat all communication the same.

Support:

EPHEMERAL SPEECH BUBBLES

ROOM CHAT

EVENT ANNOUNCEMENTS

DIRECT MESSAGES / DGIM.

==================================================
28. SPEECH BUBBLES
==================================================

Speech bubbles:

short

fun

fade after several seconds.

Examples:

Nice putt!

Anybody want Rogers?

Good luck!

These do not need permanent archival.

==================================================
29. ROOM CHAT
==================================================

Unlike temporary bubbles, consider a small recent Clubhouse chat history for
the active room/session.

Example:

recent 25–50 messages

or time-bounded session history.

Do not make users lose the entire conversation simply because they looked
away for ten seconds.

Retention policy should be explicit.

==================================================
30. DGIM
==================================================

Private conversation:

Message Player

opens DGIM.

Do not build separate private Clubhouse messages.

==================================================
31. QUICK CHAT
==================================================

Keep fun quick messages:

Wave

Cheer

Chain rattler

Nice throw

Let's tee off

Good luck

Need one more?

Anyone playing?

==================================================
32. EMOTES
==================================================

Add lightweight emotes:

Wave

Clap

Disc toss animation

Celebrate

Point

Ready

Ace celebration.

Keep animations short and non-disruptive.

==================================================
33. PLAYER MOVEMENT
==================================================

Desktop:

click/tap lawn to walk.

Mobile:

tap destination

or optional small virtual movement control.

Do not require precision movement to use any important feature.

==================================================
34. MOVEMENT IS COSMETIC
==================================================

Walking around the Clubhouse should be fun.

It must NOT be required to:

check in

register

join Round

read Event announcements

start scoring.

Accessibility/functionality always available through UI controls.

==================================================
35. REALTIME MOVEMENT
==================================================

Do NOT store every avatar position change in Postgres.

Do NOT use Realtime Presence for high-frequency walking coordinates.

Use low-latency ephemeral transport such as Broadcast for movement.

Presence is for slower-changing connected-user state.

==================================================
36. MOVEMENT RATE
==================================================

Throttle/network movement sensibly.

Send periodic target/position updates.

Other clients interpolate movement.

Do not broadcast every raw mouse/touch pixel.

==================================================
37. PRESENCE
==================================================

Realtime Presence should carry only small slow-changing state such as:

player_id

room_id

online/in_room

activity:

idle
chatting
putting
game

optional coarse scene state.

Do not put full Player profiles in Presence.

==================================================
38. DATABASE IS AUTHORITATIVE
==================================================

Persist:

Clubhouse room identity

Event relationship

room configuration

game results worth saving

moderation state

Event check-ins

Round invites

planned Rounds.

Do not rely on WebSocket state for durable product truth.

==================================================
39. PRIVATE REALTIME CHANNELS
==================================================

Use private scoped channels.

Conceptual:

clubhouse:event:<event_id>

clubhouse:course:<course_id>

clubhouse:community:<region_id>.

Enforce authorized channel access.

==================================================
40. REALTIME SECURITY
==================================================

Configure proper Realtime authorization.

Do not assume that knowing:

clubhouse:event:123

gives permission to join.

Access should be based on:

Event visibility

registration

staff role

room configuration

blocks/bans

as appropriate.

==================================================
41. BLOCKED PLAYERS
==================================================

If User A blocks User B:

B does not appear in A's social Clubhouse experience where policy requires.

Do not allow:

chat

challenge

invite

direct interaction.

Implement server-side protection.

==================================================
42. CLUBHOUSE MODERATION
==================================================

Support:

Mute

Block

Report

Hide Player

Leave Room.

Event staff may have:

Mute Room Participant

Remove from Clubhouse

Room slow mode

Announcements only.

Clubhouse moderation does NOT automatically modify Event registration unless
authorized separate action occurs.

==================================================
43. EVENT OWNER
==================================================

Only verified Event owner/authorized Event staff may configure the Event
Clubhouse.

Do not give Clubhouse admin rights to every checked-in player.

==================================================
44. CLUBHOUSE SETTINGS
==================================================

Event staff settings:

Clubhouse enabled

Open time

Close time

Games enabled

Room chat enabled

Spectators allowed

Player-only lobby

Announcements

Course lobby connection.

==================================================
45. MINI-GAME PRINCIPLE
==================================================

Clubhouse games are:

FUN

SOCIAL

LOW STAKES.

They do NOT affect:

DGD Rating

official Event score

Series standing

unless a future explicit official competition module intentionally says so.

==================================================
46. NO GAMBLING
==================================================

Do not create wagering/betting mechanics.

Games may award:

Clubhouse points

badges

Event fun prizes

bragging rights

when configured.

==================================================
47. PUTTING
==================================================

Enhance current putting game.

Modes:

Free Putt

Around the World

Horse-style challenge

Perfect 10

Pressure Putt

Distance Ladder.

==================================================
48. PUTTING INPUT
==================================================

Keep mechanics simple and mobile-friendly.

Potential model:

aim

power/timing

wind.

Do not turn this into a complicated simulation.

==================================================
49. PUTTING CHALLENGE
==================================================

Tap another player:

Challenge to Putting.

Opponent:

Accept / Decline.

Game panel opens.

Others may spectate where appropriate.

==================================================
50. DISC TOSS
==================================================

Disc Toss modes:

Distance

Accuracy

Closest to Pin

Target challenge.

Again:

fun only.

==================================================
51. TRIVIA
==================================================

Trivia categories:

Disc Golf Rules

History

Courses

Pros / Events

Disc knowledge

DGD.

Do not use private/sensitive user data.

==================================================
52. RULE TRIVIA
==================================================

Eventually source rule questions from:

effective DGD Rulebook

and clearly labeled PDGA knowledge where appropriate.

Never teach invented rules.

==================================================
53. MULTIPLAYER GAMES
==================================================

Support lightweight:

1v1

small group

room challenge.

Avoid building MMO-scale game infrastructure.

==================================================
54. GAME INVITE
==================================================

Player quick card:

Challenge

→ Putting

→ Disc Toss

→ Trivia.

Invitation appears:

Mike challenged you to Putting.

[Accept]
[Decline].

==================================================
55. GAME SESSION
==================================================

Use a canonical lightweight:

clubhouse_game_session

when persistent result is needed.

Fields conceptually:

room_id

game_type

players

state

started_at

completed_at

winner

result_summary.

==================================================
56. GAME STATE
==================================================

Live animations/input may use Realtime.

Important final result stored once on completion.

==================================================
57. LEADERBOARDS
==================================================

Optional Clubhouse leaderboards:

Today

This Event

Friends.

Examples:

Putting streak

Trivia wins

Longest toss.

Do not mix with DGD competitive Rating.

==================================================
58. EVENT FUN PRIZE
==================================================

TD may configure:

Clubhouse Putting Champion

Trivia Winner

etc.

If a real prize is attached:

use existing Event Prize system.

Do not create another prize database.

==================================================
59. EVENT CHECK-IN WALL
==================================================

Create:

PLAYER BOARD.

Example:

CHECKED IN
64 / 72

MA1
18 / 20

MA2
22 / 24

MPO
12 / 12.

Tap division for roster.

==================================================
60. CARD STATUS
==================================================

Once cards/tee times are ready:

player sees:

YOUR CARD

Hole 7

Mike
Brandon
Erik
Sarah

Starts:
10:00 AM.

[Meet Card]
[Open Caddy].

==================================================
61. MEET YOUR CARD
==================================================

Action:

MEET YOUR CARD

can visually group/identify cardmates in Clubhouse.

Optional:

teleport/focus camera to small gathering area.

Do not require actual avatar proximity.

==================================================
62. READY STATUS
==================================================

Player may set:

READY.

This is Clubhouse/social readiness.

Do not confuse with Event check-in.

Example:

Checked In ✓
Ready ✓.

==================================================
63. STAFF VIEW
==================================================

Authorized Event staff can see:

checked in

currently in Clubhouse

not checked in

cards ready

unresolved check-in issues.

Normal players do not need staff operational controls.

==================================================
64. COUNTDOWN
==================================================

Clubhouse header can show:

PLAYER MEETING
12:00

or:

ROUND STARTS IN
18:42.

This creates real staging value.

==================================================
65. START ROUND TRANSITION
==================================================

When scoring opens:

large:

YOUR ROUND IS READY

Hole 7

[OPEN SCORECARD]

[EVENT CADDY].

Do not force user to navigate back through Events.

==================================================
66. EVENT DELAY
==================================================

If Event delayed:

Clubhouse can become the primary waiting area.

Show:

WEATHER DELAY

Next update:
11:30 AM

games/chat remain available.

==================================================
67. RESULTS MODE
==================================================

After Round:

Clubhouse can show:

Round Results

leaderboard preview

hot rounds

ace notifications

next Round timing.

Keep competitive data sourced from canonical results.

==================================================
68. CELEBRATION MODE
==================================================

After Event completion:

podium / awards

fun confetti/celebration

Clubhouse game winners

community photos.

Do not rewrite official result presentation.

==================================================
69. COURSE LOBBY TO PLAY HOME
==================================================

Play Home:

Course activity card

Rogers Lakewood
5 in Clubhouse
3 looking to play

[Enter].

==================================================
70. PLAY HOME "HAPPENING NOW"
==================================================

Clubhouse activity can contribute:

5 players hanging out at Rogers

3 players forming a card

Valpo Champs Clubhouse open.

Only show useful activity.

==================================================
71. EVENTS INTEGRATION
==================================================

Player Event page:

Clubhouse

is a participant feature.

Event Manager configures it.

Maintain discovery/management separation.

==================================================
72. COMMUNITY INTEGRATION
==================================================

Community can show:

Clubhouses your friends are in

where privacy allows.

Do not turn Community Feed into a stream of every room entry.

==================================================
73. FRIEND STATUS
==================================================

Example:

Brandon

In Rogers Clubhouse

Looking to Play

[Join Clubhouse].

Respect visibility settings.

==================================================
74. STATUS RESOLUTION
==================================================

Clubhouse presence does not create another Play Status.

Use existing central status resolver.

Example:

LOOKING TO PLAY

while:

room presence = Rogers Clubhouse.

==================================================
75. "WHO'S HERE" PANEL
==================================================

Improve current panel.

Tabs:

Here Now

Looking

Friends

Checked In

for Event rooms.

Only show relevant tabs.

==================================================
76. SEARCH PEOPLE
==================================================

Allow:

Find player in room.

Useful for large Events.

==================================================
77. DO NOT EXPOSE EXACT POSITION AS LOCATION DATA
==================================================

Avatar position is fictional Clubhouse scene position.

Do not imply it corresponds to real-world GPS.

==================================================
78. AVATAR COLLISION
==================================================

Do not spend excessive effort on physics.

Simple movement, overlap avoidance, and social interaction are enough.

==================================================
79. SCENE AREAS
==================================================

Create recognizable interactive areas:

Putting Green

Disc Toss Range

Trivia Table

Tournament Central

Looking-to-Play board

Event Board

Course Lobby portal.

These should be obvious visually.

==================================================
80. TOURNAMENT CENTRAL OBJECT
==================================================

Click Tournament Central:

Event schedule

check-in status

player meeting

Course info

cards/pools

announcements.

This makes the world functional instead of decorative.

==================================================
81. LFG BOARD
==================================================

Community Clubhouse object:

LOOKING TO PLAY BOARD.

Shows current canonical LFG queue.

[Post Looking]
[Join Group].

==================================================
82. COURSE BOARD
==================================================

Shows nearby/selected Course lobbies:

Rogers
5 active

Countryside
3 active

Riverside
2 active.

==================================================
83. 2D FIRST
==================================================

The current 2D/isometric prototype is appropriate.

Finish:

functionality

Realtime

mobile

Event integration

before making 3D a blocker.

==================================================
84. 3D FUTURE
==================================================

Architecture may support a future:

3D Clubhouse

but canonical room/game/social data must remain independent of renderer.

Do not store core behavior inside a Three.js-only component.

==================================================
85. RENDERER ABSTRACTION
==================================================

Conceptually:

ClubhouseScene

may later have:

2D renderer

3D renderer.

Same:

room

players

games

chat

Event state.

==================================================
86. MOBILE CLUBHOUSE
==================================================

Mobile will be extremely important.

Use full-screen Clubhouse scene.

Bottom sheet for:

People

Games

Event

Chat.

Do not squeeze desktop right rail beside the field.

==================================================
87. MOBILE CONTROLS
==================================================

Bottom action bar:

Chat

People

Games

Event / Play.

Movement remains tap-to-move.

==================================================
88. MOBILE GAME
==================================================

When playing mini-game:

game expands to focus mode.

Do not leave tiny putting controls beside scene.

==================================================
89. DESKTOP
==================================================

Desktop structure:

MAIN:
Clubhouse scene

RIGHT:
context/activity panel.

Bottom/under scene:
chat.

Avoid enormous empty lower area like current screenshot.

==================================================
90. RESPONSIVE HEIGHT
==================================================

Scene should intelligently fill available viewport.

Do not leave large unused green/blank page regions.

==================================================
91. CLUBHOUSE NAVIGATION
==================================================

Do not add Clubhouse as another giant top-level global navigation item.

Primary access should come contextually from:

Play

Event

Course

Community.

Potential global shortcut may live under Play.

==================================================
92. CLUBHOUSE DIRECTORY
==================================================

Play:

Clubhouses

could list:

My Event

Nearby Courses

Friends' rooms.

Keep this secondary to normal Play Home.

==================================================
93. ROOM DEEP LINKS
==================================================

Support links:

Join Event Clubhouse

Join Course Clubhouse.

Authorization still verified server-side.

Knowing URL does not grant access.

==================================================
94. ROOM MEMBERSHIP
==================================================

If persistent room membership records are needed, distinguish them from
Realtime Presence.

Presence:
connected right now.

Membership/access:
allowed to enter.

==================================================
95. RLS
==================================================

Protect room configuration, Event relationships, game sessions, moderation,
and any persisted chat using appropriate RLS.

`TO authenticated` alone is not authorization.

==================================================
96. EVENT ROOM AUTHORIZATION
==================================================

Example:

private player Event Clubhouse

access requires:

registered Event participant

OR authorized Event staff

OR configured spectator status.

Enforce server-side.

==================================================
97. COURSE ROOM AUTHORIZATION
==================================================

Public Course lobby may be available to authenticated players.

Private/Club Course lobby can have tighter rules.

==================================================
98. MODERATOR CAPABILITIES
==================================================

Use existing capability architecture.

Possible capability:

CLUBHOUSE_MODERATE

CLUBHOUSE_ANNOUNCE

CLUBHOUSE_CONFIGURE.

Event role grants these explicitly.

==================================================
99. CHAT SECURITY
==================================================

Blocked/muted users must be enforced at message delivery/storage authorization,
not merely hidden after fetch.

==================================================
100. SPAM CONTROL
==================================================

Add sensible:

rate limits

message length limits

game-invite throttling

reporting.

Do not let Clubhouse become harassment/spam surface.

==================================================
101. PLAYER SAFETY
==================================================

Do not reveal:

exact home/current GPS

email

phone

private Event fields

through Clubhouse.

==================================================
102. EVENT STAFF PRIVACY
==================================================

Staff-only operational issues stay in Event Manager.

Clubhouse only displays player-appropriate Event information.

==================================================
103. CLUBHOUSE NOTIFICATIONS
==================================================

Useful:

Game challenge

Round invite

Card posted

Player meeting soon

Round ready

Event announcement.

Avoid:

"someone walked left"

notifications.

==================================================
104. ROOM CHAT NOTIFICATION
==================================================

Do not generate global notification for every Clubhouse chat message.

Mentions/DMs may notify appropriately.

==================================================
105. PERSISTENCE PRINCIPLE
==================================================

Persist meaningful state.

Examples:

Event check-in
Round formation
game result
announcement
moderation.

Do NOT persist unnecessary:

walking coordinates

every emote

temporary bubbles.

==================================================
106. CURRENT SUPABASE REALTIME ARCHITECTURE
==================================================

Use current Supabase behavior correctly:

Presence:
slow-changing connected-user state.

Broadcast:
low-latency transient events such as movement, emotes and game actions.

Database:
durable canonical state.

Do not call Presence.track() for every avatar movement.

==================================================
107. REALTIME AUTHORIZATION
==================================================

Use private Realtime topics with authorization policies based on room access.

Do not modify/create arbitrary application objects inside the platform-managed
Realtime schema.

==================================================
108. RECONNECT
==================================================

When connection drops:

show reconnect state.

Do not:

remove Event check-in

cancel planned Round

lose game result already committed.

Avatar may respawn when connection returns.

==================================================
109. MULTIPLE TABS
==================================================

Handle same user opening Clubhouse on multiple devices/tabs gracefully.

Do not count them as three different players in:

"18 here."

Deduplicate visible player count by canonical user/player where appropriate.

==================================================
110. AWAY STATE
==================================================

After inactivity:

mark avatar:

Away

or visually dim.

Do not immediately remove them unless connection ends/timeout policy applies.

==================================================
111. LARGE EVENT SCALE
==================================================

Test:

10

25

50

100+

checked-in players.

Do not render all 100 as active animated avatars unless actually connected.

Scene performance should depend mostly on current live occupants.

==================================================
112. AVATAR DENSITY
==================================================

If live room becomes crowded:

use:

multiple zones

avatar clustering

or expanded scene.

Do not make names unreadable.

==================================================
113. EVENT ROOM ZONES
==================================================

Potential areas:

Main Lawn

Putting Green

Game Room

Tournament Central.

This can spread large crowds without separate unrelated rooms.

==================================================
114. PRESENCE COUNTS
==================================================

Header example:

64 CHECKED IN · 18 HERE NOW

This is much more valuable than simply:

1 here.

==================================================
115. CARDMATE HIGHLIGHT
==================================================

When card assignments exist:

highlight user's cardmates.

Example:

YOUR CARD

Brandon
Erik
Sarah

all currently in Clubhouse.

==================================================
116. FIND CARDMATES
==================================================

Action:

Find Cardmates.

Scene highlights them.

If not present:

show roster/status.

==================================================
117. STAFF AVATAR
==================================================

Staff may have subtle:

TD

STAFF

badge.

Do not over-clutter avatar labels.

==================================================
118. CLUBHOUSE THEMES
==================================================

Optional future:

Event branding

Course imagery/colors

seasonal theme

glow mode.

Do not let themes interfere with readability.

==================================================
119. EVENT SPONSORS
==================================================

Optional tasteful Tournament Central sponsor signage.

Do not overload lobby with advertisements.

==================================================
120. ACCESSIBILITY
==================================================

Every avatar interaction must also be available through:

People list.

Every game through:

Games menu.

Every announcement through:

Event panel.

The spatial scene is enhancement, not the only interface.

==================================================
121. KEYBOARD
==================================================

Desktop:

keyboard navigation for panels/buttons.

Optional arrow/WASD movement may exist.

Do not require it.

==================================================
122. REDUCED MOTION
==================================================

Respect reduced-motion preferences.

Disable/minimize:

walking animation

confetti

large emotes

if requested.

==================================================
123. EVENT ACCEPTANCE TEST
==================================================

Create Event with:

72 registrations.

Check in 60.

Expected:

Clubhouse shows:

60 checked in.

5 players actually open Clubhouse:

5 avatars

"5 here now."

Closing one:

59? NO.

Checked-in remains 60.

Here now becomes 4.

==================================================
124. CHECK-IN SECURITY TEST
==================================================

Unregistered user opens public Event Clubhouse.

Expected according to Event settings:

may spectate

but is NOT marked checked in.

==================================================
125. MATCHMAKING TEST
==================================================

Three users set:

Looking to Play.

Enter same Course Clubhouse.

Expected:

LFG Board shows all compatible users.

Create group.

Canonical planned Round created.

==================================================
126. ROUND TEST
==================================================

Group accepts.

Start Round.

Expected:

same canonical Round members populate scorecard.

No second Clubhouse-only Round.

==================================================
127. EVENT ROUND TEST
==================================================

Card is posted.

Player in Clubhouse sees:

YOUR CARD
Hole 7.

Scoring opens.

Tap:

Start Round / Scorecard.

Correct Event Round/Layout opens.

==================================================
128. MOVEMENT TEST
==================================================

Two users connected.

User A walks.

User B sees smooth movement.

No database row is written for each movement frame.

==================================================
129. PRESENCE TEST
==================================================

User disconnects.

Avatar leaves.

Event check-in remains.

==================================================
130. CHAT TEST
==================================================

Blocked player cannot send/receive protected interaction.

Room chat respects authorization.

==================================================
131. GAME TEST
==================================================

A challenges B to Putting.

B accepts.

Game completes.

One final result recorded.

No DGD Rating change.

==================================================
132. MOBILE TEST
==================================================

390px portrait.

User can:

enter Clubhouse

see scene

open People

chat

play putting

view Event info

launch scorecard.

No horizontal desktop compression.

==================================================
133. DESKTOP TEST
==================================================

Scene uses available viewport.

No large unused empty page.

Right panel adapts to context.

==================================================
134. EVENT MANAGER TEST
==================================================

Authorized TD configures Clubhouse.

Normal player cannot access Clubhouse configuration through direct API.

==================================================
135. PRIVACY TEST
==================================================

User hides status / blocks another user.

Verify API/Realtime authorization respects it.

==================================================
136. PLAY HOME TEST
==================================================

Course lobby has activity.

Play Home appropriately surfaces:

Rogers Clubhouse
5 here · 3 looking.

Click opens correct room.

==================================================
137. FINAL PRODUCT RULE
==================================================

THE CLUBHOUSE SHOULD CONNECT PEOPLE TO REAL DISC GOLF.

It is not just:

a visual chatroom

or:

a collection of mini-games.

Its most important conversions are:

WAITING → CONNECTING

LOOKING → GROUP FORMED

GROUP FORMED → ROUND STARTED

CHECKED IN → CARD READY

EVENT WAITING → SCORECARD / CADDY

while making the downtime fun.

==================================================
138. IMPLEMENTATION ORDER
==================================================

1. Audit current Clubhouse prototype
2. Separate checked-in roster from live Presence
3. Define Clubhouse room types
4. Connect canonical Event rooms
5. Connect Course lobbies
6. Connect Looking-to-Play
7. Connect Open/Planned Rounds
8. Build Player quick cards
9. Build Who's Here / Checked In panels
10. Implement private Realtime authorization
11. Move avatar movement to Broadcast
12. Keep Presence minimal
13. Improve room chat
14. Integrate DGIM
15. Add moderation/blocking
16. Improve Putting
17. Improve Disc Toss
18. Improve Trivia
19. Build game challenge/session flow
20. Build Tournament Central
21. Add Event announcements/countdown
22. Add card/pool/start information
23. Add launch-to-scorecard
24. Add between-round/result modes
25. Redesign desktop layout
26. Build mobile Clubhouse
27. Add accessibility/reduced motion
28. Test concurrency/reconnect
29. Run RLS/Realtime security tests
30. Run Supabase/database advisors
31. Fix regressions
32. production-ready verification.

==================================================
139. COMPLETION REPORT
==================================================

Return:

A. Clubhouse room model
B. Event Clubhouse
C. Course Clubhouse
D. Community lobby
E. checked-in roster
F. live Presence
G. LFG integration
H. planned/Open Round integration
I. Player cards
J. chat/DGIM
K. moderation
L. movement architecture
M. Putting
N. Disc Toss
O. Trivia
P. multiplayer challenges
Q. Tournament Central
R. announcements
S. card/tee-time integration
T. scoring launch
U. Play Home integration
V. mobile
W. desktop
X. Realtime authorization
Y. RLS/security
Z. concurrency/reconnect tests
AA. remaining blockers.