PHASE — COMMUNITY HUB 2.0
MERGE SOCIAL FEED + COMMUNITY INTO ONE SOCIAL HOME

DG Dashboard currently has two overlapping social destinations:

1. SOCIAL FEED
2. COMMUNITY

They contain many of the same concepts and create unnecessary navigation.

The Social Feed already has:

Feed
People
Clubs
Marketplace
Lost & Found
Quick Actions
post creation
social activity
local/community content.

The Community Overview currently has:

Feed
People
Clubs
Marketplace
Lost & Found
DGIM
Friends
Unread messages
Community Outreach
People suggestions.

These should NOT remain two different primary products.

COMBINE THEM.

The final model:

COMMUNITY

is the single social destination.

The default Community screen IS THE SOCIAL FEED.

Community Overview information and quick links are integrated around the Feed.

Remove the separate top-level Feed destination.

==================================================
1. FINAL PRODUCT MODEL
==================================================

COMMUNITY

becomes the social center of DGD.

It should answer:

WHAT ARE MY FRIENDS DOING?

WHAT IS HAPPENING LOCALLY?

WHO SHOULD I CONNECT WITH?

WHAT CLUBS ARE ACTIVE?

WHAT EVENTS ARE HAPPENING?

WHAT IS BEING SHARED?

DO I HAVE MESSAGES?

WHAT CAN I PARTICIPATE IN?

The Feed is the primary content surface.

==================================================
2. GLOBAL NAVIGATION
==================================================

Remove:

Feed

as a separate top-level navigation destination.

Desktop primary navigation becomes approximately:

Play
Events
Courses
Community
Trackers
Statboard
Manage

according to role.

COMMUNITY should open directly to the Feed-centered Community Home.

==================================================
3. LEGACY FEED ROUTE
==================================================

If an old:

/feed

route exists:

redirect it to:

/community

while preserving useful filters/query parameters where practical.

Do not keep two competing Feed pages.

==================================================
4. REMOVE SEPARATE COMMUNITY OVERVIEW PAGE
==================================================

Do not require:

Community
→ Overview
→ Feed

to reach social content.

Community itself should be the Feed.

Overview functionality becomes contextual information surrounding the Feed.

==================================================
5. COMMUNITY HEADER
==================================================

Simplify the header.

Recommended:

COMMUNITY

Your disc golf network, clubs and conversations.

Primary contextual actions:

Find Players

Messages

Optional:
Share / Create Post

Do NOT include:

Create Community Event.

Event creation belongs in Event Manager.

==================================================
6. REMOVE "CREATE COMMUNITY EVENT"
==================================================

The current Community page includes:

+ Create community event.

Remove it.

Community Events are discovered through:

Events → Community.

Creation:

Event Manager
→ Create Event
→ Community.

Community may LINK to nearby Community Events.

It does not create them.

==================================================
7. MAIN COMMUNITY STRUCTURE
==================================================

Desktop:

┌──────────────────────────────────────────────────────────┐
│ COMMUNITY                                                │
│ quick links / social status                              │
├─────────────┬───────────────────────────────┬────────────┤
│ QUICK LINKS │           FEED                │ COMMUNITY  │
│ / NETWORK   │                               │ RIGHT RAIL │
│             │ Composer                      │            │
│             │ Feed filters                  │ Messages   │
│             │ Posts                         │ People     │
│             │                               │ Clubs      │
│             │                               │ Events     │
└─────────────┴───────────────────────────────┴────────────┘

Feed is always the primary column.

Do not create a dashboard above it.

==================================================
8. MOBILE STRUCTURE
==================================================

Mobile:

COMMUNITY

Quick social actions

Post composer

Feed filter

Feed posts

then contextual recommendations.

No multi-column dashboard.

No six giant navigation cards consuming the first screen.

==================================================
9. COMMUNITY NAVIGATION
==================================================

Use one compact secondary navigation system.

Recommended:

Feed
People
Clubs
Marketplace
Lost & Found.

Messages may be a persistent icon/action rather than a page tab if DGIM
already owns messaging.

Do not repeat the same destinations as giant cards AND tabs.

==================================================
10. FEED IS DEFAULT
==================================================

When user selects:

Community

default destination:

FEED.

No additional click required.

