"use client";

import { useEffect, useRef, useState } from "react";
import DarkSelect from "../../ui/DarkSelect.jsx";
import { toast } from "sonner";
import { fetchInstructionInventoryOptions, saveRecipeInstructionDraft } from "../../../api/recipeInstructionsApi.js";
import RecipeRevisionEditor, { editableRecipeContent } from "./RecipeRevisionEditor.jsx";

export default function RecipeDraftManager({ recipe, preparationOptions, onSaved, onSessionExpired }) {
  const [status, setStatus] = useState(["draft", "trial_required"].includes(recipe.status) ? recipe.status : "draft");
  const [content, setContent] = useState(() => editableRecipeContent(recipe));
  const [reason, setReason] = useState("");
  const retry = useRef(null);
  const [notes, setNotes] = useState(recipe.reviewNotes);
  const [link, setLink] = useState(recipe.inventoryRecipe || "");
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState([]);
  const [optionState, setOptionState] = useState("loading");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setOptionState("loading");
      fetchInstructionInventoryOptions(search, { signal: controller.signal }).then(rows => { if (!controller.signal.aborted) { setOptions(rows); setOptionState("ready"); } }).catch(err => {
        if (controller.signal.aborted) return;
        setOptionState("error"); if (err.response?.status === 401) onSessionExpired();
      });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, onSessionExpired]);
  const submit = async event => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const payload = { revision: recipe.revision, workflowVersion: recipe.workflowVersion || 0, reason, content, status, reviewNotes: notes, inventoryRecipe: link || null };
      const signature = JSON.stringify(payload); if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
      const next = await saveRecipeInstructionDraft(recipe.code, { ...payload, requestKey: retry.current.key });
      onSaved(next); setSaved(true); toast.success("New unapproved revision saved; published instructions unchanged.");
    } catch (err) {
      if (err.response?.status === 401) onSessionExpired();
      setError(err.response?.data?.message || "Draft save failed. Reload to check the latest revision before retrying.");
    } finally { setSaving(false); }
  };
  return <details className="recipe-card recipe-no-print p-5">
    <summary className="cursor-pointer font-semibold text-dune-amber">Manage instruction draft · Admin / Manager</summary>
    <form onSubmit={submit} className="mt-4 space-y-4">
      <p className="text-xs leading-6 text-neutral-400">Save creates a new working revision. Approval/trials never transfer. Current published instructions remain available. No stock or financial changes.</p>
      <RecipeRevisionEditor content={content} setContent={setContent} recipeCode={recipe.code} preparationOptions={preparationOptions} guide={recipe.category === "Kitchen Guides"} />
      <label className="block text-sm">Change reason<input className="recipe-input mt-2" value={reason} onChange={e => setReason(e.target.value)} required maxLength={3000} /></label>
      <label className="block text-sm">Draft status<DarkSelect value={status} onChange={e => setStatus(e.target.value)} aria-label="Draft status" className="recipe-input mt-2"><option value="trial_required">Trial required</option><option value="draft">Draft</option></DarkSelect></label>
      <label className="block text-sm">Find existing inventory recipe<input className="recipe-input mt-2" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu item name…" maxLength={100} /></label>
      <label className="block text-sm">Inventory recipe link<DarkSelect value={link} onChange={e => setLink(e.target.value)} aria-label="Inventory recipe link" className="recipe-input mt-2" disabled={optionState !== "ready"}>
        <option value="">Unmapped — no link</option>
        {link && !options.some(row => row._id === link) && <option value={link}>Current link: {link}</option>}
        {options.map(row => <option key={row._id} value={row._id}>{row.name}{!row.isActive ? " · Inactive" : row.doNotTrack ? " · Do Not Track" : " · Active"}</option>)}
      </DarkSelect></label>
      <p className="text-xs text-neutral-400" role="status">{optionState === "loading" ? "Loading authorized inventory links…" : optionState === "error" ? "Inventory links unavailable. Change the search to retry; existing link is retained." : `${options.length} matching links (bounded results). No ingredient quantities or costs are changed.`}</p>
      <label className="block text-sm">Owner / chef review notes<textarea className="recipe-input mt-2 min-h-28" maxLength={3000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-300">New revision saved. Unpublished; available only for authorized trial/review.</p>}
      <button disabled={saving} className="recipe-button bg-dune-amber/10">{saving ? "Saving…" : recipe.persisted ? "Save draft review" : "Save instruction draft to database"}</button>
    </form>
  </details>;
}
