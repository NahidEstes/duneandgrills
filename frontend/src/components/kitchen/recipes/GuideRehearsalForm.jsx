"use client";
import { useRef, useState } from "react";
import DarkSelect from "../../ui/DarkSelect.jsx";
import { recordRecipeTrial } from "../../../api/recipeInstructionsApi.js";
export default function GuideRehearsalForm({ recipe, onChanged, onSessionExpired }) {
  const [values, setValues] = useState({ trialAt: "", preparation: "", reviewerComments: "", safety: "untested", outcome: "needs_changes", guideChecks: {} });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""); const retry = useRef(null);
  const change = (key, value) => setValues(v => ({ ...v, [key]: value }));
  const submit = async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    const payload = { ...values, revision: recipe.revision, trialAt: `${values.trialAt}:00+03:00` };
    const signature = JSON.stringify(payload); if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
    try { await recordRecipeTrial(recipe.code, { ...payload, requestKey: retry.current.key }); onChanged(); }
    catch (err) { if (err.response?.status === 401) onSessionExpired(); setError(err.response?.data?.message || "Rehearsal save failed; retry the same request safely."); }
    finally { setBusy(false); }
  };
  return <details className="recipe-card p-5"><summary className="cursor-pointer font-semibold text-dune-amber">Record guide rehearsal · exact revision {recipe.revision}</summary><form onSubmit={submit} className="mt-4 space-y-4">
    <p className="recipe-warning">Actual staff rehearsal / source review, not a cooking trial. No invented ingredient weights, yield or tasting scores. Guide approval never replaces dish trials.</p>
    <label className="block text-sm">Rehearsal date/time · Asia/Riyadh<input className="recipe-input mt-2" type="datetime-local" required value={values.trialAt} onChange={e => change("trialAt", e.target.value)} /></label>
    <label className="block text-sm">Actual staff rehearsal observations<textarea className="recipe-input mt-2" required maxLength={3000} value={values.preparation} onChange={e => change("preparation", e.target.value)} /></label>
    <label className="block text-sm">Reviewer comments<textarea className="recipe-input mt-2" maxLength={3000} value={values.reviewerComments} onChange={e => change("reviewerComments", e.target.value)} /></label>
    {Object.entries({ sourceReviewed: "Source pages reviewed", staffRehearsal: "Staff procedure rehearsed", localSafetyReviewed: "Qualified/local safety applicability reviewed" }).map(([key,label]) => <label key={key} className="flex gap-2 text-sm"><input type="checkbox" checked={Boolean(values.guideChecks[key])} onChange={e => change("guideChecks", { ...values.guideChecks, [key]: e.target.checked })} />{label}</label>)}
    <label className="block text-sm">Food-safety review<DarkSelect className="recipe-input mt-2" value={values.safety} onChange={e => change("safety", e.target.value)}><option value="untested">Incomplete</option><option value="passed">Passed — actually reviewed</option><option value="failed">Failed</option></DarkSelect></label>
    <label className="block text-sm">Rehearsal outcome<DarkSelect className="recipe-input mt-2" value={values.outcome} onChange={e => change("outcome", e.target.value)}><option value="needs_changes">Needs changes</option><option value="passed">Passed</option><option value="failed">Failed</option></DarkSelect></label>
    {error && <p role="alert" className="text-red-300">{error}</p>}<button className="recipe-button" disabled={busy}>{busy ? "Saving…" : "Save guide rehearsal"}</button>
  </form></details>;
}
