import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clampPos, cleanSay, roomChannel, type EmoteId, type RoomRef } from "@/lib/staging/world";

export type StagingPlayer = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  x: number;
  y: number;
  activity: string;
  joinedAt: number;
};

export type Bubble = { id: string; userId: string; text: string; at: number };
export type EmoteBurst = { id: string; userId: string; emote: EmoteId; at: number };

export type GameEvent =
  | { type: "putt"; userId: string; name: string; distance: number; result: "chains" | "spit" | "miss" }
  | { type: "toss"; userId: string; name: string; x: number; y: number; points: number }
  | { type: "trivia_start"; hostId: string; seed: number; startAt: number }
  | { type: "invite"; fromId: string; fromName: string; toId: string; game: "putt" | "toss" | "trivia" }
  | { type: "play_request"; userId: string; name: string; toId: string | null; at: number }
  | { type: "trivia_answer"; userId: string; name: string; seed: number; q: number; choice: number; ms: number };

type Me = { userId: string; name: string; avatarUrl: string | null };

/**
 * Live room for the Staging area. Presence carries who's here and where they stand;
 * broadcast carries speech bubbles, emotes and mini-game moves. Nothing here is stored —
 * saved conversation lives in each event's chat.
 */
export function useStagingRoom(room: RoomRef, me: Me | null, hiddenIds: Set<string>) {
  const [players, setPlayers] = useState<StagingPlayer[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [emotes, setEmotes] = useState<EmoteBurst[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const selfRef = useRef<StagingPlayer | null>(null);
  const hiddenRef = useRef(hiddenIds);
  hiddenRef.current = hiddenIds;

  const key = roomChannel(room);

  useEffect(() => {
    if (!me) return;
    const start = clampPos(20 + Math.random() * 30, 55 + Math.random() * 30);
    selfRef.current = { ...me, ...start, activity: "Hanging out", joinedAt: Date.now() };
    const ch = supabase.channel(key, { config: { presence: { key: me.userId }, broadcast: { self: true } } });
    channelRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<StagingPlayer>();
      const list: StagingPlayer[] = [];
      for (const [id, metas] of Object.entries(state)) {
        const m = metas[metas.length - 1];
        if (!m || hiddenRef.current.has(id)) continue;
        list.push({ userId: id, name: m.name || "Player", avatarUrl: m.avatarUrl ?? null, ...clampPos(m.x, m.y), activity: m.activity ?? "", joinedAt: m.joinedAt ?? 0 });
      }
      list.sort((a, b) => a.joinedAt - b.joinedAt);
      setPlayers(list);
    })
      .on("broadcast", { event: "say" }, ({ payload }) => {
        const p = payload as Bubble;
        if (hiddenRef.current.has(p.userId)) return;
        setBubbles((b) => [...b.slice(-30), { ...p, text: cleanSay(p.text) }]);
        setMessages((m) => [...m.slice(-150), { ...p, text: cleanSay(p.text) }]);
      })
      .on("broadcast", { event: "emote" }, ({ payload }) => {
        const p = payload as EmoteBurst;
        if (hiddenRef.current.has(p.userId)) return;
        setEmotes((e) => [...e.slice(-20), p]);
      })
      .on("broadcast", { event: "game" }, ({ payload }) => {
        const p = payload as GameEvent;
        if ("userId" in p && hiddenRef.current.has(p.userId)) return;
        if (p.type === "invite" && hiddenRef.current.has(p.fromId)) return;
        setEvents((e) => [...e.slice(-200), p]);
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED" && selfRef.current) void ch.track(selfRef.current);
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(ch);
      setPlayers([]);
    };
  }, [key, me?.userId, me?.name, me?.avatarUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expire bubbles and emotes.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setBubbles((b) => (b.some((x) => now - x.at > 6000) ? b.filter((x) => now - x.at <= 6000) : b));
      setEmotes((e) => (e.some((x) => now - x.at > 2500) ? e.filter((x) => now - x.at <= 2500) : e));
    }, 500);
    return () => clearInterval(t);
  }, []);

  const update = useCallback((patch: Partial<StagingPlayer>) => {
    const ch = channelRef.current;
    if (!ch || !selfRef.current) return;
    const next = { ...selfRef.current, ...patch };
    const pos = clampPos(next.x, next.y);
    selfRef.current = { ...next, ...pos };
    void ch.track(selfRef.current);
  }, []);

  const moveTo = useCallback((x: number, y: number) => update({ x, y }), [update]);
  const setActivity = useCallback((activity: string) => update({ activity }), [update]);

  const say = useCallback((text: string) => {
    const ch = channelRef.current;
    const clean = cleanSay(text);
    if (!ch || !me || !clean) return;
    void ch.send({ type: "broadcast", event: "say", payload: { id: crypto.randomUUID(), userId: me.userId, text: clean, at: Date.now() } });
  }, [me]);

  const emote = useCallback((id: EmoteId) => {
    const ch = channelRef.current;
    if (!ch || !me) return;
    void ch.send({ type: "broadcast", event: "emote", payload: { id: crypto.randomUUID(), userId: me.userId, emote: id, at: Date.now() } });
  }, [me]);

  const sendGame = useCallback((ev: GameEvent) => {
    const ch = channelRef.current;
    if (!ch) return;
    void ch.send({ type: "broadcast", event: "game", payload: ev });
  }, []);

  return { players, messages, bubbles, emotes, events, connected, moveTo, setActivity, say, emote, sendGame };
}
