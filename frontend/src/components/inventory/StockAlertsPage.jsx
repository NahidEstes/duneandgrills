"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  BellRing,
  PackageX,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import DarkSelect from "../ui/DarkSelect.jsx";
import { usePageFormChanges } from "../ui/useDialogChanges.js";
import InventoryItemPicker from "./InventoryItemPicker.jsx";
import ResourceStatus from "../ui/ResourceStatus.jsx";
import useInventoryResource from "./useInventoryResource.js";
import {
  fetchStockAlertOptions,
  fetchStockAlertRules,
  fetchCurrentStockAlerts,
  saveStockAlertRule,
  checkStockAlerts,
  subscribeStockPush,
  unsubscribeStockPush,
} from "@/src/api/inventoryApi.js";
import {
  preparationUnits,
  preparationQuantityLabel as q,
} from "@/src/utils/preparationUnits.js";
import { apiErrorMessage } from "./inventoryUtils.js";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  InventoryLoadError,
  LoadingState,
  PageHeader,
  Pagination,
  StatCard,
  cardClass,
  inputClass,
} from "./InventoryUI.jsx";

const intervals = [15, 30, 60, 120, 240];
export const stockAlertUpdated = () =>
  window.dispatchEvent(new Event("dg-stock-alerts-updated"));
const time = (value) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Riyadh",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not yet recorded";
const ruleBody = (row) => ({
  item: row.item?._id || row.item,
  enabled: row.enabled,
  lowEnabled: row.lowEnabled,
  outEnabled: row.outEnabled,
  enteredThreshold: row.enteredThreshold,
  enteredUnit: row.enteredUnit,
  mode: row.mode,
  repeatMinutes: row.repeatMinutes,
  dailyTime: row.dailyTime,
  recipients: row.recipients.map((user) => user._id || user),
  expectedVersion: row.version,
});
function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 p-3 text-sm text-neutral-200">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-amber-500"
      />
    </label>
  );
}

