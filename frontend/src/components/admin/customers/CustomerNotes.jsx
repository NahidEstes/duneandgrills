"use client";

import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createAdminCustomerNote,
  deleteAdminCustomerNote,
  fetchAdminCustomerNotes,
  updateAdminCustomerNote,
} from "../../../api/api.js";
import { formatAdminDate } from "../adminUi.js";
import { customerCardClass, EmptySection, SectionLoading } from "./customerUi.jsx";

export default function CustomerNotes({ customerId }) {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingText, setEditingText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotes(await fetchAdminCustomerNotes(customerId));
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load internal notes.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault();
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      const note = await createAdminCustomerNote(customerId, draft);
      setNotes((current) => [note, ...current]);
      setDraft("");
      toast.success("Internal customer note added.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to add the note.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (noteId) => {
    if (!editingText.trim() || saving) return;
    setSaving(true);
    try {
      const note = await updateAdminCustomerNote(customerId, noteId, editingText);
      setNotes((current) => current.map((row) => row._id === noteId ? note : row));
      setEditingId("");
      setEditingText("");
      toast.success("Internal note updated.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update the note.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (note) => {
    if (!window.confirm("Delete this internal customer note? This action is recorded in the Audit Log.")) return;
    try {
      await deleteAdminCustomerNote(customerId, note._id);
      setNotes((current) => current.filter((row) => row._id !== note._id));
      toast.success("Internal note deleted.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to delete the note.");
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={create} className={`${customerCardClass} p-4`}>
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500" htmlFor="customer-note">Add private note</label>
        <textarea id="customer-note" rows="3" maxLength="1000" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Only authorized Admin and Manager accounts can see this note." className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-neutral-700 focus:border-dune-amber/60" />
        <div className="mt-2 flex items-center justify-between"><span className="text-xs text-neutral-700">{draft.length}/1000</span><button type="submit" disabled={!draft.trim() || saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-dune-amber px-4 text-xs font-bold text-black disabled:opacity-40">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add note</button></div>
      </form>

      {loading ? <SectionLoading /> : notes.length ? <div className="space-y-3">{notes.map((note) => {
        const editing = editingId === note._id;
        return <article key={note._id} className={`${customerCardClass} p-4`}>
          {editing ? <textarea autoFocus rows="3" maxLength="1000" value={editingText} onChange={(event) => setEditingText(event.target.value)} className="w-full resize-y rounded-xl border border-dune-amber/40 bg-black/30 p-3 text-sm text-white outline-none" /> : <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">{note.text}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
            <p className="text-xs text-neutral-600">Created by <span className="text-neutral-400">{note.createdBySnapshot?.name || "Staff"}</span> · {formatAdminDate(note.createdAt, { hour: "2-digit", minute: "2-digit" })}{note.updatedAt !== note.createdAt ? ` · Edited ${formatAdminDate(note.updatedAt, { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
            <div className="flex gap-1">{editing ? <><button type="button" disabled={saving || !editingText.trim()} onClick={() => saveEdit(note._id)} className="grid h-8 w-8 place-items-center rounded-lg text-emerald-400 hover:bg-emerald-500/10" aria-label="Save note"><Check className="h-4 w-4" /></button><button type="button" onClick={() => { setEditingId(""); setEditingText(""); }} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-white/5" aria-label="Cancel editing"><X className="h-4 w-4" /></button></> : <><button type="button" onClick={() => { setEditingId(note._id); setEditingText(note.text); }} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-white/5 hover:text-dune-amber" aria-label="Edit note"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(note)} className="grid h-8 w-8 place-items-center rounded-lg text-red-400 hover:bg-red-500/10" aria-label="Delete note"><Trash2 className="h-4 w-4" /></button></>}</div>
          </div>
        </article>;
      })}</div> : <EmptySection>No internal notes have been added for this customer.</EmptySection>}
    </div>
  );
}
