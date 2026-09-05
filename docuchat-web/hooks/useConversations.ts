"use client";

import { useCallback, useEffect, useState } from "react";
import type { Conversation, Message } from "@/types/docuchat";

const KEY = "docuchat:conversations";
const MAX = 40;

/** crypto.randomUUID() only exists in a secure context and on recent browsers.
 *  Falling back keeps the app working over a LAN address or in an older
 *  browser instead of throwing mid-update. */
export function id(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newConversation(): Conversation {
  const now = Date.now();
  return { id: id(), title: "New chat", messages: [], createdAt: now, updatedAt: now };
}

/** Title a conversation from its first question, so the sidebar is scannable. */
function titleFrom(messages: Message[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  const t = first.content.trim().replace(/\s+/g, " ");
  return t.length > 44 ? `${t.slice(0, 44)}…` : t;
}

/**
 * Conversation history, persisted in localStorage.
 *
 * The backend is stateless — every /query is independent and keeps no history.
 * Storing conversations client-side gives the user a usable transcript without
 * requiring a database, and makes it obvious what would move server-side if
 * multi-device sync were ever needed.
 */
export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed: Conversation[] = raw ? JSON.parse(raw) : [];
      const usable = Array.isArray(parsed)
        ? parsed.filter((c) => c && typeof c.id === "string" && Array.isArray(c.messages))
        : [];

      if (usable.length > 0) {
        setConversations(usable);
        setActiveId(usable[0].id);
      } else {
        const c = newConversation();
        setConversations([c]);
        setActiveId(c.id);
      }
    } catch {
      // Corrupt or unreadable storage (private mode, quota, bad JSON).
      // Start clean rather than leaving the app on its loading skeleton.
      const c = newConversation();
      setConversations([c]);
      setActiveId(c.id);
    } finally {
      // In a finally block on purpose: if anything above throws, the UI must
      // still leave the skeleton. A blank screen is worse than a lost history.
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(conversations.slice(0, MAX)));
    } catch {
      /* quota exceeded — history is a convenience, not load-bearing */
    }
  }, [conversations, loaded]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const setMessages = useCallback(
    (updater: (prev: Message[]) => Message[]) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? (() => {
                const messages = updater(c.messages);
                return { ...c, messages, title: titleFrom(messages), updatedAt: Date.now() };
              })()
            : c,
        ),
      );
    },
    [activeId],
  );

  const startNew = useCallback(() => {
    setConversations((prev) => {
      // Don't stack up empty chats
      const empty = prev.find((c) => c.messages.length === 0);
      if (empty) {
        queueMicrotask(() => setActiveId(empty.id));
        return prev;
      }
      const c = newConversation();
      queueMicrotask(() => setActiveId(c.id));
      return [c, ...prev];
    });
  }, []);

  const remove = useCallback((target: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== target);
      if (next.length === 0) {
        const c = newConversation();
        queueMicrotask(() => setActiveId(c.id));
        return [c];
      }
      queueMicrotask(() => setActiveId((cur) => (cur === target ? next[0].id : cur)));
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    const c = newConversation();
    setConversations([c]);
    setActiveId(c.id);
  }, []);

  // If activeId ever points at a conversation that no longer exists, fall back
  // to the first one rather than rendering an empty conversation.
  useEffect(() => {
    if (!loaded || conversations.length === 0) return;
    if (!conversations.some((c) => c.id === activeId)) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId, loaded]);

  return {
    conversations,
    active,
    activeId,
    loaded,
    setActiveId,
    setMessages,
    startNew,
    remove,
    clearAll,
  };
}
