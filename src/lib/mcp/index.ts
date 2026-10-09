import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import listMyRounds from "./tools/list-my-rounds";
import searchCourses from "./tools/search-courses";
import createPost from "./tools/create-post";

// The OAuth issuer must be the direct Supabase host. Only the project ref
// survives publish unchanged, and Vite inlines this literal at build time.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "dg-dashboard",
  title: "DG Dashboard",
  version: "0.1.0",
  instructions:
    "Tools for DG Dashboard | Ace, a disc golf platform. Read the signed-in player's profile and rounds, search the course directory, and post to the social feed. All tools act as the signed-in player and respect their permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, listMyRounds, searchCourses, createPost],
});