function RuleEditor({ selected, options, blocked, onSaved, onCancel }) {
  const [item, setItem] = useState(selected?.item?._id ? selected.item : null);
  const [draft, setDraft] = useState(() =>
    selected?._id
      ? ruleBody(selected)
      : {
          item: selected?.newItemId || "",
          enabled: true,
          lowEnabled: true,
          outEnabled: true,
          enteredThreshold: "",
          enteredUnit: "",
          mode: "repeat",
          repeatMinutes: 30,
          dailyTime: "10:00",
          recipients: [],
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const recipients = [
    ...options.recipients,
    ...(selected?.recipients || []).filter(
      (user) =>
        user?._id &&
        !options.recipients.some((current) => current._id === user._id),
    ),
  ];
  const edit = (values) => setDraft((current) => ({ ...current, ...values }));
  const save = async (event) => {
    event.preventDefault();
    if (lock.current || blocked || !item) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await saveStockAlertRule(selected?._id, {
        ...draft,
        enteredThreshold: Number(draft.enteredThreshold),
      });
      onSaved(saved);
    } catch (error) {
      setError(apiErrorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      className={`${cardClass} min-w-0 p-4 sm:p-6`}
      aria-label="Alert rule editor"
    >
      <h2 className="font-body text-xl font-semibold text-white">
        {selected?._id ? "Edit alert rule" : "New alert rule"}
      </h2>
      <p className="mt-1 text-xs leading-5 text-neutral-400">
        Only the selected recipients for this item receive notifications. Saving
        never changes inventory.
      </p>
      <form className="mt-5 space-y-4" onSubmit={save} aria-busy={busy}>
        <fieldset disabled={busy || blocked} className="min-w-0 space-y-4">
          <InventoryItemPicker
            label="Stock item"
            value={draft.item}
            disabled={Boolean(selected?._id)}
            retainInactive
            recipeTypes
            onResolved={(value) => {
              setItem(value);
              if (value)
                setDraft((current) => ({
                  ...current,
                  enteredUnit: current.enteredUnit || value.unit,
                  enteredThreshold:
                    current.enteredThreshold === ""
                      ? (value.reorderLevel ?? 0)
                      : current.enteredThreshold,
                }));
            }}
            onChange={(id, value) => {
              setItem(value);
              edit({
                item: id,
                enteredThreshold: value.reorderLevel ?? 0,
                enteredUnit: value.unit,
              });
            }}
          />
          {item?.isActive === false && (
            <p className="text-xs text-amber-300">
              This item is inactive. Disable this rule; notifications cannot be
              enabled.
            </p>
          )}
          <Toggle
            label="Enable notifications for this item"
            checked={draft.enabled}
            onChange={(enabled) => edit({ enabled })}
          />
          <Toggle
            label="Low-stock alert"
            checked={draft.lowEnabled}
            onChange={(lowEnabled) => edit({ lowEnabled })}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3">
            <Field
              label="Low-stock threshold"
              hint="Alerts at or below this usable quantity."
            >
              <input
                required
                type="number"
                min="0"
                max="1000000000"
                step="any"
                className={inputClass}
                value={draft.enteredThreshold}
                onChange={(event) =>
                  edit({ enteredThreshold: event.target.value })
                }
              />
            </Field>
            <Field label="Unit">
              <DarkSelect
                aria-label="Threshold unit"
                required
                className={inputClass}
                value={draft.enteredUnit}
                onChange={(event) => edit({ enteredUnit: event.target.value })}
              >
                <option value="">Unit</option>
                {item &&
                  preparationUnits(item).map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
              </DarkSelect>
            </Field>
          </div>
          {item && (
            <p className="text-xs text-neutral-400">
              Purchasing reorder level: {q(item.reorderLevel ?? 0, item.unit)}.
              This rule has its own threshold.
            </p>
          )}
          <Toggle
            label="Out-of-stock alert (zero usable stock)"
            checked={draft.outEnabled}
            onChange={(outEnabled) => edit({ outEnabled })}
          />
          <Field label="Notification timing">
            <DarkSelect
              aria-label="Notification timing"
              className={inputClass}
              value={draft.mode}
              onChange={(event) => edit({ mode: event.target.value })}
            >
              <option value="repeat">Stock check + repeat reminder</option>
              <option value="daily">Daily scheduled check</option>
            </DarkSelect>
          </Field>
          {draft.mode === "repeat" ? (
            <Field label="Repeat while unresolved">
              <DarkSelect
                aria-label="Repeat interval"
                className={inputClass}
                value={draft.repeatMinutes}
                onChange={(event) =>
                  edit({ repeatMinutes: Number(event.target.value) })
                }
              >
                {intervals.map((value) => (
                  <option value={value} key={value}>
                    Every {value} minutes
                  </option>
                ))}
              </DarkSelect>
            </Field>
          ) : (
            <Field
              label="Daily check time (Asia/Riyadh)"
              hint="Alerts only at this scheduled check; no interval reminders."
            >
              <input
                required
                type="time"
                className={inputClass}
                value={draft.dailyTime}
                onChange={(event) => edit({ dailyTime: event.target.value })}
              />
            </Field>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-medium text-neutral-300">
              Notify selected staff
            </legend>
            {recipients.map((user) => (
              <label
                key={user._id}
                className="flex min-h-10 items-center gap-3 text-sm text-neutral-200"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-500"
                  checked={draft.recipients.includes(user._id)}
                  onChange={(event) =>
                    edit({
                      recipients: event.target.checked
                        ? [...draft.recipients, user._id]
                        : draft.recipients.filter((id) => id !== user._id),
                    })
                  }
                />
                <span>
                  {user.name}{" "}
                  <span className="text-xs capitalize text-neutral-400">
                    ({user.role})
                  </span>
                </span>
              </label>
            ))}
            {draft.enabled && !draft.recipients.length && (
              <p className="text-xs text-amber-300">
                Choose at least one recipient.
              </p>
            )}
          </fieldset>
        </fieldset>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-400/25 p-3 text-sm text-red-300"
          >
            {error} Your draft is retained.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              busy ||
              blocked ||
              !item ||
              (draft.enabled && !draft.recipients.length)
            }
          >
            {busy ? "Saving…" : "Save rule"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function DevicePush({ options, onChanged }) {
  const [supported, setSupported] = useState(false),
    [permission, setPermission] = useState("default"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setSupported(
      "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window &&
        window.isSecureContext,
    );
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);
  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted")
        throw Error(
          "Notifications were not allowed. In-app alerts still work.",
        );
      const registration = await navigator.serviceWorker.register("/sw.js");
      // ready waits for activation, including the first install.
      const ready = registration.active
        ? registration
        : await navigator.serviceWorker.ready;
      const key = options.publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(
        atob(key + "=".repeat((4 - (key.length % 4)) % 4)),
        (c) => c.charCodeAt(0),
      );
      const subscription =
        (await ready.pushManager.getSubscription()) ||
        (await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }));
      await subscribeStockPush(subscription.toJSON());
      await onChanged();
    } catch (error) {
      setError(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    setError("");
    try {
      await unsubscribeStockPush();
      const registration =
        "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistration()
          : null;
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
      await onChanged();
    } catch (error) {
      setError(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`${cardClass} mt-5 p-4`}>
      <h2 className="font-body font-semibold text-white">
        Notifications on this device
      </h2>
      <p className="mt-2 text-xs leading-5 text-neutral-400">
        The Inventory bell always uses your saved inbox. Background device
        alerts need permission and configured delivery.
      </p>
      <p className="mt-2 text-xs text-neutral-300">
        {!supported
          ? "This browser does not support background push here."
          : !options.configured
            ? "Background push has not been configured yet."
            : permission === "denied"
              ? "Browser notifications are blocked. The in-app bell still works."
              : options.subscribed
                ? "Background alerts enabled on this device."
                : "Background alerts are available but not enabled on this device."}
      </p>
      <div className="mt-3">
        <Button
          variant="secondary"
          disabled={
            busy || (!options.subscribed && (!supported || !options.configured))
          }
          onClick={options.subscribed ? disable : enable}
        >
          {busy
            ? "Updating…"
            : options.subscribed
              ? "Disable device alerts"
              : "Enable device alerts"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-amber-300">
          {error}
        </p>
      )}
    </section>
  );
}

export default function StockAlertsPage({
  initialTab = "current",
  initialItem = "",
}) {
  const router = useRouter(),
    root = useRef(null);
  const tab = initialTab === "rules" ? "rules" : "current";
  const [filters, setFilters] = useState({
    search: "",
    scope: "all",
    status: "all",
    page: 1,
  });
  const [selected, setSelected] = useState(undefined),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const options = useInventoryResource(fetchStockAlertOptions, []);
  const resource = useInventoryResource(
    () =>
      tab === "rules"
        ? fetchStockAlertRules({ ...filters, item: initialItem || undefined })
        : fetchCurrentStockAlerts({
            ...filters,
            item: initialItem || undefined,
          }),
    [tab, filters, initialItem],
  );
  const refreshResource = resource.reload;
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && selected === undefined)
        refreshResource({ silent: true }).catch(() => undefined);
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("dg-stock-alerts-updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("dg-stock-alerts-updated", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshResource, selected]);
  const guard = usePageFormChanges({
    open: selected !== undefined,
    rootRef: root,
    onClose: () => setSelected(undefined),
    resetKey: selected?._id || "new",
  });
  const editFilter = (values) =>
    setFilters((current) => ({ ...current, ...values, page: 1 }));
  const reload = () =>
    Promise.all([
      resource.reload({ silent: true }),
      options.reload({ silent: true }),
    ]);
  const navigate = (next, item = "") => {
    if (!guard.confirmDiscard()) return;
    setSelected(undefined);
    setFilters({ search: "", scope: "all", status: "all", page: 1 });
    router.push(
      `/inventory/low-stock-alerts?tab=${next}${item ? `&item=${encodeURIComponent(item)}` : ""}`,
      { scroll: false },
    );
  };
  const newRule = () => {
    if (!guard.confirmDiscard()) return;
    router.push("/inventory/low-stock-alerts?tab=rules", { scroll: false });
    setSelected(null);
  };
  const editRule = async (row) => {
    if (!guard.confirmDiscard() || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await fetchStockAlertRules({ item: row._id });
      router.push(`/inventory/low-stock-alerts?tab=rules&item=${row._id}`, {
        scroll: false,
      });
      setSelected(result.data[0] || { newItemId: row._id });
    } catch (error) {
      setError(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    setBusy(true);
    setError("");
    try {
      await checkStockAlerts();
      await reload();
      stockAlertUpdated();
      setNotice("Due rules checked. No inventory was changed.");
    } catch (error) {
      setError(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const data = resource.data,
    canManage = options.data?.canManage;
  return (
    <div ref={root} {...guard.capture} className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Low Stock Alerts"
        description="Watch the items that matter. Notifications use usable stock, including expiry and batch restrictions."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={busy || resource.refreshing}
              onClick={() => reload().catch(() => undefined)}
            >
              <RefreshCw size={16} />
              Refresh
            </Button>
            {canManage && (
              <Button onClick={newRule}>
                <Plus size={16} />
                Alert rule
              </Button>
            )}
          </>
        }
      />
      <div
        role="tablist"
        aria-label="Stock alert views"
        className="mb-5 flex gap-2 border-b border-white/10 pb-3"
      >
        {[
          ["current", "Current Alerts"],
          ["rules", "Alert Rules"],
        ].map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`stock-${key}-panel`}
            id={`stock-${key}-tab`}
            variant={tab === key ? "primary" : "secondary"}
            onClick={() => navigate(key)}
            onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                event.preventDefault();
                navigate(key === "current" ? "rules" : "current");
              }
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <InventoryLoadError
        error={options.error}
        onRetry={options.reload}
        label="alert settings"
        retained={Boolean(options.data)}
      />
      <ResourceStatus
        lastSuccessAt={resource.lastSuccessAt}
        refreshing={resource.refreshing}
        loading={resource.loading}
        error={resource.error}
        hasData={data !== null}
        onRetry={() => resource.reload({ silent: true })}
        showDetails
      />
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-sm text-emerald-300">
          {notice}
        </p>
      )}
      <div className={`${cardClass} mb-5 flex flex-wrap items-end gap-3 p-4`}>
        <Field label="Search items" className="min-w-44 flex-1">
          <input
            className={inputClass}
            value={filters.search}
            onChange={(event) => editFilter({ search: event.target.value })}
            placeholder="Item name or SKU"
          />
        </Field>
        {tab === "current" && (
          <>
            <Field label="Show">
              <DarkSelect
                aria-label="Alert scope"
                className={inputClass}
                value={filters.scope}
                onChange={(event) => editFilter({ scope: event.target.value })}
              >
                <option value="all">All low stock</option>
                <option value="watched">Watched items only</option>
              </DarkSelect>
            </Field>
            <Field label="Stock status">
              <DarkSelect
                aria-label="Stock status"
                className={inputClass}
                value={filters.status}
                onChange={(event) => editFilter({ status: event.target.value })}
              >
                <option value="all">All statuses</option>
                <option value="low">Low stock</option>
                <option value="out">Out of stock</option>
              </DarkSelect>
            </Field>
          </>
        )}
        {initialItem && (
          <Button variant="secondary" onClick={() => navigate(tab)}>
            Clear item filter
          </Button>
        )}
      </div>
      <section
        role="tabpanel"
        id={`stock-${tab}-panel`}
        aria-labelledby={`stock-${tab}-tab`}
      >
        {tab === "current" && (
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Low usable stock"
              value={data?.summary?.low ?? "—"}
              caption="Across the filtered results"
              icon={AlertTriangle}
              tone="amber"
            />
            <StatCard
              label="Out of usable stock"
              value={data?.summary?.out ?? "—"}
              caption="Zero usable quantity"
              icon={PackageX}
              tone="red"
            />
            <StatCard
              label="Watched shortages"
              value={data?.summary?.watched ?? "—"}
              caption="Items with an enabled alert rule"
              icon={BellRing}
              tone="blue"
            />
          </div>
        )}
        <div
          className={`grid items-start gap-5 ${tab === "rules" && selected !== undefined ? "xl:grid-cols-[minmax(0,1fr)_minmax(320px,460px)]" : ""}`}
        >
          <section className={`${cardClass} min-w-0 p-4 sm:p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-body text-lg font-semibold text-white">
                {tab === "rules" ? "Item alert rules" : "Current shortages"}
              </h2>
              <span className="text-xs text-neutral-400">
                {data?.pagination?.total ?? "—"} items
              </span>
            </div>
            {resource.loading ? (
              <LoadingState label="Loading stock alerts…" />
            ) : resource.error && !data ? null : !data?.data?.length ? (
              <EmptyState
                title={
                  tab === "rules"
                    ? "No matching alert rules"
                    : "No matching shortages"
                }
                description={
                  tab === "rules"
                    ? "Select an important item and choose who should be notified."
                    : "Only shortages matching these filters appear here. Unwatched items do not send reminders."
                }
              />
            ) : (
              <div className="space-y-3">
                {data.data.map((row) =>
                  tab === "rules" ? (
                    <article
                      key={row._id}
                      className="rounded-xl border border-white/10 bg-black/10 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="break-words font-body font-semibold text-white">
                            {row.item?.name || "Item unavailable"}
                          </h3>
                          <p className="mt-1 text-xs text-neutral-400">
                            {row.item?.sku} · Rule v{row.version}
                          </p>
                        </div>
                        <Badge tone={row.enabled ? "success" : "neutral"}>
                          {row.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm text-neutral-300">
                        {row.lowEnabled
                          ? `Low: ${q(row.enteredThreshold, row.enteredUnit)} or less`
                          : "Low alert off"}{" "}
                        ·{" "}
                        {row.outEnabled
                          ? "Zero-stock alert on"
                          : "Zero-stock alert off"}
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {row.mode === "daily"
                          ? `Daily at ${row.dailyTime} · Asia/Riyadh`
                          : `Repeat every ${row.repeatMinutes} min while unresolved`}
                        <br />
                        Notify:{" "}
                        {row.recipients.map((user) => user.name).join(", ")}
                      </p>
                      {(!row.item?.isActive ||
                        row.item?.unit !== row.baseUnit) && (
                        <p className="mt-2 text-xs text-amber-300">
                          Item inactive or base unit changed. Review this rule.
                        </p>
                      )}
                      {canManage && (
                        <Button
                          className="mt-3"
                          variant="secondary"
                          disabled={busy || Boolean(options.error)}
                          onClick={() => {
                            if (guard.confirmDiscard()) setSelected(row);
                          }}
                        >
                          Edit rule
                        </Button>
                      )}
                    </article>
                  ) : (
                    <article
                      key={row._id}
                      className="rounded-xl border border-white/10 bg-black/10 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="break-words font-body font-semibold text-white">
                            {row.name}
                          </h3>
                          <p className="mt-1 text-xs text-neutral-400">
                            {row.sku} · {row.category?.name || "Uncategorized"}
                          </p>
                        </div>
                        <Badge
                          tone={row.status === "out" ? "danger" : "warning"}
                        >
                          {row.status === "out" ? "Out of stock" : "Low stock"}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-neutral-400">
                            Usable stock
                          </p>
                          <p className="mt-1 text-lg font-semibold text-dune-amber">
                            {q(row.saleableStock, row.unit)}
                          </p>
                          <p className="text-xs text-neutral-400">
                            Physical: {q(row.physicalStock, row.unit)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-400">
                            Purchasing reorder level
                          </p>
                          <p>{q(row.reorderLevel, row.unit)}</p>
                          <p className="mt-1 text-xs text-neutral-400">
                            Rule:{" "}
                            {row.alertRule
                              ? q(row.alertRule.threshold, row.alertRule.unit)
                              : "Not set"}
                          </p>
                        </div>
                        <div>
                          <Badge tone={row.watched ? "info" : "neutral"}>
                            {row.watched
                              ? "Alerts enabled"
                              : "Notifications off"}
                          </Badge>
                          <p className="mt-1 text-xs text-neutral-400">
                            {row.snoozedUntil &&
                            new Date(row.snoozedUntil) > new Date()
                              ? `Snoozed until ${time(row.snoozedUntil)}`
                              : row.nextReminderAt && row.alertSeverity
                                ? `Next reminder: ${time(row.nextReminderAt)}`
                                : row.watched
                                  ? "Checked on the saved schedule"
                                  : "No item reminder will be sent"}
                          </p>
                        </div>
                      </div>
                      {row.blockedReasons?.length > 0 && (
                        <p className="mt-3 text-xs text-amber-300">
                          Unavailable stock:{" "}
                          {row.blockedReasons
                            .map((value) => value.replaceAll("_", " "))
                            .join(", ")}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-neutral-400">
                        Last notification to you: {time(row.lastNotificationAt)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canManage && (
                          <Link
                            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-200"
                            href={`/inventory/stock-items?item=${row._id}`}
                          >
                            View stock
                          </Link>
                        )}
                        {canManage && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => editRule(row)}
                          >
                            Manage rule
                          </Button>
                        )}
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
            <Pagination
              pagination={data?.pagination}
              onPageChange={(page) =>
                setFilters((current) => ({ ...current, page }))
              }
            />
          </section>
          {tab === "rules" &&
            selected !== undefined &&
            canManage &&
            options.data && (
              <RuleEditor
                key={`${selected?._id || selected?.newItemId || "new"}:${selected?.version || 0}`}
                selected={selected}
                options={options.data}
                blocked={
                  Boolean(options.error) ||
                  options.refreshing ||
                  resource.refreshing
                }
                onCancel={guard.requestClose}
                onSaved={() => {
                  setSelected(undefined);
                  setNotice(
                    "Alert rule saved. Stock and purchasing settings are unchanged.",
                  );
                  stockAlertUpdated();
                  reload().catch(() => undefined);
                }}
              />
            )}
        </div>
      </section>
      {options.data && (
        <section
          className={`${cardClass} mt-5 flex flex-wrap items-center justify-between gap-3 p-4`}
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-dune-amber" />
            <div>
              <h2 className="font-body text-sm font-semibold text-white">
                Automatic checks
              </h2>
              <p className="mt-1 text-xs text-neutral-400">
                {options.data.job?.lastCompletedAt
                  ? `Last worker check: ${time(options.data.job.lastCompletedAt)} · Asia/Riyadh`
                  : "No automatic worker check recorded yet."}
              </p>
              {!options.data.workerHealthy && (
                <p className="mt-1 text-xs text-amber-300">
                  Automatic checks are not currently confirmed running.
                  Reminders may be delayed.
                </p>
              )}
            </div>
          </div>
          {canManage && (
            <Button
              variant="secondary"
              disabled={busy || Boolean(options.error)}
              onClick={check}
            >
              {busy ? "Checking…" : "Check due rules now"}
            </Button>
          )}
        </section>
      )}
      {tab === "rules" && options.data && (
        <DevicePush
          options={options.data}
          onChanged={() => options.reload({ silent: true })}
        />
      )}
    </div>
  );
}
