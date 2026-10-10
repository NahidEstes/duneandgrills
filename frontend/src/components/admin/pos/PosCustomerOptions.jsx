"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createPosCustomer, fetchPosCustomerRewards, previewPosCoupon } from "../../../api/api.js";
import { rewardEligible } from "../../../utils/rewardEligibility.js";

export default function PosCustomerOptions({ selectedCustomer, onSelectCustomer, options, onChange, items, onCouponPreview }) {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  useEffect(() => {
    let active = true; setAccount(null); setError("");
    if (selectedCustomer?._id) fetchPosCustomerRewards(selectedCustomer._id).then(value => active && setAccount(value)).catch(() => active && setError("Customer rewards unavailable; retry customer selection."));
    return () => { active = false; };
  }, [selectedCustomer?._id]);
  const inputClass = "min-h-11 w-full rounded-lg border border-white/10 bg-[#111517] px-3 text-sm text-white";
  return <div className="my-3 w-full space-y-2 text-xs text-neutral-400">
    <select aria-label="Order origin" value={options.orderOrigin} onChange={event => onChange({ ...options, orderOrigin: event.target.value })} className={inputClass}><option value="counter">Counter order</option><option value="phone">Phone order</option></select>
    <input aria-label="POS payment reference" value={options.paymentReference || ""} maxLength={160} placeholder="Card terminal / manual payment reference" onChange={event => onChange({ ...options, paymentReference: event.target.value })} className={inputClass} />
    {!selectedCustomer && <button type="button" className="min-h-11 text-dune-amber underline" onClick={() => setCreating(value => !value)}>Create customer account</button>}
    {creating && !selectedCustomer && <div className="space-y-2 rounded-xl border border-white/10 p-3">
      <p>Use the customer’s own email and chosen password. This account also works online.</p>
      {Object.keys(form).map(key => <input key={key} aria-label={`New customer ${key}`} type={key === "password" ? "password" : key === "email" ? "email" : key === "phone" ? "tel" : "text"} autoComplete="off" value={form[key]} placeholder={key} maxLength={key === "password" ? 128 : 160} onChange={event => setForm({ ...form, [key]: event.target.value })} className={inputClass} />)}
      <button type="button" disabled={busy} className="min-h-11 text-dune-amber" onClick={async () => { setBusy(true); try { onSelectCustomer(await createPosCustomer(form)); setForm({ name: "", phone: "", email: "", password: "" }); setCreating(false); } catch (requestError) { toast.error(requestError.response?.data?.message || "Customer creation failed"); } finally { setBusy(false); } }}>Save customer</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    {account && <><p>{account.pointsBalance} points · {account.membership?.tier || "Bronze"} · Earn after completion</p><select aria-label="Redeem customer reward" value={options.rewardId} className={inputClass} onChange={event => onChange({ ...options, rewardId: event.target.value })}><option value="">No reward</option>{account.rewards.map(reward => <option key={reward._id} value={reward._id} disabled={reward.pointsRequired > account.pointsBalance || !rewardEligible(reward, account)}>{reward.title} · {reward.pointsRequired} points · {reward.minimumTier || "Bronze"}</option>)}</select>{options.rewardId && <p>A free reward item will be added on checkout. Points and stock are reserved together.</p>}</>}
    <input aria-label="POS coupon" maxLength={40} value={options.couponCode} placeholder="Coupon code (cannot stack with discount)" className={inputClass} onChange={event => onChange({ ...options, couponCode: event.target.value.toUpperCase() })} />
    <button type="button" disabled={busy || !options.couponCode} className="min-h-11 text-dune-amber" onClick={async () => { setBusy(true); try { onCouponPreview(await previewPosCoupon({ code: options.couponCode, items, customerId: selectedCustomer?._id })); toast.success("Coupon validated for this cart"); } catch (requestError) { onCouponPreview(null); toast.error(requestError.response?.data?.message || "Coupon unavailable"); } finally { setBusy(false); } }}>Validate coupon</button>
  </div>;
}
