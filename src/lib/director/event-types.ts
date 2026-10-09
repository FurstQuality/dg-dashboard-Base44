/**
 * One catalogue of event types for Create Event. A type is configuration:
 * it picks which existing creation flow opens and which modules it starts with.
 */
export type EventGroup = "competition" | "community" | "special";
export type CommunityKind = "cleanup" | "charity" | "group_round" | "meetup" | "clinic";

export type EventTypeDef = {
  id: string;
  group: EventGroup;
  label: string;
  blurb: string;
  /** Which creation flow handles this type. */
  flow: "tournament" | "league" | "community" | "series";
  communityKind?: CommunityKind;
  modules: string[];
};

export const EVENT_TYPES: EventTypeDef[] = [
  { id: "tournament", group: "competition", label: "Tournament", blurb: "PDGA or unsanctioned, one or more rounds.", flow: "tournament", modules: ["Course & rounds", "Registration", "Players", "Staff", "Check-in", "Scoring", "Finance", "Payouts", "Results"] },
  { id: "league", group: "competition", label: "League / recurring play", blurb: "Weekly nights with season standings.", flow: "league", modules: ["Schedule", "Players", "Standings", "Scoring"] },
  { id: "series", group: "competition", label: "Series", blurb: "Score several leagues or tournaments together for season standings.", flow: "series", modules: ["Events", "Points", "Standings", "Finale"] },
  { id: "doubles", group: "competition", label: "Random doubles", blurb: "Draw partners, play, pay out.", flow: "tournament", modules: ["Course", "Players", "Team draw", "Scoring", "Prizes"] },
  { id: "match_play", group: "competition", label: "Match play", blurb: "Head-to-head brackets.", flow: "tournament", modules: ["Course", "Players", "Bracket", "Results"] },
  { id: "team", group: "competition", label: "Team event", blurb: "Clubs or teams competing together.", flow: "tournament", modules: ["Course", "Teams", "Scoring", "Results"] },
  { id: "cleanup", group: "community", label: "Course cleanup", blurb: "Rally volunteers to care for a course.", flow: "community", communityKind: "cleanup", modules: ["Course", "Volunteers", "Tasks", "Announcements", "Photos"] },
  { id: "clinic", group: "community", label: "Clinic", blurb: "Teach throws, putting or rules.", flow: "community", communityKind: "clinic", modules: ["Course", "Registration", "Schedule", "Attendance"] },
  { id: "fundraiser", group: "community", label: "Fundraiser", blurb: "Raise money for a cause.", flow: "community", communityKind: "charity", modules: ["Registration", "Donations", "Announcements"] },
  { id: "party", group: "community", label: "Players party", blurb: "Hang out, play casual, celebrate.", flow: "community", communityKind: "meetup", modules: ["Location", "RSVPs", "Announcements"] },
  { id: "volunteer", group: "community", label: "Volunteer event", blurb: "Course work days and installs.", flow: "community", communityKind: "cleanup", modules: ["Volunteers", "Tasks", "Photos"] },
  { id: "glow", group: "special", label: "Glow event", blurb: "Night rounds with lit discs and baskets.", flow: "tournament", modules: ["Course", "Players", "Scoring", "Safety"] },
  { id: "exhibition", group: "special", label: "Exhibition", blurb: "Showcase rounds for spectators.", flow: "tournament", modules: ["Course", "Players", "Media"] },
  { id: "skills", group: "special", label: "Skills challenge", blurb: "CTP, long drive, putting contests.", flow: "community", communityKind: "group_round", modules: ["Stations", "Players", "Prizes"] },
  { id: "custom", group: "special", label: "Custom", blurb: "Something else — start simple.", flow: "community", communityKind: "meetup", modules: ["Location", "RSVPs"] },
];

export const EVENT_GROUP_LABEL: Record<EventGroup, string> = {
  competition: "Competition",
  community: "Community",
  special: "Special",
};
