"use client";
import { withLocale } from "../i18n/LocaleProvider.jsx";
import { t, catalogText } from "../i18n/core.js";



import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ItemModal from "./ItemModal.jsx";
import SmartImage from "./SmartImage.jsx";
import { formatPrice } from "../utils/currency.js";
import { sharedContentPath, publicContentAvailable } from "../utils/publicSharedContent.js";

// A public browser fallback for the same paths handled by the native app.
// Only public catalog reads occur on mount; no order/cart/auth write is automatic.
function PublicSharedContent({ kind, id }) {
  const router = useRouter();const [state, setState] = useState({ loading: true, data: null, error: "" });const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const controller = new AbortController();const path = sharedContentPath(kind, id);
    if (!path) {setState({ loading: false, data: null, error: "This shared link is invalid." });return () => controller.abort();}
    setState({ loading: true, data: null, error: "" });
    fetch(path, { credentials: "omit", cache: "no-store", signal: controller.signal }).
    then(async (response) => {if (!response.ok) throw new Error(response.status === 404 || response.status === 400 ? "This item or offer is unavailable." : "Unable to load this content. Please retry.");return response.json();}).
    then((result) => {if (!controller.signal.aborted) {setNow(Date.now());setState({ loading: false, data: result.data, error: "" });}}).
    catch((error) => {if (!controller.signal.aborted) setState({ loading: false, data: null, error: error.message === "This item or offer is unavailable." ? error.message : "Unable to load this content. Please retry." });});
    return () => controller.abort();
  }, [kind, id, retry]);
  const data = state.data;const available = publicContentAvailable(kind, data, now);
  const product = useMemo(() => data && ({ ...data, productType: kind === "combo" ? "combo" : "menuItem", price: kind === "combo" ? data.comboPrice : data.price }), [data, kind]);
  useEffect(() => {
    if (kind !== 'offer' || !data || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= now) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, Math.min(30000, Date.parse(data.expiresAt) - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [kind, data, now]);
  if (available && kind !== "offer") return <ItemModal item={product} onClose={() => router.push("/menu")} />;
  return <main className="min-h-screen bg-[#101010] px-5 py-16 text-white"><section className="mx-auto max-w-xl space-y-5 rounded-2xl border border-white/15 bg-[#202020] p-6">
    <Link href="/" className="font-bold text-dune-amber">{t("Dune & Grills")}</Link>
    {t(state.loading ? <p role="status">{t("Loading current content…")}</p> : !available ? <><h1 className="text-3xl font-bold">{t("Content unavailable")}</h1><p>{t(state.error || "This item or offer is no longer available. Explore the current menu.")}</p><button type="button" onClick={() => setRetry((n) => n + 1)} className="min-h-12 rounded-lg border border-dune-amber px-5 text-dune-amber">{t("Retry")}</button></> : <>
      <SmartImage src={data.image} alt={t(data.title)} width={900} height={500} className="w-full rounded-xl" />
      <h1 className="text-3xl font-bold">{t(data.title)}</h1><p>{t(data.subtitle || data.description)}</p>
      {data.promoCode && <p>{t("Coupon: ")}<strong className="text-dune-amber">{t(data.promoCode)}</strong></p>}
      {data.orderProduct?.product && sharedContentPath(data.orderProduct.productType === "combo" ? "combo" : "item", data.orderProduct.product._id) && <Link href={`/${data.orderProduct.productType === "combo" ? "combo" : "item"}/${encodeURIComponent(data.orderProduct.product._id)}`} className="block text-dune-amber">{t("View ")}{catalogText(data.orderProduct.product, "name")}{t(" · ")}{formatPrice(data.orderProduct.product.comboPrice ?? data.orderProduct.product.price)}</Link>}
      <p className="text-sm text-neutral-400">{t("Discount eligibility and current prices are confirmed at checkout.")}</p>
    </>)}
    <Link href="/menu" className="block min-h-12 rounded-lg bg-dune-amber px-5 py-3 text-center font-bold text-black">{t("Explore menu")}</Link>
  </section></main>;
}

export default withLocale(PublicSharedContent);