==================================================
11. REMOVE LARGE NAV CARDS
==================================================

Current UI contains large blocks:

Overview
Feed
People
Clubs
Marketplace
Lost & Found.

Replace with compact:

tabs

icons

or quick links.

These are navigation, not page content.

==================================================
12. COMMUNITY SNAPSHOT
==================================================

Preserve useful Overview information in a compact:

YOUR COMMUNITY

surface.

Potential items:

Friends

Unread messages

Clubs

Requests.

Example:

12 Friends
3 Messages
2 Clubs
1 Request

Each is clickable.

Do NOT use giant KPI-style cards.

==================================================
13. REMOVE TOURNAMENT TRACKER FROM COMMUNITY SNAPSHOT
==================================================

Current Community Overview contains:

Tournament Tracker.

This belongs under:

Trackers

or Event activity.

Remove it from the Community Overview metrics.

Community should not duplicate Trackers.

==================================================
14. DGIM
==================================================

Integrate DGIM prominently but compactly.

Example:

MESSAGES

3 unread

Brandon
"Want to play Rogers at 4?"

Sarah
"League starts at 6."

[Open DGIM]

Do not create a giant DGIM card when there are no messages.

==================================================
15. ZERO MESSAGE STATE
==================================================

Instead of:

You're all caught up...

inside a large empty container:

Messages
No unread messages

[Open DGIM]

compact.

==================================================
16. QUICK ACTIONS
==================================================

The old Feed contains a very large Quick Actions sidebar.

Condense it.

Recommended important Community actions:

Find Players

Messages

Find Clubs

Community Events

Marketplace

Lost & Found.

Do NOT put:

Start Round
Practice
Statboard
Course Builder
My Events

inside Community Quick Actions.

Those belong to their own main product areas.

==================================================
17. COURSE BUILDER LINK
==================================================

Remove Course Builder from Community Quick Actions.

Courses already owns:

Course Directory
Add Course
Course Studio.

No duplicate route.

==================================================
18. START ROUND LINK
==================================================

Remove Start Round from Community quick actions.

Play already owns this.

==================================================
19. MY EVENTS LINK
==================================================

Remove My Events & Calendar from Community quick actions.

Events owns this.

==================================================
20. PRACTICE LINK
==================================================

Remove Practice.

Play owns it.

==================================================
21. STATBOARD LINK
==================================================

Remove Statboard from Community Quick Actions.

Global navigation already exposes Statboard.

==================================================
22. CREATOR STUDIO
==================================================

If Creator Studio exists:

place it under:

Me
Manage
or appropriate creator tools.

Do not make it a core Community quick action for all users.

==================================================
23. COMMUNITY-SPECIFIC QUICK LINKS ONLY
==================================================

Community quick links should only represent social/community actions:

Find Players

Messages

Friends & Crew

Clubs

Marketplace

Lost & Found

Community Events.

Keep scope clean.

==================================================
24. POST COMPOSER
==================================================

Keep the composer at the top of the Feed.

Example:

What's happening, Mike?

Post types:

Photo / Video

Round

Course

Event

Ace

Location

General post.

Do not overwhelm with options.

==================================================
25. POST ROUND
==================================================

Completed Round can be shared from:

Play / Round Review

into Community Feed.

Feed composer should not create a second Round record.

It references the canonical Round.

==================================================
26. POST EVENT
==================================================

A user may share:

Event

to Feed.

Post references canonical:

event_id.

No copied Event information.

==================================================
27. POST COURSE
==================================================

Likewise:

Course post

references canonical:

course_id.

==================================================
28. ACE POST
==================================================

Ace posts may optionally link:

Round

Course

Hole

Disc

where known.

Do not duplicate scoring records.

==================================================
29. FEED FILTERS
==================================================

Simplify current Feed filtering.

Recommended primary filters:

FOR YOU

FOLLOWING

LOCAL.

Secondary:

Clubs

Events

Saved.

Do not expose multiple stacked filter bars unnecessarily.

==================================================
30. FOR YOU
==================================================

For You may combine:

Friends/Crew

local relevant posts

followed Clubs

followed Events

Courses

community content.

Keep explainable and relevant.

==================================================
31. FOLLOWING
==================================================

Only content from:

players

Clubs

Events

Series

Organizations

