"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bell, Check, LoaderCircle, CheckCheck, Sparkles, UsersRound } from "lucide-react";
import { insforge } from "@/lib/insforge/browser";
import { useWorkspaceAccess } from "@/features/workspace/workspace-access";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  task_id: string | null;
  read_at: string | null;
  created_at: string;
};

function ringBell() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(620, context.currentTime + 0.18);

    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.32);
    oscillator.addEventListener("ended", () => void context.close(), { once: true });
  } catch {
    // Audio may be blocked until the user interacts with the page.
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function NotificationBell() {
  const { state } = useWorkspaceAccess();
  const userId = state.kind === "ready" ? state.user.id : null;
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const canPortal = typeof document !== "undefined";

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await insforge.database
        .from("notifications")
        .select("id,type,title,body,task_id,read_at,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12);
      setItems((data ?? []) as Notification[]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    queueMicrotask(() => void load());
    let active = true;

    const handleAssignment = (payload: unknown) => {
      if (!active || !payload || typeof payload !== "object") return;
      const next = payload as Notification;
      if (!next.id || !["task_assigned", "access_request_received"].includes(next.type)) return;

      setItems((current) => [next, ...current.filter((item) => item.id !== next.id)].slice(0, 12));
      ringBell();
    };

    void (async () => {
      try {
        await insforge.realtime.connect();
        await insforge.realtime.subscribe(`user:${userId}`);
        insforge.realtime.on("task_assigned", handleAssignment);
        insforge.realtime.on("access_request_received", handleAssignment);
      } catch {
        // Durable notifications still work from the database.
      }
    })();

    return () => {
      active = false;
      insforge.realtime.off("task_assigned", handleAssignment);
      insforge.realtime.off("access_request_received", handleAssignment);
      void insforge.realtime.unsubscribe(`user:${userId}`);
    };
  }, [load, userId]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(380, viewportWidth - 24);
      const maxHeight = Math.min(420, viewportHeight - 24);
      const fitsBelow = rect.bottom + maxHeight + 16 <= viewportHeight;
      const top = fitsBelow ? rect.bottom + 10 : Math.max(12, rect.top - maxHeight - 10);
      const left = Math.min(Math.max(12, rect.right + 12), Math.max(12, viewportWidth - width - 12));

      setPopoverStyle({
        position: "fixed",
        top,
        left,
        width,
        maxHeight,
      });
    };

    updatePosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const unread = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

  async function markRead(notification: Notification) {
    if (notification.read_at || !userId) return;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => (item.id === notification.id ? { ...item, read_at: readAt } : item)));
    await insforge.database.from("notifications").update({ read_at: readAt }).eq("id", notification.id).eq("user_id", userId);
  }

  async function markAllRead() {
    if (!userId || unread === 0) return;
    const readAt = new Date().toISOString();
    const unreadIds = items.filter((item) => !item.read_at).map((item) => item.id);
    setItems((current) => current.map((item) => (item.read_at ? item : { ...item, read_at: readAt })));
    await insforge.database.from("notifications").update({ read_at: readAt }).eq("user_id", userId).in("id", unreadIds);
  }

  if (!userId) return null;

  return (
    <div className="notification-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="notification-trigger"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={17} />
        {unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && canPortal && createPortal(
        <section ref={popoverRef} className="notification-popover" style={popoverStyle} aria-label="Notifications">
          <header className="notification-header">
            <div>
              <span className="eyebrow">Inbox</span>
              <strong>Notifications</strong>
              <p>{unread ? `${unread} unread item${unread === 1 ? "" : "s"}` : "You're all caught up."}</p>
            </div>
            <div className="notification-header-actions">
              <span className="notification-live"><Sparkles size={12} /> Live</span>
              <button type="button" className="notification-ghost" onClick={() => void markAllRead()} disabled={unread === 0}>
                <CheckCheck size={14} />
                Mark all read
              </button>
            </div>
          </header>

          {loading ? (
            <div className="notification-empty">
              <LoaderCircle className="spin" size={16} />
              <span>Loading notifications</span>
            </div>
          ) : items.length === 0 ? (
            <div className="notification-empty">
              <Bell size={18} />
              <span>No notifications yet.</span>
              <small>Task assignments and updates will appear here in real time.</small>
            </div>
          ) : (
            <div className="notification-list">
              {items.map((item) => (
                <button
                  type="button"
                  className={`notification-item ${item.read_at ? "read" : "unread"}`}
                  key={item.id}
                  onClick={() => void markRead(item)}
                >
                  <span className="notification-icon">
                  {item.type === "access_request_received" ? <UsersRound size={13} /> : <Bell size={13} />}
                  </span>
                  <span className="notification-copy">
                    <strong>{item.title}</strong>
                    <small>{item.body}</small>
                    <em>
                      {formatTime(item.created_at)}
                      {!item.read_at && <Check size={11} />}
                    </em>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        ,
        document.body,
      )}
    </div>
  );
}
