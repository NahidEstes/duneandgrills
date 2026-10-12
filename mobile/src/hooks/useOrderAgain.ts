import { useState } from 'react';
import { router } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { useAccountAction } from './useAccountAction';
import { loadCatalog } from '../services/api';
import { repeatPlan, type RepeatedLine } from '../domain/repeat';
import type { Order } from '../domain/types';
export function useOrderAgain() {
  const app = useApp(); const action = useAccountAction();
  const [choice, setChoice] = useState<{ actor: string; order: Order } | null>(null); const [message, setMessage] = useState({ actor: app.actor, text: '' });
  const run = (order: Order, replace: boolean) => void action.run(async active => {
    if (!app.session || app.actor !== app.session.user._id) throw new Error('Sign in to view your own order.');
    if (app.pending || app.busy) throw new Error('Resolve the saved order before changing your cart.');
    const result = await app.request<{ data: RepeatedLine[]; warnings: string[] }>(`/orders/${encodeURIComponent(order._id!)}/repeat`, { method: 'POST', body: {} });
    if (!active()) return;
    const products = await loadCatalog(); if (!active()) return;
    const plan = repeatPlan(result.data, products, app.cart, replace, result.warnings);
    if (!plan.added) { setMessage({ actor: app.actor, text: `No eligible items could be added. Your cart is unchanged.${plan.warnings.length ? '\n' + plan.warnings.join('\n') : ''}` }); setChoice(null); return; }
    await app.setCart(plan.lines, app.actor, app.cart); if (!active()) return;
    app.setCheckoutDraft(d => ({ ...d, notes: '', coupon: '', couponOfferId: undefined })); setChoice(null);
    router.push({ pathname: '/(tabs)/cart', params: { repeatNotice: `${plan.added} ${plan.added === 1 ? 'item' : 'items'} added at current catalog prices.${plan.warnings.length ? '\nSkipped items or changes:\n' + plan.warnings.join('\n') : ''}` } });
  });
  const start = (order: Order) => {
    if (action.busy || app.pending || app.busy || !app.session || !order._id) return;
    setMessage({ actor: app.actor, text: '' }); if (app.cart.length) setChoice({ actor: app.actor, order }); else run(order, false);
  };
  return { start, choose: (replace: boolean) => { if (choice?.actor === app.actor) run(choice.order, replace); }, cancel: () => setChoice(null), choice: choice?.actor === app.actor ? choice : null,
    message: message.actor === app.actor ? message.text : '', error: action.error, disabled: action.busy || app.busy || !!app.pending, busy: action.busy };
}