the user explicitly follows.

==================================================
32. LOCAL
==================================================

Local may include:

local players

Courses

Clubs

Events

Course conditions

community activity

according to visibility.

Do not require precise live GPS.

Use user-selected/local area where possible.

==================================================
33. CLUBS FILTER
==================================================

Shows:

Club posts

League announcements

local club activity

where appropriate.

==================================================
34. EVENTS FILTER
==================================================

Shows social posts/activity related to:

Events

Leagues

Series

Community Events.

Event discovery itself remains under Events.

==================================================
35. SAVED
==================================================

Saved posts/content.

Do not mix saved Courses/Events into the same feature unless product model
intentionally supports it.

==================================================
36. REDUCE AUTOMATED BADGE SPAM
==================================================

The screenshot shows several consecutive automated:

Unlocked a new badge

posts from the same player.

Do not let automated achievement activity overwhelm the Feed.

Group or rate-limit similar system posts.

Example:

Mike earned 3 new achievements

[View achievements]

instead of three nearly identical Feed cards.

==================================================
37. ACTIVITY GROUPING
==================================================

Group repetitive automated events:

badges

milestones

round imports

Event registrations

Course contributions.

Human-created posts should remain individual.

==================================================
38. FEED CONTENT PRIORITY
==================================================

Prioritize:

friend posts

Rounds

aces

local Event activity

Club announcements

Course news

community activity

over low-value automated platform notifications.

==================================================
39. COMMUNITY EVENTS
==================================================

Replace current:

Community Outreach

with:

COMMUNITY EVENTS NEAR YOU.

Example:

Riverside Course Cleanup
Saturday · 9 AM

12 attending

[View]

[See All].

No:

Create One

button.

==================================================
40. SEE ALL COMMUNITY EVENTS
==================================================

Routes to:

Events
→ Community.

Community page does not maintain a separate Event directory.

==================================================
41. PEOPLE YOU MAY KNOW
==================================================

Keep:

Requests & players you may know.

But do not make a huge empty panel.

If results exist:

show 3–5.

Example:

Brandon Torres
3 mutual players
Played 2 Events with you

[Add Friend].

Then:

See All.

==================================================
42. EMPTY PEOPLE SUGGESTIONS
==================================================

If none:

Find Players

as small action.

Do not reserve large empty space.

==================================================
43. PLAYER DISCOVERY
==================================================

People page supports:

Search name

DGD profile

PDGA number

location/region where appropriate

mutual friends

shared Clubs

shared Events.

Respect privacy.

==================================================
44. FRIEND REQUESTS
==================================================

Pending incoming requests should appear near the top of Community.

Example:

2 FRIEND REQUESTS

[Review].

Do not make user search People page to discover them.

==================================================
45. CLUBS
==================================================

Community → Clubs

should support:

My Clubs

Nearby

Discover

follow/join

Club Feed.

==================================================
46. CLUB PREVIEW ON COMMUNITY HOME
==================================================

If useful:

FROM YOUR CLUBS

NWI High Flyers
Glow league tonight

[View].

Limit to useful items.

Feed can already surface Club posts.

Do not duplicate entire Club page.

==================================================
47. MARKETPLACE
==================================================

Marketplace remains under Community.

Do not put marketplace listings directly into the main Feed by default unless
explicitly designed/promoted.

Provide compact:

Marketplace

Browse local listings

[Open].

==================================================
48. MARKETPLACE FILTER
==================================================

If Feed has Marketplace content option:

it should be explicit.

Do not flood social Feed with commerce.

==================================================
49. LOST & FOUND
==================================================

Keep Lost & Found under Community.

Course-based lost disc posts can optionally appear in:

Local

when relevant.

==================================================
50. LOST DISC POST
==================================================

Example:

LOST DISC

Rogers Lakewood · Hole 7

Pink Zone

[View Details].

Respect contact/privacy settings.

==================================================
51. "AROUND THE SPORT"
==================================================

The Feed screenshot includes:

Around the sport

external/current disc golf content.

Keep it if useful, but lower priority.

Rename perhaps:

AROUND DISC GOLF.

Show a small selection.

Do not let external media compete with Friends/Local activity.

==================================================
52. EXTERNAL CONTENT
==================================================

External news/video recommendations should:

