import { plannerText, PlannerError } from "./plannerRules.js";

const plain = value => value?.toObject ? value.toObject() : value;
const person = value => value?.id ? { id: value.id, name: value.name } : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Completion facts are server-authored and never reconstructed from updatedBy.
export function plannerTransition(current, next, actor, note, now = new Date()) {
  const events = [];
  const add = (action, completion) => events.push({ action, actor: { id: actor._id, name: actor.name }, at: now, ...(completion ? { completion } : {}) });
  const isCompletion = next.status === "Done" && current.status !== "Done";
  if (note !== undefined && !isCompletion) throw new PlannerError("A completion note can only be added when marking a reminder Done");
  let completion = plain(current.completion) || null;
  let completedAt = current.completedAt || null;
  if (isCompletion) {
    completedAt = now;
    completion = { at: now, by: { id: actor._id, name: actor.name }, dueAt: next.dueAt, title: next.title, category: next.category, responsible: person(next.responsible), checklist: next.checklist.map(row => ({ text: row.text, done: row.done })), note: plannerText(note ?? "", "Completion note", 1000) };
  } else if (next.status !== "Done") { completedAt = null; completion = null; }
  if (String(current.responsible?.id || "") !== String(next.responsible?.id || "")) add(`Responsible person changed: ${current.responsible?.name || "Unassigned"} → ${next.responsible?.name || "Unassigned"}`);
  if (+new Date(current.dueAt) !== +new Date(next.dueAt)) add(`Rescheduled: ${new Date(current.dueAt).toISOString()} → ${new Date(next.dueAt).toISOString()}`);
  if (!same(current.checklist.map(row => ({ text: row.text, done: row.done })), next.checklist.map(row => ({ text: row.text, done: row.done })))) add("Checklist updated");
  if (current.status !== next.status) add(next.status === "Done" ? "Marked as Done" : current.status === "Done" && ["Pending", "In Progress"].includes(next.status) ? `Reopened as ${next.status}` : `Status changed to ${next.status}`, isCompletion ? completion : undefined);
  return { completion, completedAt, events };
}
