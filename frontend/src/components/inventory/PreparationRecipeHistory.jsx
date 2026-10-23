"use client";
import { useState } from "react";
import { fetchPreparationHistory } from "@/src/api/inventoryApi.js";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import useInventoryResource from "./useInventoryResource.js";
import { Button, InventoryLoadError, LoadingState, EmptyState, Pagination } from "./InventoryUI.jsx";
import { preparationQuantityLabel as quantity } from "@/src/utils/preparationUnits.js";

export function recipeComparison(before, after) {
  if (!after) return [];
  const fields = [
    ["Recipe name", before?.name, after.name],
    ["Expected output", before ? quantity(before.outputQuantity, before.outputUnit) : null, quantity(after.outputQuantity, after.outputUnit)],
    ["Status", before ? (before.isActive ? "Active" : "Inactive") : null, after.isActive ? "Active" : "Inactive"],
    ["Preparation notes", before?.notes || null, after.notes || null],
  ];
  const previous = new Map((before?.ingredients || []).map(line => [line.inventoryItem, line]));
  const current = new Map(after.ingredients.map(line => [line.inventoryItem, line]));
  for (const id of new Set([...previous.keys(), ...current.keys()])) {
    const left = previous.get(id), right = current.get(id);
    fields.push([`${right?.name || left?.name}${!left ? " (added)" : !right ? " (removed)" : ""}`, left ? quantity(left.quantity, left.unit) : null, right ? quantity(right.quantity, right.unit) : null]);
  }
  return fields.filter(([, left, right]) => left !== right);
}

export default function PreparationRecipeHistory({ recipe, onClose }) {
  const [page, setPage] = useState(1);
  const resource = useInventoryResource(() => fetchPreparationHistory(recipe._id, { page, limit: 10 }), [recipe._id, page]);
  return <DeliveryDialog open onClose={onClose} title={`Recipe history · ${recipe.name}`}>
    <p className="text-sm text-neutral-400">Saved audit evidence only. Missing versions are not reconstructed from the current recipe.</p>
    <Button variant="secondary" disabled={resource.loading || resource.refreshing} onClick={() => resource.reload().catch(() => undefined)}>Refresh history</Button>
    <InventoryLoadError error={resource.error} onRetry={resource.reload} retained={Boolean(resource.data)}/>
    {resource.loading ? <LoadingState/> : resource.data && <>
      {!resource.data.data.length && <EmptyState title="Recipe history unavailable" description="No saved version evidence is available for this recipe."/>}
      {resource.data.data.map(entry => {
        const complete = entry.after && (entry.before || entry.isCreation);
        const changes = complete ? recipeComparison(entry.before, entry.after) : [];
        return <article key={entry._id} className="min-w-0 space-y-3 rounded-xl border border-white/10 p-3">
          <h3 className="font-semibold">{entry.after ? `v${entry.after.version}` : "Version unavailable"}{entry.before ? ` · from v${entry.before.version}` : entry.isCreation ? " · Created" : ""}</h3>
          <p className="text-xs text-neutral-400">{entry.actorName} · {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(entry.createdAt))} · Asia/Riyadh</p>
          {!complete ? <p className="text-sm text-amber-200">Historical comparison evidence is incomplete. Changes cannot be determined.</p> : changes.length ? <div className="space-y-2">{changes.map(([label, left, right], index) => <div key={`${label}:${index}`} className="rounded-lg bg-black/20 p-3 text-sm"><p className="mb-2 font-medium text-neutral-200">{label}</p><div className="grid grid-cols-2 gap-3"><div className="min-w-0"><p className="text-xs text-neutral-400">Before</p><p className="whitespace-pre-wrap break-words text-neutral-300">{left ?? (entry.isCreation ? "Not created" : "None")}</p></div><div className="min-w-0"><p className="text-xs text-neutral-400">After</p><p className="whitespace-pre-wrap break-words text-white">{right ?? "None"}</p></div></div></div>)}</div> : <p className="text-sm text-neutral-400">No recipe field changes in this version.</p>}
        </article>;
      })}
      <Pagination pagination={resource.data.pagination} onPageChange={setPage}/>
    </>}
  </DeliveryDialog>;
}