open source content

retain provenance

not masquerade as DGD user posts.

==================================================
53. COMMUNITY HOME DESKTOP
==================================================

Recommended layout:

LEFT RAIL
compact Community navigation
Community snapshot
Messages shortcut

CENTER
composer
Feed filters
Feed

RIGHT RAIL
friend requests
People you may know
Community events
Club activity
Around Disc Golf.

==================================================
54. DO NOT MAKE RAILS PERMANENTLY HUGE
==================================================

Desktop sidebars should be relatively narrow.

Feed should remain visually dominant.

Target approximate:

20% / 55–60% / 20–25%

depending on viewport.

==================================================
55. RESPONSIVE DESKTOP
==================================================

At narrower desktop/tablet widths:

right rail collapses below Feed.

Left Community navigation may become horizontal tabs.

==================================================
56. MOBILE
==================================================

Mobile Community:

Header

compact quick action row

Composer

Feed filters

Feed

contextual recommendations inserted occasionally.

Tabs:

Feed
People
Clubs
Marketplace
More.

Lost & Found can live under More if necessary.

==================================================
57. MOBILE QUICK ACTIONS
==================================================

Example:

[Find Players]
[Messages]
[Clubs]
[Events]

horizontal scroll if needed.

Do not show 12 actions.

==================================================
58. NO "ARRANGE"
==================================================

Remove:

Arrange

Arrange Layout

from Community and Feed.

Do not ask users to construct a dashboard.

==================================================
59. COMMUNITY HOME IS PERSONALIZED BY CONTENT, NOT LAYOUT
==================================================

Ranking can adapt.

Layout should remain predictable.

==================================================
60. PLAY STATUS IN COMMUNITY
==================================================

Global Play Status remains visible in header.

Community can display friends' permitted statuses:

Looking

Playing

At Event

Available.

Do not create another Community-specific status system.

==================================================
61. LOOKING TO PLAY IN FEED
==================================================

Do not post every Looking-to-Play status as a Feed post.

Use Play Together / Play Home for real-time matching.

Community may surface socially meaningful:

Brandon is looking to play nearby

only when relevant and permission allows.

==================================================
62. FRIEND ROUND ACTIVITY
==================================================

Feed may show:

Brandon finished Rogers Lakewood
-5 · DGD Round Rating 948

[View Round].

Use canonical Round.

==================================================
63. LIVE ROUND
==================================================

If friend has shareable active Round:

feed/activity may offer:

FOLLOW LIVE.

Routes to Tracker.

==================================================
64. EVENT ACTIVITY
==================================================

Feed can surface:

Friend registered for Valpo Champs

Club announced Event

Results posted

Series standings changed

when relevant.

Do not replace Events discovery.

==================================================
65. COURSE ACTIVITY
==================================================

Feed may surface:

new Course map published

important Course condition

Course reopened

new Layout

Course cleanup.

Avoid minor administrative edit spam.

==================================================
66. POST VISIBILITY
==================================================

Support appropriate visibility:

Public

Friends

Crew

Club

Event

Private/draft where relevant.

RLS must enforce this.

==================================================
67. BLOCKING
==================================================

Blocked users must not:

see protected posts

appear in People suggestions

message

friend-request

surface through social recommendations

where policy requires.

Enforce server-side.

==================================================
68. FEED RLS
==================================================

Do not fetch private posts and hide them in frontend.

Queries/views/functions must enforce:

post visibility

friend relationships

Club membership

Event membership

block relationships.

==================================================
69. COMMENTS
==================================================

Preserve existing Feed comments/reactions.

Ensure comment RLS correctly respects visibility of parent post.

Do not allow access to a private post through its comment endpoint.

==================================================
70. REACTIONS
==================================================

Keep reactions lightweight.

Avoid excessive reaction variants unless already supported.

==================================================
71. SHARING
==================================================

Post share:

copy link

native share

send in DGIM.

Do not create duplicate posts unless user explicitly chooses Repost.

==================================================
72. DGIM CONNECTION
==================================================

User can send Feed post to friend/group.

Use canonical post reference.

==================================================
73. NOTIFICATIONS
==================================================

Community-relevant notifications:

Friend request

Comment

Mention

Message

Club invite

Event invite.

Do not rely exclusively on Feed visibility.

