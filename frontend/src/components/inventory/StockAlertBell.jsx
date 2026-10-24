"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import {
  fetchStockNotifications,
  updateStockNotification,
} from "@/src/api/inventoryApi.js";
import { Badge, Button, Pagination } from "./InventoryUI.jsx";
import { apiErrorMessage } from "./inventoryUtils.js";

export default function StockAlertBell({ user }) {
  const allowed = [
    "admin",
    "manager",
    "inventory",
    "storekeeper",
    "accountant",
  ].includes(user?.role);
  const [open, setOpen] = useState(false),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1);
  const trigger = useRef(null),
    panel = useRef(null),
    controller = useRef(null),
    channel = useRef(null),
    lock = useRef(false);
  const [position, setPosition] = useState({ left: 16, top: 72 });
  useEffect(() => {
    setData(null);
    setOpen(false);
    setPage(1);
  }, [user?._id]);
  const refresh = useCallback(() => {
    if (!allowed || document.hidden) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    fetchStockNotifications({ page, limit: 20 }, { signal: request.signal })
      .then((result) => {
        if (!request.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((error) => {
        if (!request.signal.aborted) {
          if ([401, 403].includes(error.response?.status)) setData(null);
          setError(apiErrorMessage(error));
        }
      });
  }, [allowed, page]);
  useEffect(() => {
    setData(null);
    if (!allowed) return;
    refresh();
    const timer = setInterval(refresh, 30000);
    const update = () => {
      refresh();
      channel.current?.postMessage("updated");
    };
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(`dg-stock-alerts-${user._id}`);
      channel.current.onmessage = refresh;
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("dg-stock-alerts-updated", update);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
      channel.current?.close();
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("dg-stock-alerts-updated", update);
    };
  }, [allowed, refresh, user?._id]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const outside = (event) => {
      if (
        !trigger.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
      )
        setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const resize = () => setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  const act = async (note, action, minutes) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await updateStockNotification(note._id, {
        action,
        ...(minutes ? { minutes } : {}),
      });
      refresh();
      channel.current?.postMessage("updated");
      window.dispatchEvent(new Event("dg-stock-alerts-updated"));
    } catch (error) {
      setError(apiErrorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!allowed) return null;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-neutral-300 hover:text-dune-amber"
        aria-label="Stock alert notifications"
        aria-expanded={open}
        aria-controls="stock-alert-bell-panel"
        onClick={() => {
          const rect = trigger.current.getBoundingClientRect();
          setPosition({
            left: Math.max(
              12,
              Math.min(
                rect.right - 370,
                innerWidth - Math.min(370, innerWidth - 24) - 12,
              ),
            ),
            top: rect.bottom + 8,
          });
          setOpen((current) => !current);
          refresh();
        }}
      >
        <BellRing size={19} />
        {data?.unread > 0 && (
          <span
            className="absolute -right-1 -top-1 min-w-4 rounded-full bg-dune-amber px-1 text-[10px] font-bold text-black"
            aria-label={`${data.unread} unread stock alerts`}
          >
            {data.unread > 99 ? "99+" : data.unread}
          </span>
        )}
        {error && (
          <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-amber-500" />
        )}
      </button>
      {open &&
        createPortal(
          <section
            id="stock-alert-bell-panel"
            aria-label="Stock notifications"
            ref={panel}
            tabIndex={-1}
            style={position}
            className="fixed z-[95] max-h-[calc(100dvh-6rem)] w-[min(370px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-white/15 bg-[#101416] p-4 shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-body font-semibold text-white">
                Stock notifications
              </h2>
              <button
                type="button"
                aria-label="Close stock notifications"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
                className="grid h-9 w-9 place-items-center text-neutral-400"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs leading-5 text-neutral-400">
              Your latest reminder per incident. Resolved alerts do not count as
              unread.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-xs text-amber-300">
                {error}{" "}
                <button type="button" onClick={refresh} className="underline">
                  Retry
                </button>
              </p>
            )}
            <div className="mt-3 space-y-3">
              {!data && !error && (
                <p role="status" className="text-sm text-neutral-400">
                  Loading notifications…
                </p>
              )}
              {data?.data.map((note) => (
                <article
                  key={note._id}
                  className={`rounded-xl border p-3 ${note.active && !note.readAt ? "border-dune-amber/40" : "border-white/10"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        !note.active
                          ? "neutral"
                          : note.severity === "out"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {!note.active
                        ? "No longer active"
                        : note.snoozed
                          ? "Snoozed"
                          : note.severity === "out"
                            ? "Out of stock"
                            : "Low stock"}
                    </Badge>
                  </div>
                  <h3 className="mt-2 break-words font-body text-sm font-semibold text-white">
                    {note.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-neutral-300">
                    {note.body}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {new Date(note.createdAt).toLocaleString("en-GB", {
                      timeZone: "Asia/Riyadh",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}{" "}
                    · Riyadh
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      className="rounded-lg bg-dune-amber px-3 py-2 text-xs font-semibold text-black"
                      href={`/inventory/low-stock-alerts?tab=current&item=${note.item}`}
                      onClick={() => {
                        act(note, "read");
                        setOpen(false);
                      }}
                    >
                      View stock
                    </Link>
                    {!note.readAt && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => act(note, "read")}
                      >
                        Mark read
                      </Button>
                    )}
                    {note.active && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => act(note, "snooze", 30)}
                      >
                        Snooze 30 min
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => act(note, "dismiss")}
                    >
                      Dismiss
                    </Button>
                  </div>
                </article>
              ))}
              {data && !data.data.length && (
                <p className="py-5 text-center text-sm text-neutral-400">
                  No stock notifications.
                </p>
              )}
            </div>
            <Pagination pagination={data?.pagination} onPageChange={setPage} />
            <Link
              href="/inventory/low-stock-alerts?tab=current"
              className="mt-4 block rounded-lg border border-white/10 p-3 text-center text-xs text-dune-amber"
              onClick={() => setOpen(false)}
            >
              Open Current Alerts
            </Link>
          </section>,
          document.body,
        )}
    </>
  );
}
