import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PostCard, type FeedPost } from "@/components/post-card";
import { useSession } from "@/lib/current-user";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { fetchPostMeta, snippet } from "@/lib/public-meta";

export const Route = createFileRoute("/p/$postId")({
  loader: ({ params }) => fetchPostMeta(params.postId),
  head: ({ params, loaderData }) => {
    const body = snippet(loaderData?.body, 70);
    const course = loaderData?.course_name ?? null;
    const label = body || (course ? `Round at ${course}` : "Disc golf post");
    const title = `${label} · DG Dashboard`;
    const description =
      snippet(loaderData?.body, 155) ||
      (course
        ? `A disc golf round shared from ${course} on DG Dashboard.`
        : "A disc golf post shared with the DG Dashboard community.");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: label },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `https://dgdashboard.app/p/${params.postId}` },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `https://dgdashboard.app/p/${params.postId}` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SocialMediaPosting",
            headline: label,
            articleBody: snippet(loaderData?.body, 500) || undefined,
            datePublished: loaderData?.created_at ?? undefined,
            url: `https://dgdashboard.app/p/${params.postId}`,
            author: loaderData?.author?.username
              ? {
                  "@type": "Person",
                  name: loaderData.author.display_name ?? `@${loaderData.author.username}`,
                  url: `https://dgdashboard.app/u/${loaderData.author.username}`,
                }
              : undefined,
            contentLocation: loaderData?.course_name
              ? { "@type": "Place", name: loaderData.course_name }
              : undefined,
          }),
        },
      ],
    };
  },
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This post" />,
  component: PostPermalink,
});

function PostPermalink() {
  const { postId } = Route.useParams();
  const meta = Route.useLoaderData();
  const { user } = useSession();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [notFound, setNotFound] = useState(false);


  const load = useCallback(async () => {
    const { data } = await supabase
      .from("posts")
      .select(
        "id, author_id, type, body, media, location, like_count, comment_count, created_at, course_name, round_id, score_data",
      )
      .eq("id", postId)
      .maybeSingle();
    if (!data) return setNotFound(true);
    const { data: author } = await supabase
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", data.author_id)
      .maybeSingle();
    setPost({
      ...(data as FeedPost),
      media: data.media as FeedPost["media"],
      author: author as FeedPost["author"],
    });
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="font-display text-2xl">Post not found</h1>
        <Link to="/home" className="mt-4 inline-block text-primary hover:underline">
          Back to feed
        </Link>
      </div>
    );
  }


  if (!post) return <div className="p-6 text-sm text-muted-foreground">Loading post…</div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-3 py-4 sm:px-6">
        {!user ? (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
            <span className="text-muted-foreground">Viewing as guest</span>
            <Link to="/auth">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Sign in
              </Button>
            </Link>
          </div>
        ) : (
          <Link
            to="/home"
            className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Feed
          </Link>
        )}
        <h1 className="mb-3 font-display text-xl leading-snug sm:text-2xl">
          {post.author?.display_name
            ? `Disc golf post by ${post.author.display_name}`
            : meta?.course_name
              ? `Disc golf round at ${meta.course_name}`
              : "Disc golf post"}
        </h1>
        <PostCard post={post} currentUserId={user?.id ?? null} onChange={load} />

      </div>
    </div>
  );
}