==================================================
74. UNREAD COUNT
==================================================

Community snapshot/header may display:

messages

requests

notifications

in compact badges.

==================================================
75. COMMUNITY SEARCH
==================================================

Global search already exists.

Within Community optional search should focus:

People

Clubs

Posts

Marketplace

Lost & Found.

Do not duplicate global Course/Event search unnecessarily.

==================================================
76. TOP-LEVEL SHARE
==================================================

Remove generic page-level:

Share

from Community header unless it has a clear purpose.

Users share:

posts

profiles

Clubs

specific resources.

==================================================
77. FEED COMPOSER IS THE CREATE ACTION
==================================================

Instead of generic Share:

composer provides:

Create Post.

Clear and contextual.

==================================================
78. COMMUNITY OVERVIEW METRICS
==================================================

Current:

Friends 0
Unread 0
Tournament Tracker 3
Clubs 1.

Change to relevant social snapshot:

Friends

Messages

Requests

Clubs.

No Tournament Tracker.

==================================================
79. HIDE ZERO METRICS WHERE POSSIBLE
==================================================

If:

Requests 0

do not necessarily show a large zero card.

Compact status can remain, but zero states should not dominate.

==================================================
80. FIRST-TIME USER
==================================================

New user with no Friends/Clubs should still see useful Community:

local posts

local Clubs

players nearby/region

community Events

Around Disc Golf.

Actions:

Find Players

Find Clubs.

Do not show mostly empty boxes.

==================================================
81. ESTABLISHED USER
==================================================

Active user sees:

friend posts

Crew activity

Club announcements

Round results

Event posts

local Course updates.

==================================================
82. CLUB ADMIN
==================================================

Club management belongs inside:

Club workspace

or Manage.

Do not turn Community Feed into Club admin.

==================================================
83. EVENT ORGANIZER
==================================================

Event creation/management belongs inside:

Event Manager.

Community only displays published social/event content.

==================================================
84. COURSE MANAGER
==================================================

Course editing belongs inside:

Courses / Course Studio.

Community may show published Course updates.

==================================================
85. CREATION OWNERSHIP
==================================================

Community creates:

posts

friend relationships

messages

Club interactions

marketplace/lost-found content where appropriate.

It does NOT create:

Courses

competitive Events

community Events

Layouts

Rounds.

Those remain with their canonical product areas.

==================================================
86. ROUTE MODEL
==================================================

Conceptually:

/community
    Feed Home

/community/people

/community/clubs

/community/marketplace

/community/lost-found.

Legacy:

/feed

redirects:

/community.

No separate:

/community/overview

required for normal navigation.

==================================================
87. DEEP LINKS
==================================================

Existing Feed post links must continue working.

Do not break shared post URLs.

==================================================
88. FEED DATA MIGRATION
==================================================

Do NOT duplicate/move existing posts unnecessarily.

Reuse canonical Feed tables/data.

This is primarily navigation/UI consolidation.

==================================================
89. COMMUNITY OVERVIEW MIGRATION
==================================================

Reuse valid:

friend data

Club data

DGIM data

suggestions

Community Event relationships.

Move their UI into contextual Community Home surfaces.

==================================================
90. REMOVE DUPLICATE COMPONENTS
==================================================

After verification:

remove/retire obsolete:

SocialFeedOverview

CommunityOverview

duplicated Feed navigation

duplicate quick-action grids

duplicate page headers.

Reuse shared components.

==================================================
91. PERFORMANCE
==================================================

Feed loads first page quickly.

Side modules should not block Feed.

Use pagination/infinite loading for Feed.

Do not preload every Community subsystem.

==================================================
92. REALTIME
==================================================

Realtime may update:

new messages

comments

reactions

relevant new posts

friend requests.

Database remains authoritative.

==================================================
93. DO NOT FORCE LIVE FEED JUMPS
==================================================

If new posts arrive while user is reading:

show:

3 new posts

rather than suddenly moving their viewport.

==================================================
94. FEED POST DEDUPLICATION
==================================================

Prevent duplicate automated posts from:

same Round import

same badge job

same Event result

retries.

Use idempotent activity keys where appropriate.

==================================================
95. AUTOMATED ACTIVITY QUALITY
==================================================

