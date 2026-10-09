/**
 * Shared entity layer (Phase 4 of DG Dashboard consolidation).
 *
 * One queryOptions factory per entity so Feed, Play, Community, StatLink,
 * and Tracker surfaces all read from the same cache keys. Consumers use:
 *
 *   const { data } = useQuery(scheduleQueryOptions(userId));
 *
 * or, in a loader:
 *
 *   loader: ({ context }) =>
 *     context.queryClient.ensureQueryData(scheduleQueryOptions(userId)),
 *
 * Never re-introduce `useEffect + fetch` for entities represented here.
 */
export { scheduleQueryOptions, type ScheduleRow } from "./schedule";
export {
  friendIdsQueryOptions,
  friendsPlayingNowQueryOptions,
  friendsPageQueryOptions,
  type FriendPlayingRow,
  type FriendsPageData,
  type FriendshipRow,
  type FriendProfileLite,
  type FriendSuggestion,
  type ExternalInvite,
} from "./friends";
export { playerQueryOptions, playerByUsernameQueryOptions, type PlayerProfile } from "./players";
export { roundQueryOptions, activeRoundQueryOptions, type RoundSummary } from "./rounds";
export { courseQueryOptions, type CourseRecord } from "./courses";
export {
  bagDiscsQueryOptions,
  fetchBagDiscs,
  bagDiscLabel,
  type BagDisc,
  type BagMold,
} from "./bag";
export {
  eventQueryOptions,
  tournamentsListQueryOptions,
  leaguesListQueryOptions,
  type EventKind,
  type UnifiedEvent,
  type TournamentListRow,
  type LeagueListRow,
} from "./events";
export {
  notificationsQueryOptions,
  markAllNotificationsRead,
  type NotificationRow,
} from "./notifications";
