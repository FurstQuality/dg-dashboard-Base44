import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/shell/page-shell";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mascot } from "@/components/mascot";
import {
  askCaddy,
  listCaddyConversations,
  getCaddyConversation,
  deleteCaddyConversation,
  getCaddyAccess,
  type CaddyMessage,
} from "@/lib/caddy.functions";
import type { AceAccess } from "@/lib/ace-tier";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Markdown + GFM are ~100kb of parser; load them with the first reply, not the page. */
const LazyMarkdown = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import("react-markdown"),
    import("remark-gfm"),
  ]);
  return {
    default: ({ children }: { children: string }) => (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    ),
  };
});

export const Route = createFileRoute("/_authenticated/ace")({
  component: AcePage,
  head: () => ({
    meta: [
      { title: "Ace · Your AI disc golf coach · DG Dashboard" },
      {
        name: "description",
        content:
          "Ask Ace for disc picks, wind adjustments, PDGA rules, and shot strategy tuned to your bag and rating.",
      },
      { property: "og:title", content: "Ace · Your AI disc golf coach · DG Dashboard" },
      {
        property: "og:description",
        content: "Personalized disc golf advice powered by your bag, rounds, and rating.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SUGGESTIONS = [
  "What disc should I throw for a 320ft tight tunnel with a right-to-left crosswind?",
  "Give me a bag audit — where are the gaps for my rating?",
  "Coach my putting inside the circle. Drill routine for this week?",
  "Explain PDGA rule 803 OB in plain English with an example.",
  "How do I approach my next round to bump my rating up?",
  "What's the safe vs aggressive line on a 450ft dogleg right, wooded?",
];

type ConvSummary = { id: string; title: string; updated_at: string };

function AcePage() {
  const ask = useServerFn(askCaddy);
  const listConvos = useServerFn(listCaddyConversations);
  const getConvo = useServerFn(getCaddyConversation);
  const deleteConvo = useServerFn(deleteCaddyConversation);
  const fetchAccess = useServerFn(getCaddyAccess);
  const [access, setAccess] = useState<AceAccess | null>(null);

  const [convos, setConvos] = useState<ConvSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CaddyMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function refreshConvos() {
    try {
      const r = await listConvos();
      setConvos(r.conversations);
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    refreshConvos();
    fetchAccess()
      .then(setAccess)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    (async () => {
      const r = await getConvo({ data: { id: activeId } });
      setMessages(r.messages);
    })();
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setSending(true);
    setInput("");

    // Optimistic user bubble
    const optimistic: CaddyMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: msg,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    try {
      const res = await ask({ data: { conversationId: activeId ?? undefined, message: msg } });
      if (!activeId) setActiveId(res.conversationId);
      // Refetch full convo to get real IDs
      const full = await getConvo({ data: { id: res.conversationId } });
      setMessages(full.messages);
      refreshConvos();
    } catch (e: any) {
      toast.error(e?.message ?? "Ace failed to reply");
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  async function newChat() {
    setActiveId(null);
    setMessages([]);
    setInput("");
  }

  async function removeConvo(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await deleteConvo({ data: { id } });
    if (activeId === id) newChat();
    refreshConvos();
  }

  const empty = messages.length === 0;

  return (
    <PageShell>
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="rounded-xl border border-border bg-card p-3">
          <Button onClick={newChat} className="w-full gap-2" size="sm">
            <Plus className="h-4 w-4" /> New chat
          </Button>
          <div className="mt-3 space-y-1 max-h-[70vh] overflow-y-auto">
            {convos.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                Your chats will appear here.
              </div>
            ) : (
              convos.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer",
                    activeId === c.id ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <button
                    onClick={() => setActiveId(c.id)}
                    className="flex-1 min-w-0 text-left truncate"
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeConvo(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Chat */}
        <section className="rounded-xl border border-border bg-card flex flex-col min-h-[70vh]">
          <header className="flex items-center gap-3 border-b border-border p-4">
            <Mascot name="ace" className="h-12 w-12" />
            <div className="min-w-0">
              <h1 className="font-graphic text-2xl leading-none">Ace</h1>
              <p className="text-xs text-muted-foreground">
                Ace, your AI caddy — disc picks, strategy, rules, and stats coaching.
              </p>
            </div>
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
                access?.tier === "free"
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/10 text-primary",
              )}
              title={access?.description ?? undefined}
            >
              <Sparkles className="h-3 w-3" />
              {access?.label ?? "Ace"}
            </span>
          </header>

          {access ? (
            <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              {access.description}
            </div>
          ) : null}

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {empty ? (
              <EmptyState onPick={(q) => send(q)} />
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}
            {sending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mascot name="ace" className="h-6 w-6" />
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Ace is reading the wind…</span>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-border p-3 flex items-end gap-2"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="Ask about a shot, a rule, your bag, or your rating…"
              className="resize-none"
              disabled={sending}
            />
            <Button type="submit" disabled={sending || !input.trim()} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </form>
        </section>
      </div>
    </PageShell>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center text-center py-8">
      <Mascot name="ace" className="h-24 w-24" />
      <h2 className="mt-3 font-graphic text-3xl text-hero">Ask Ace anything</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Personalized to your bag, recent rounds, and rating. Try one of these:
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 max-w-2xl w-full">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg border border-border bg-background hover:bg-muted px-3 py-2 text-left text-sm"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: CaddyMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? <Mascot name="ace" className="h-8 w-8 shrink-0" /> : null}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-headings:mt-3 prose-headings:mb-1">
            <Suspense fallback={<div className="whitespace-pre-wrap">{message.content}</div>}>
              <LazyMarkdown>{message.content}</LazyMarkdown>
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