Only generate Feed activity when it is meaningful.

Do not produce noise for:

minor profile edits

every import job

administrative changes

background data updates.

==================================================
96. ACCEPTANCE — NAVIGATION
==================================================

Global nav:

Community

only.

No separate Feed.

Click Community:

Feed appears immediately.

==================================================
97. ACCEPTANCE — QUICK LINKS
==================================================

Community includes easy access to:

People

Messages

Clubs

Marketplace

Lost & Found

Community Events.

No:

Course Builder

Start Round

Practice

Statboard

duplicate Event creation.

==================================================
98. ACCEPTANCE — COMMUNITY EVENTS
==================================================

Community Home shows nearby Community Event preview.

Click See All:

Events → Community.

No creation button.

==================================================
99. ACCEPTANCE — PEOPLE
==================================================

Friend request received.

Community shows compact notification.

People page shows request.

Accept.

Community snapshot updates.

==================================================
100. ACCEPTANCE — FEED
==================================================

Create post.

It appears once.

Comment/reaction works.

Refresh preserves it.

Visibility/RLS works.

==================================================
101. ACCEPTANCE — BADGE GROUPING
==================================================

Player earns multiple achievements close together.

Expected:

do not create a wall of nearly identical Feed cards.

Group/rate-limit appropriately.

==================================================
102. ACCEPTANCE — MOBILE
==================================================

390px portrait.

First screen contains:

Community header

quick social actions

composer

Feed filter

start of Feed.

Not:

six giant navigation cards.

==================================================
103. ACCEPTANCE — DESKTOP
==================================================

Desktop Feed remains central.

Overview information exists around it without competing for attention.

No dashboard-style wall of cards.

==================================================
104. ACCEPTANCE — LEGACY ROUTE
==================================================

Open old Feed route/bookmark.

Expected:

Community Feed opens.

No 404.

==================================================
105. ACCEPTANCE — PERMISSIONS
==================================================

Private/Friends-only post cannot be retrieved by unauthorized user via API.

Blocked user is excluded appropriately.

==================================================
106. FINAL PRODUCT RULE
==================================================

PLAY

is the place to:

PLAY TOGETHER.

EVENTS

is the place to:

DISCOVER EVENTS.

COURSES

is the place to:

DISCOVER / BUILD COURSES.

COMMUNITY

is the place to:

CONNECT, TALK AND SHARE.

Do not make Community duplicate the jobs of the other three.

==================================================
107. FINAL UX RULE
==================================================

Opening Community should feel like opening:

DGD'S DISC GOLF SOCIAL NETWORK.

The first thing users should see is:

people
posts
Rounds
clubs
conversations
community activity.

Not:

a navigation dashboard.

==================================================
108. IMPLEMENTATION ORDER
==================================================

1. Audit Social Feed + Community routes/components
2. Make /community the canonical social route
3. Redirect old Feed route
4. Remove Feed from global primary navigation
5. Make Feed the Community default screen
6. Remove separate Overview dependency
7. Build compact Community navigation
8. Build Community Snapshot
9. Integrate DGIM/unread state
10. Clean Community quick actions
11. Remove unrelated quick links
12. Integrate People suggestions/requests
13. Integrate Club previews
14. Integrate Community Event preview
15. Connect Events → Community
16. Keep Marketplace
17. Keep Lost & Found
18. Rework Feed filters
19. Group repetitive automated activity
20. Improve desktop layout
21. Improve mobile layout
22. Remove Arrange Layout
23. Remove Create Community Event
24. Verify post/comment/reaction behavior
25. Verify privacy/RLS/blocking
26. Remove obsolete duplicated components
27. Full regression
28. production-ready verification.

==================================================
109. COMPLETION REPORT
==================================================

Return:

A. route consolidation
B. global navigation cleanup
C. Community Feed Home
D. secondary Community navigation
E. Community Snapshot
F. DGIM integration
G. Quick Actions cleanup
H. People/friend requests
I. Clubs
J. Community Events integration
K. Marketplace
L. Lost & Found
M. Feed filtering
N. automated activity grouping
O. Around Disc Golf
P. mobile UI
Q. desktop UI
R. privacy/RLS
S. legacy Feed redirect
T. removed duplicate components
U. regression tests
V. remaining blockers.