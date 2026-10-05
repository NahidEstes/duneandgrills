"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";
import {
  approvePosDiscount,
  cancelPosHeldSale,
  completePosSale,
  createPosHeldSale,
  fetchAdminUsers,
  fetchAllMenuItems,
  fetchCombos,
  fetchPosHeldSale,
  fetchPosHeldSales,
  fetchPosSales,
  fetchPublicRestaurantSettings,
  updatePosHeldSale,
} from "@/src/api/api.js";
import PosProductGrid from "./PosProductGrid.jsx";
import PosRecentSales from "./PosRecentSales.jsx";
import PosReceiptDialog from "./PosReceiptDialog.jsx";
import PosSalePanel from "./PosSalePanel.jsx";
import PosCustomizationModal from "./PosCustomizationModal.jsx";
import PosHeldSalesDrawer from "./PosHeldSalesDrawer.jsx";
import PosManagerApprovalDialog from "./PosManagerApprovalDialog.jsx";
import { calculatePosBill } from "@/src/utils/posBill.js";

const RECOVERY_KEY = "dg_pos_working_sale";
const emptyDiscount = () => ({ type: "fixed", value: "", reason: "" });
const lineRequest = (line) => ({
  productId: line.productId,
  productType: line.productType,
  quantity: line.quantity,
  customization: line.customization,
});

export default function PosTab({ user, onSaleCompleted, onDisplayChange }) {
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
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [walkIn, setWalkIn] = useState({ name: "", phone: "", pickupNote: "" });
  const [submitting, setSubmitting] = useState(false);
  const [recentSales, setRecentSales] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
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
  const requestKey = useRef("");
  const draftRef = useRef({ id: "", revision: 0 });
  const bill = useMemo(
    () => calculatePosBill(sale, discount),
    [sale, discount],
  );
  const itemCount = sale.reduce((sum, line) => sum + line.quantity, 0);
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
  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      setRecentSales(await fetchPosSales({ limit: 10 }));
    } catch {
      toast.error("Unable to load recent POS sales.");
    } finally {
      setRecentLoading(false);
    }
  }, []);
  const loadHeld = useCallback(async () => {
    setHeldLoading(true);
    try {
      setHeldSales(await fetchPosHeldSales());
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to load held sales.",
      );
    } finally {
      setHeldLoading(false);
    }
  }, []);
  useEffect(() => {
    Promise.all([fetchAllMenuItems(), fetchCombos()])
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
    loadRecent();
  }, [loadRecent]);
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
      return undefined;
    }
    let active = true;
    const timeout = setTimeout(
      () =>
        fetchAdminUsers("customers", query)
          .then((rows) => active && setCustomerResults(rows.slice(0, 8)))
          .catch(() => active && setCustomerResults([])),
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
      localStorage.setItem(RECOVERY_KEY, draft._id);
    } catch {
      /* reference is optional */
    }
    setApproval(null);
    requestKey.current = "";
  }, []);
  useEffect(() => {
    let id = "";
    try {
      id = localStorage.getItem(RECOVERY_KEY) || "";
    } catch {
      /* ignore */
    }
    if (!id) {
      setRecovered(true);
      return;
    }
    fetchPosHeldSale(id)
      .then((draft) => {
        restore(draft);
        toast.info("Your unfinished sale was recovered.");
      })
      .catch(() => {
        try {
          localStorage.removeItem(RECOVERY_KEY);
        } catch {
          /* ignore */
        }
      })
      .finally(() => setRecovered(true));
  }, [restore]);

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
      terminal: "MAIN",
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
    ],
  );
  useEffect(() => {
    if (!recovered || !sale.length || submitting) return undefined;
    const timer = setTimeout(async () => {
      try {
        const current = draftRef.current;
        const saved = current.id
          ? await updatePosHeldSale(current.id, {
              ...draftPayload(),
              revision: current.revision,
            })
          : await createPosHeldSale(draftPayload());
        draftRef.current = { id: saved._id, revision: saved.revision };
        try {
          localStorage.setItem(RECOVERY_KEY, saved._id);
        } catch {
          /* reference only */
        }
      } catch (error) {
        if (error.response?.status === 409)
          toast.error(
            "This sale changed elsewhere. Resume the latest held copy before editing.",
          );
      }
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
  ]);

  useEffect(() => {
    setApproval(null);
  }, [sale, discount.type, discount.value, discount.reason]);
  const categories = useMemo(
    () => [
      "All",
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
    return catalog.filter(
      (product) =>
        (category === "All" ||
          (product.productType === "combo" ? "Combos" : product.category) ===
            category) &&
        (!query ||
          product.name.toLowerCase().includes(query) ||
          product.category?.toLowerCase().includes(query)),
    );
  }, [catalog, category, search]);
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
      localStorage.removeItem(RECOVERY_KEY);
    } catch {
      /* ignore */
    }
  };
  const clearSale = async () => {
    if (
      !sale.length ||
      !window.confirm("Clear every item from the current sale?")
    )
      return;
    const current = draftRef.current;
    if (current.id)
      await cancelPosHeldSale(current.id, "Current sale cleared").catch(
        () => undefined,
      );
    resetSale();
  };
  const holdSale = async () => {
    if (!sale.length) return;
    const label =
      window.prompt(
        "Optional label or customer name for this held sale:",
        walkIn.name || selectedCustomer?.name || "",
      ) ?? "";
    try {
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
    }
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
    if (discountAmount > 0 && !discount.reason.trim()) {
      toast.error("Enter a discount reason.");
      return;
    }
    if (approvalRequired && !approval?.token) {
      setManagerPinOpen(true);
      return;
    }
    setSubmitting(true);
    try {
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
        terminal: "MAIN",
      });
      setReceipt(response.data);
      if (response.warning) toast.warning(response.warning);
      else toast.success(`Sale #${response.data.orderNumber} completed.`);
      resetSale();
      await loadRecent();
      onSaleCompleted?.();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Unable to complete sale.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
          loading={catalogLoading}
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
        sales={recentSales}
        loading={recentLoading}
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
    </div>
  );
}
