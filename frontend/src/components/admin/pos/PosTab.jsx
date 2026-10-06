"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";
import {
  approvePosDiscount,
  cancelPosHeldSale,
  completePosSale,
  createPosHeldSale,
  searchPosCustomers,
  fetchMenuItems,
  fetchCombos,
  fetchPosHeldSale,
  fetchPosHeldSales,
  fetchPublicRestaurantSettings,
  updatePosHeldSale,
  fetchPosQuickMenu,
  updatePosQuickItem,
  repeatPosSale,
} from "@/src/api/api.js";
import PosProductGrid from "./PosProductGrid.jsx";
import PosRecentSales from "./PosRecentSales.jsx";
import PosReceiptDialog from "./PosReceiptDialog.jsx";
import PosSalePanel from "./PosSalePanel.jsx";
import PosCustomizationModal from "./PosCustomizationModal.jsx";
import PosHeldSalesDrawer from "./PosHeldSalesDrawer.jsx";
import PosManagerApprovalDialog from "./PosManagerApprovalDialog.jsx";
import { calculatePosBill } from "@/src/utils/posBill.js";
import { resolvePosShortcut } from "@/src/utils/posShortcuts.js";
import PosShortcutHelp from "./PosShortcutHelp.jsx";

const RECOVERY_KEY = "dg_pos_working_sale";
const emptyDiscount = () => ({ type: "fixed", value: "", reason: "" });
const lineRequest = (line) => ({
  productId: line.productId,
  productType: line.productType,
  quantity: line.quantity,
  customization: line.customization,
});

