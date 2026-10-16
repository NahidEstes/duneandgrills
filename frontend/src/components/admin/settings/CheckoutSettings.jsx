"use client";

const fields = {
  points: [['pointsPerSAR', 'Points per SAR of discount'], ['minimumPoints', 'Minimum redemption points'], ['maximumDiscountSAR', 'Maximum discount (SAR)']],
  delivery: [['latitude', 'Restaurant latitude'], ['longitude', 'Restaurant longitude'], ['radiusKm', 'Delivery radius (km)'], ['feeSAR', 'Delivery fee (SAR)']],
  scheduling: [['slotMinutes', 'Slot interval (minutes)'], ['capacity', 'Orders per slot and fulfillment type'], ['cutoffMinutes', 'Booking lead time (minutes)'], ['horizonDays', 'Booking horizon (days, maximum 30)']],
};
export default function CheckoutSettings({ value = {}, onChange }) {
  const change = (group, key, next) => onChange({ ...value, [group]: { ...value[group], [key]: next } });
  const toggle = (group, key, label) => <label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={value[group]?.[key] === true} onChange={e => change(group, key, e.target.checked)} />{label}</label>;
  return <section className="space-y-5 rounded-2xl border border-white/10 p-5">
    <h2 className="font-semibold text-white">Customer checkout</h2>
    <p className="text-sm text-neutral-400">These services remain disabled until configured. Delivery uses a circular service area and a fixed fee. Scheduling uses Asia/Riyadh business hours and preparation time, with separate capacity for pickup and delivery.</p>
    {Object.entries(fields).map(([group, entries]) => <fieldset key={group} className="space-y-3 rounded-xl border border-white/10 p-4"><legend className="px-2 capitalize text-dune-amber">{group}</legend>
      {toggle(group, 'enabled', 'Enable ' + group)}
      <div className="grid gap-3 sm:grid-cols-2">{entries.map(([key, label]) => <label key={key} className="space-y-1 text-sm text-neutral-300"><span>{label}</span><input type="number" step={group === 'delivery' ? 'any' : key === 'maximumDiscountSAR' ? '0.01' : '1'} value={value[group]?.[key] ?? ''} onChange={e => change(group, key, e.target.value === '' ? null : Number(e.target.value))} className="block w-full rounded-lg border border-white/10 bg-black/30 p-2" /></label>)}</div>
      {group === 'points' && <>{toggle(group, 'stackWithCoupons', 'Allow points with coupons')}<label className="flex items-start gap-2 text-sm text-neutral-300"><input type="checkbox" checked={value.points?.refundPolicy === 'proportional'} onChange={e => change(group, 'refundPolicy', e.target.checked ? 'proportional' : null)} />Approve proportional points restoration for cash refunds; cancellation returns all redeemed points. Returned points first cover existing refund adjustments.</label></>}
      {group === 'scheduling' && toggle(group, 'openingHoursConfirmed', 'I have verified the restaurant opening hours above')}
    </fieldset>)}
  </section>;
}
