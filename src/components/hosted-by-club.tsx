import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function HostedByClub({ clubId }: { clubId: string | null | undefined }) {
  const q = useQuery({
    queryKey: ["club-name", clubId],
    enabled: !!clubId,
    staleTime: 600_000,
    queryFn: async () => (await supabase.from("clubs").select("name, slug").eq("id", clubId!).maybeSingle()).data,
  });
  if (!clubId || !q.data) return null;
  return (
    <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
      <Users className="h-4 w-4" /> Hosted by{" "}
      <Link to="/clubs/$slug" params={{ slug: q.data.slug }} className="font-medium text-foreground hover:underline">
        {q.data.name}
      </Link>
    </p>
  );
}
