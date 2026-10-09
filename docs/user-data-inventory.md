# User data inventory

Every category of user data DG Dashboard stores, where it comes from, what it is used
for, and how the player controls visibility.

Source of truth for the in-app page (`/settings/data`): `src/lib/data-inventory.ts`.
Update both together whenever data use changes.

## Visibility model

- Per-section profile audiences (`public` / `friends` / `private`) live in
  `src/lib/profile-visibility.ts`; the account-level setting can only tighten them.
- Enforcement is server-side: `getPlayerProfile` strips hidden sections before they
  leave the worker. UI hiding is presentation only.
- Items marked private have no audience control by design — they are never returned to
  other players.

## Categories

| Group              | Data                              | Collected                                                | Used for                           | Source       | Control                                                             |
| ------------------ | --------------------------------- | -------------------------------------------------------- | ---------------------------------- | ------------ | ------------------------------------------------------------------- |
| Account & identity | Sign-in details                   | Email, sign-in method, created/last sign-in              | Auth, security, account email      | You          | Private (you + staff)                                               |
| Account & identity | Name, username, photos            | Display name, username, avatar, cover                    | Attribution across the app         | You          | Always visible where you appear                                     |
| Account & identity | Bio                               | About text                                               | Profile                            | You          | Profile section `bio`                                               |
| Account & identity | Home course                       | Listed home course                                       | Local recommendations              | You          | Profile section `homeCourse`                                        |
| Account & identity | PDGA membership                   | PDGA #, status, official rating, divisions               | Verified ratings, eligibility      | PDGA         | Profile section `pdga`                                              |
| Account & identity | Findability                       | Name/PDGA # in player search                             | Discovery                          | You          | Toggle `showInSearch`                                               |
| Account & identity | Level, XP, streaks                | Level, title, XP, streak                                 | Progress, achievements             | App play     | Profile section `progress`                                          |
| Play & performance | Rounds and scorecards             | Date, course, layout, hole scores, cardmates, round type | History, stats, ratings            | App play     | Profile section `rounds`                                            |
| Play & performance | Ratings                           | Published PDGA/UDisc ratings, DGD estimates              | Trends, comparisons                | PDGA / UDisc | Profile section `ratings`                                           |
| Play & performance | Stat totals                       | Rounds, wins, aces, events, bests                        | Stat strip, StatLink               | App play     | Profile section `stats`                                             |
| Play & performance | Scoring breakdown                 | Birdie/par/bogey rates                                   | Coaching, Ace                      | App play     | Profile section `scoring`                                           |
| Play & performance | Recent form                       | Trend line, hot/cold stretches                           | Form view                          | App play     | Profile section `form`                                              |
| Play & performance | Division history                  | Divisions and results                                    | Eligibility, history               | PDGA         | Profile section `divisions`                                         |
| Play & performance | Events played                     | Events, placements, published payouts                    | Results, standings                 | PDGA         | Profile section `events`                                            |
| Play & performance | Upcoming schedule                 | Registrations, tracked events, tee times                 | Calendar, reminders                | App play     | Profile section `calendar`                                          |
| Play & performance | Achievements                      | Badges earned                                            | Achievement wall                   | App play     | Profile section `achievements`                                      |
| Connected sources  | Connected accounts                | PDGA #, UDisc and Disc Golf Scene links                  | Automatic sync                     | You          | Private, encrypted; disconnect any time                             |
| Connected sources  | Imported files                    | UDisc CSV uploads, matched names, results                | Outside rounds, dedupe             | You          | Private                                                             |
| Connected sources  | Sync activity                     | Last sync per source, errors                             | Freshness, troubleshooting         | App play     | Private (you + staff)                                               |
| Social & community | Posts and comments                | Posts, comments, reactions, per-post audience            | Feed, profile                      | You          | Profile section `posts`                                             |
| Social & community | Photos                            | Images on posts, rounds, listings                        | Feed, gear                         | You          | Profile section `photos`                                            |
| Social & community | Crew and follows                  | Crew, follows, trackers                                  | Feed, tracking                     | You          | Profile section `friends`                                           |
| Social & community | Follower counts                   | Follower/following totals                                | Profile summary                    | App play     | Profile section `followCounts`                                      |
| Social & community | Crew requests                     | Invites in and out                                       | Crew building                      | You          | Toggle `allowFriendRequests`                                        |
| Social & community | Direct messages                   | Conversations and contents                               | Private chat                       | You          | Choice `allowMessagesFrom`                                          |
| Social & community | Clubs                             | Memberships, roles, managed events                       | Club pages, permissions            | You          | Private to club members/managers                                    |
| Equipment          | My Bag                            | Discs, molds, plastics, weights, notes                   | Gaps, recommendations, comparisons | You          | Profile section `bag`                                               |
| Equipment          | Throw profile                     | Distances, power band, shot shapes                       | Recommendations, coaching          | You          | Private                                                             |
| Equipment          | Marketplace / Lost & Found        | Listings, prices, disc details, contact info             | Selling, trading, returns          | You          | Listings public; phone released only via authorized contact request |
| Location           | City and state                    | Profile city/state                                       | Local content                      | You          | Profile section `location`                                          |
| Location           | Device location                   | Coordinates when you press Use current location          | Distance sorting                   | Your device  | Not stored, not shared; browser permission                          |
| Device & app usage | App preferences                   | Theme, text size, layouts, bottom buttons, filters       | Consistent setup                   | You          | Private                                                             |
| Device & app usage | Notification settings and devices | Channel choices, quiet hours, push tokens                | Alerts you asked for               | Your device  | Private                                                             |
| Device & app usage | Diagnostics and feedback          | Error reports, beta feedback, page/device info           | Crash fixes                        | Your device  | Staff only                                                          |
| Device & app usage | Ask Ace conversations             | Your questions and answers                               | Conversation context, coaching     | You          | Private                                                             |

## Residual notes

- Public event and league results published by PDGA, UDisc, or Disc Golf Scene stay
  public at the source regardless of app settings; hiding a section hides it on DG
  Dashboard only.
- Your name still appears on rosters of events you register for, as stated on the
  privacy page.