export default function PosTab({ user, terminal = "MAIN", locked = false, onSaleState, onLock, onSaleCompleted, onDisplayChange }) {
  const recoveryKey = `${RECOVERY_KEY}:${user?._id}:${terminal}`;
  const [quickMenu, setQuickMenu] = useState({ favourites: [], popular: [] });
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sale, setSale] = useState([]);
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState(emptyDiscount);
  const [orderType, setOrderType] = useState("dine-in");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [customerSearchStatus, setCustomerSearchStatus] = useState("idle");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [walkIn, setWalkIn] = useState({ name: "", phone: "", pickupNote: "" });
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [restaurantSettings, setRestaurantSettings] = useState(null);
  const [customizing, setCustomizing] = useState(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldSales, setHeldSales] = useState([]);
  const [heldLoading, setHeldLoading] = useState(false);
  const [managerPinOpen, setManagerPinOpen] = useState(false);
  const [managerPin, setManagerPin] = useState("");
  const [approval, setApproval] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const requestKey = useRef("");
  const draftRef = useRef({ id: "", revision: 0 });
  const pendingSave = useRef(Promise.resolve());
  const draftActionBusy = useRef(false);
  const bill = useMemo(
    () => calculatePosBill(sale, discount),
    [sale, discount],
  );
  const itemCount = sale.reduce((sum, line) => sum + line.quantity, 0);
  useEffect(() => { onSaleState?.(sale.length > 0 || submitting); }, [sale.length, submitting, onSaleState]);
  useEffect(() => { if (!locked) fetchPosQuickMenu().then(setQuickMenu).catch(() => undefined); }, [locked]);
  const policy = restaurantSettings?.posCheckout || {};
  const discountAmount = bill.discount;
  const approvalRequired =
    discountAmount > 0 &&
    !["manager", "admin"].includes(user?.role) &&
    ((discount.type === "percentage" &&
      Number(discount.value || 0) >
        Number(policy.cashierMaxPercentage ?? 10)) ||
      discountAmount > Number(policy.cashierMaxAmount ?? 50) ||
      (Number(policy.managerApprovalThreshold) > 0 &&
        discountAmount >= Number(policy.managerApprovalThreshold)));

  useEffect(() => {
    onDisplayChange?.({
      ...bill,
      orderType,
      pickupName:
        orderType === "takeaway" ? selectedCustomer?.name || walkIn.name : "",
      status: submitting ? "processing" : "awaiting-payment",
    });
  }, [
    bill,
    orderType,
    selectedCustomer,
    walkIn.name,
    submitting,
    onDisplayChange,
  ]);
  const loadHeld = useCallback(async () => {
    setHeldLoading(true);
    try {
      setHeldSales(await fetchPosHeldSales({ terminal }));
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to load held sales.",
      );
    } finally {
      setHeldLoading(false);
    }
  }, [terminal]);
  useEffect(() => {
    Promise.all([fetchMenuItems(), fetchCombos()])
      .then(([menuItems, combos]) =>
        setCatalog([
          ...menuItems.map((item) => ({
            ...item,
            productType: "menuItem",
            price: Number(item.price),
          })),
          ...combos.map((combo) => ({
            ...combo,
            productType: "combo",
            price: Number(combo.comboPrice),
            isAvailable: combo.isAvailable !== false,
          })),
        ]),
      )
      .catch(() => toast.error("Unable to load the POS catalog."))
      .finally(() => setCatalogLoading(false));
  }, []);
  useEffect(() => {
    let active = true;
    const loadSettings = () =>
      fetchPublicRestaurantSettings()
        .then((settings) => active && setRestaurantSettings(settings))
        .catch(() => undefined);
    loadSettings();
    window.addEventListener("focus", loadSettings);
    return () => {
      active = false;
      window.removeEventListener("focus", loadSettings);
    };
  }, []);
  useEffect(() => {
    const query = customerSearch.trim();
    if (query.length < 2 || selectedCustomer) {
      setCustomerResults([]);
      setCustomerSearchStatus("idle");
      return undefined;
    }
    let active = true;
    setCustomerResults([]);
    setCustomerSearchStatus("loading");
    const timeout = setTimeout(
      () =>
        searchPosCustomers(query)
          .then((rows) => { if (active) { setCustomerResults(rows); setCustomerSearchStatus(rows.length ? "success" : "empty"); } })
          .catch(() => { if (active) { setCustomerResults([]); setCustomerSearchStatus("error"); } }),
      250,
    );
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [customerSearch, selectedCustomer]);

  const restore = useCallback((draft) => {
    setSale(
      (draft.items || []).map((line) => ({
        ...line,
        productId: String(line.productId),
        cartLineId: `${line.productType}:${line.productId}:${line.customization?.key || ""}`,
        customizationKey: line.customization?.key || "",
      })),
    );
    setNotes(draft.orderNote || "");
    setDiscount({
      type: draft.discount?.type || "fixed",
      value: String(draft.discount?.value || ""),
      reason: draft.discount?.reason || "",
    });
    setOrderType(draft.orderType || "dine-in");
    setPaymentMethod(draft.paymentMethod || "cash");
    setCashReceived(draft.cashReceived ? String(draft.cashReceived) : "");
    setSelectedCustomer(
      draft.customerId
        ? typeof draft.customerId === "object"
          ? draft.customerId
          : {
              _id: draft.customerId,
              name: draft.customer?.name || "Registered customer",
              phone: draft.customer?.phone || "",
            }
        : null,
    );
    setWalkIn(draft.customer || { name: "", phone: "", pickupNote: "" });
    draftRef.current = { id: draft._id, revision: draft.revision };
    try {
      localStorage.setItem(recoveryKey, draft._id);
    } catch {
      /* reference is optional */
    }
    setApproval(null);
    requestKey.current = "";
  }, [recoveryKey]);
  useEffect(() => {
    if (locked || recovered) return;
    let id = "";
    try {
      id = localStorage.getItem(recoveryKey) || localStorage.getItem(RECOVERY_KEY) || "";
    } catch {
      /* ignore */
    }
    if (!id) {
      setRecovered(true);
      return;
    }
    fetchPosHeldSale(id)
      .then((draft) => {
        if (draft.terminal !== terminal) { toast.warning(`An unfinished sale belongs to terminal ${draft.terminal}. Select that terminal to recover it.`); setRecovered(true); return; }
        restore(draft);
        localStorage.removeItem(RECOVERY_KEY);
        setRecovered(true); setRecoveryError("");
        toast.info("Your unfinished sale was recovered.");
      })
      .catch(error => {
        if ([404, 410].includes(error.response?.status)) {
          try { localStorage.removeItem(recoveryKey); } catch { /* optional storage */ }
          setRecovered(true);
        } else {
          setRecoveryError("Your unfinished sale is safe. Reconnect/unlock, then retry recovery before starting a sale.");
        }
      });
  }, [restore, recoveryKey, terminal, locked, recovered, recoveryAttempt]);

  const draftPayload = useCallback(
    (extra = {}) => ({
      items: sale.map(lineRequest),
      orderNote: notes,
      discount,
      customerId: selectedCustomer?._id || null,
      customer: walkIn,
      orderType,
      paymentMethod,
      cashReceived: Number(cashReceived) || 0,
      terminal,
      ...extra,
    }),
    [
      sale,
      notes,
      discount,
      selectedCustomer,
      walkIn,
      orderType,
      paymentMethod,
      cashReceived,
      terminal,
    ],
  );
  useEffect(() => {
    if (!recovered || !sale.length || submitting || locked) return undefined;
    const timer = setTimeout(() => {
      if (draftActionBusy.current) return;
      pendingSave.current = pendingSave.current.then(async () => {
        try {
          const current = draftRef.current;
          const saved = current.id
            ? await updatePosHeldSale(current.id, {
                ...draftPayload(),
                revision: current.revision,
              })
            : await createPosHeldSale(draftPayload());
          draftRef.current = { id: saved._id, revision: saved.revision };
          try { localStorage.setItem(recoveryKey, saved._id); } catch { /* reference only */ }
        } catch (error) {
          if (error.response?.status === 409)
            toast.error("This sale changed elsewhere. Resume the latest held copy before editing.");
        }
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [
    recovered,
    sale,
    notes,
    discount,
    selectedCustomer,
    walkIn,
    orderType,
    paymentMethod,
    cashReceived,
    submitting,
    draftPayload,
    locked,
    recoveryKey,
  ]);

  useEffect(() => {
    setApproval(null);
  }, [sale, discount.type, discount.value, discount.reason]);
  const categories = useMemo(
    () => [
      "All",
      "Favourites",
      "Popular",
      ...new Set(
        catalog
          .map((item) =>
            item.productType === "combo" ? "Combos" : item.category,
          )
          .filter(Boolean),
      ),
    ],
    [catalog],
  );
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const quick = category === "Favourites" ? quickMenu.favourites : quickMenu.popular;
    const rows = catalog.filter(
      (product) =>
        (category === "All" ||
          (["Favourites", "Popular"].includes(category) && quick.some(row => String(row.productId) === String(product._id) && row.productType === product.productType)) ||
          (product.productType === "combo" ? "Combos" : product.category) ===
            category) &&
        (!query ||
          product.name.toLowerCase().includes(query) ||
          product.category?.toLowerCase().includes(query)),
    );
    return ["Favourites", "Popular"].includes(category) ? rows.sort((a, b) => quick.findIndex(row => String(row.productId) === String(a._id)) - quick.findIndex(row => String(row.productId) === String(b._id))) : rows;
  }, [catalog, category, search, quickMenu]);
  const addConfigured = (product) =>
    setSale((current) => {
      const index = current.findIndex(
        (line) => line.cartLineId === product.cartLineId,
      );
      const line = {
        productId: product._id,
        productType: product.productType,
        name: product.name,
        image: product.image,
        price: product.price,
        quantity: product.quantity || 1,
        customization: product.customization || {
          selectedAddOns: [],
          spiceLevel: "",
          note: "",
        },
        customizationKey: product.customizationKey || "",
        cartLineId:
          product.cartLineId || `${product.productType}:${product._id}:`,
      };
      if (index < 0) return [...current, line];
      return current.map((entry, lineIndex) =>
        lineIndex === index
          ? { ...entry, quantity: Math.min(99, entry.quantity + line.quantity) }
          : entry,
      );
    });
  const addProduct = (product) => {
    if (product.isAvailable === false) return;
    const customizable =
      product.productType === "menuItem" &&
      product.customization?.enabled;
    if (customizable) setCustomizing(product);
    else
      addConfigured({
        ...product,
        quantity: 1,
        cartLineId: `${product.productType}:${product._id}:`,
      });
  };
  const changeQuantity = (target, amount) =>
    setSale((current) =>
      current
        .map((line) =>
          line.cartLineId === target.cartLineId
            ? { ...line, quantity: line.quantity + amount }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  const remove = (target) =>
    setSale((current) =>
      current.filter((line) => line.cartLineId !== target.cartLineId),
    );
  const resetSale = () => {
    setSale([]);
    setNotes("");
    setDiscount(emptyDiscount());
    setCashReceived("");
    setSelectedCustomer(null);
    setCustomerSearch("");
    setWalkIn({ name: "", phone: "", pickupNote: "" });
    setOrderType("dine-in");
    setPaymentMethod("cash");
    setApproval(null);
    requestKey.current = "";
    draftRef.current = { id: "", revision: 0 };
    try {
      localStorage.removeItem(recoveryKey);
    } catch {
      /* ignore */
    }
  };
  const clearSale = async () => {
    if (draftActionBusy.current) return;
    if (
      !sale.length ||
      !window.confirm("Clear every item from the current sale?")
    )
      return;
    draftActionBusy.current = true; setSubmitting(true);
    try {
      await pendingSave.current;
      const current = draftRef.current;
      if (current.id) await cancelPosHeldSale(current.id, "Current sale cleared");
      resetSale();
    } catch (error) { toast.error(error.response?.data?.message || "Unable to safely clear sale. Reconnect and retry."); }
    finally { draftActionBusy.current = false; setSubmitting(false); }
  };
  const holdSale = async () => {
    if (!sale.length || draftActionBusy.current) return;
    const label =
      window.prompt(
        "Optional label or customer name for this held sale:",
        walkIn.name || selectedCustomer?.name || "",
      ) ?? "";
    draftActionBusy.current = true; setSubmitting(true);
    try {
      await pendingSave.current;
      const current = draftRef.current;
      if (current.id)
        await updatePosHeldSale(current.id, {
          ...draftPayload({ hold: true, label }),
          revision: current.revision,
        });
      else await createPosHeldSale(draftPayload({ hold: true, label }));
      toast.success("Sale held safely.");
      resetSale();
      setHeldOpen(true);
      await loadHeld();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to hold this sale.");
    } finally { draftActionBusy.current = false; setSubmitting(false); }
  };
  const resumeSale = async (row) => {
    try {
      const latest = await fetchPosHeldSale(row._id);
      const resumed = await updatePosHeldSale(row._id, {
        items: latest.items.map(lineRequest),
        orderNote: latest.orderNote,
        discount: latest.discount,
        customerId: latest.customerId?._id || latest.customerId,
        customer: latest.customer,
        orderType: latest.orderType,
        paymentMethod: latest.paymentMethod,
        cashReceived: latest.cashReceived,
        terminal,
        revision: latest.revision,
        resume: true,
      });
      restore(resumed);
      setHeldOpen(false);
      toast.success("Held sale resumed.");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to resume this sale.",
      );
      await loadHeld();
    }
  };
  const cancelHeld = async (row) => {
    if (!window.confirm(`Cancel held sale “${row.label || "Untitled"}”?`))
      return;
    try {
      await cancelPosHeldSale(row._id, "Cancelled from held sales list");
      await loadHeld();
      toast.success("Held sale cancelled.");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to cancel held sale.",
      );
    }
  };

  const requestApproval = async () => {
    setApprovalLoading(true);
    try {
      const result = await approvePosDiscount({
        items: sale.map(lineRequest),
        discount,
        managerPin,
      });
      setApproval(result);
      setManagerPin("");
      setManagerPinOpen(false);
      toast.success(`Discount approved by ${result.approver.name}.`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Manager approval failed.");
    } finally {
      setApprovalLoading(false);
    }
  };
  const complete = async () => {
    if (draftActionBusy.current) return;
    if (discountAmount > 0 && !discount.reason.trim()) {
      toast.error("Enter a discount reason.");
      return;
    }
    if (approvalRequired && !approval?.token) {
      setManagerPinOpen(true);
      return;
    }
    draftActionBusy.current = true; setSubmitting(true);
    try {
      await pendingSave.current;
      if (!requestKey.current) requestKey.current = window.crypto.randomUUID();
      let current = draftRef.current;
      if (current.id) {
        const saved = await updatePosHeldSale(current.id, {
          ...draftPayload(),
          revision: current.revision,
        });
        current = { id: saved._id, revision: saved.revision };
        draftRef.current = current;
      }
      const response = await completePosSale({
        idempotencyKey: requestKey.current,
        items: sale.map(lineRequest),
        orderType,
        paymentMethod,
        cashReceived:
          paymentMethod === "cash" ? Number(cashReceived) : undefined,
        discount,
        discountApprovalToken: approval?.token,
        notes,
        customerId: selectedCustomer?._id,
        customer: selectedCustomer ? { pickupNote: walkIn.pickupNote } : walkIn,
        heldSaleId: current.id || undefined,
        heldSaleRevision: current.id ? current.revision : undefined,
        terminal,
      });
      setReceipt(response.data);
      if (response.warning) toast.warning(response.warning);
      else toast.success(`Sale #${response.data.orderNumber} completed.`);
      resetSale();
      setHistoryRevision(value => value + 1);
      onSaleCompleted?.();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Unable to complete sale.",
      );
    } finally {
      draftActionBusy.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const handler = event => {
      if (locked) return;
      const action = resolvePosShortcut(event, { textInput: Boolean(event.target?.closest?.("input, textarea, select, [contenteditable='true']")), modalOpen: Boolean(customizing || heldOpen || managerPinOpen || receipt || helpOpen || document.querySelector("[role='dialog']")) });
      if (!action) return; event.preventDefault();
      if (action === "search") document.getElementById("pos-product-search")?.focus();
      if (action === "hold") holdSale();
      if (action === "held") { setHeldOpen(true); loadHeld(); }
      if (action === "cash") setPaymentMethod("cash");
      if (action === "card") setPaymentMethod("card");
      if (action === "lock") onLock?.();
      if (action === "help") setHelpOpen(true);
      if (action === "complete" && sale.length && !submitting && window.confirm(`Complete sale for SAR ${bill.total.toFixed(2)}?`)) complete();
    };
    document.addEventListener("keydown", handler); return () => document.removeEventListener("keydown", handler);
  });
  const repeat = async row => {
    if (sale.length) return toast.warning("Hold or clear the current sale before repeating another sale.");
    try {
      const result = await repeatPosSale(row._id);
      resetSale();
      setSale(result.data.map(line => ({ ...line, cartLineId: `${line.productType}:${line.productId}:${line.customization?.key || ""}`, customizationKey: line.customization?.key || "" })));
      result.warnings.forEach(warning => toast.warning(warning));
      if (result.data.length) toast.success("Items added using current catalog prices.");
    } catch (error) { toast.error(error.response?.data?.message || "Unable to repeat sale."); }
  };

  return (
    <div>
      {recoveryError && <p role="alert" className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-300">{recoveryError}<button type="button" onClick={() => { setRecoveryError(""); setRecoveryAttempt(value => value + 1); }} className="ml-3 underline">Retry recovery</button></p>}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setHelpOpen(true)} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-neutral-400">Shortcuts · F1</button>
        <button
          type="button"
          onClick={() => {
            setHeldOpen(true);
            loadHeld();
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-neutral-300 hover:border-dune-amber/40 hover:text-dune-amber"
        >
          <Clock3 className="h-4 w-4" />
          Held Sales
        </button>
        <p className="rounded-xl bg-dune-amber/10 px-4 py-2 text-sm font-semibold text-dune-amber">
          {itemCount} item{itemCount === 1 ? "" : "s"} · {bill.total.toFixed(2)}{" "}
          SAR
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_410px]">
        <PosProductGrid
          products={filteredProducts}
          categories={categories}
          search={search}
          onSearchChange={setSearch}
          category={category}
          onCategoryChange={setCategory}
          onAdd={addProduct}
          loading={catalogLoading || !recovered}
          quickMenu={quickMenu}
          canManageQuickMenu={["admin", "manager"].includes(user?.role)}
          onQuickChange={async (product, position, remove = false) => { try { await updatePosQuickItem({ productId: product._id, productType: product.productType, position, remove }); setQuickMenu(await fetchPosQuickMenu()); } catch (error) { toast.error(error.response?.data?.message || "Unable to update favourites."); } }}
        />
        <PosSalePanel
          bill={bill}
          sale={sale}
          itemCount={itemCount}
          onQuantity={changeQuantity}
          onRemove={remove}
          onClear={clearSale}
          onHold={holdSale}
          notes={notes}
          onNotesChange={setNotes}
          discount={discount}
          onDiscountChange={setDiscount}
          approvalRequired={approvalRequired}
          approval={approval}
          onRequestApproval={() => setManagerPinOpen(true)}
          policy={policy}
          orderType={orderType}
          onOrderTypeChange={setOrderType}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          cashReceived={cashReceived}
          onCashReceivedChange={setCashReceived}
          customerSearch={customerSearch}
          onCustomerSearchChange={setCustomerSearch}
          customerResults={customerResults}
          customerSearchStatus={customerSearchStatus}
          selectedCustomer={selectedCustomer}
          onSelectCustomer={(customer) => {
            setSelectedCustomer(customer);
            setCustomerResults([]);
            setCustomerSearch("");
            setWalkIn((value) => ({
              ...value,
              name: customer.name || "",
              phone: customer.phone || "",
            }));
          }}
          onClearCustomer={() => setSelectedCustomer(null)}
          walkIn={walkIn}
          onWalkInChange={setWalkIn}
          onComplete={complete}
          submitting={submitting}
          channelEnabled={restaurantSettings?.orders?.channels?.pos !== false}
        />
      </div>
      <PosRecentSales
        user={user}
        terminal={terminal}
        revision={historyRevision}
        locked={locked}
        onRepeat={repeat}
        onReceipt={setReceipt}
      />
      <PosReceiptDialog
        sale={receipt}
        onClose={() => setReceipt(null)}
        settings={restaurantSettings}
      />
      {customizing && (
        <PosCustomizationModal
          product={customizing}
          onClose={() => setCustomizing(null)}
          onAdd={(line) => {
            addConfigured(line);
            setCustomizing(null);
          }}
        />
      )}
      <PosHeldSalesDrawer open={heldOpen} loading={heldLoading} sales={heldSales} onClose={() => setHeldOpen(false)} onResume={resumeSale} onCancel={cancelHeld} />
      <PosManagerApprovalDialog open={managerPinOpen} pin={managerPin} onPinChange={setManagerPin} loading={approvalLoading} onClose={() => setManagerPinOpen(false)} onSubmit={requestApproval} />
      {helpOpen && <PosShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
