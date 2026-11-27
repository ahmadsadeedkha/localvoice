"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  NotificationItem,
  NotificationsPayload,
} from "@/lib/notification-types";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./actions";

const POLL_MS = 30_000;

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<NotificationsPayload>({
    items: [],
    unreadCount: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const next = await fetchNotifications();
      if (next && !cancelled) setData(next);
    };
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  async function open(n: NotificationItem) {
    if (!n.readAt) {
      setData((d) => ({
        unreadCount: Math.max(0, d.unreadCount - 1),
        items: d.items.map((i) =>
          i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i,
        ),
      }));
      void markNotificationRead(n.id);
    }
    if (n.link) router.push(n.link);
  }

  async function readAll() {
    setData((d) => ({
      unreadCount: 0,
      items: d.items.map((i) => ({
        ...i,
        readAt: i.readAt ?? new Date().toISOString(),
      })),
    }));
    await markAllNotificationsRead();
  }

  return (
    <DropdownMenu
      onOpenChange={(isOpen) => {
        if (isOpen) void fetchNotifications().then((n) => n && setData(n));
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            data.unreadCount > 0
              ? `Notifications, ${data.unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell className="size-5" aria-hidden />
          {data.unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-white">
              {data.unreadCount > 9 ? "9+" : data.unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {data.unreadCount > 0 && (
            <button
              type="button"
              onClick={readAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all as read
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-96 overflow-y-auto">
          {data.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            data.items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={() => open(n)}
                className="flex cursor-pointer flex-col items-start gap-0.5 rounded-none px-3 py-2.5"
              >
                <span className="flex w-full items-center gap-2 text-sm font-medium">
                  {!n.readAt && (
                    <span
                      className="size-2 shrink-0 rounded-full bg-primary"
                      aria-label="Unread"
                    />
                  )}
                  <span className="line-clamp-1">{n.title}</span>
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {n.body}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {timeAgo(n.createdAt)}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
