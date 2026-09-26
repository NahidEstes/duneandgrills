import assert from "node:assert/strict";
import test from "node:test";
import { KNOWLEDGE_GUIDES } from "../src/components/knowledge/knowledgeBaseData.js";
import { filterKnowledgeGuides, lastUpdatedLabel } from "../src/components/knowledge/knowledgeBaseUtils.js";

test("knowledge search covers title, description, category, type, roles and keywords", () => {
  assert.equal(filterKnowledgeGuides(KNOWLEDGE_GUIDES, { query: "Receive Stock" })[0].id, "receive-stock");
  assert.ok(filterKnowledgeGuides(KNOWLEDGE_GUIDES, { query: "traceable" }).some((guide) => guide.id === "fefo-labeling"));
  assert.ok(filterKnowledgeGuides(KNOWLEDGE_GUIDES, { query: "food-safety" }).some((guide) => guide.id === "temperature-chart"));
  assert.ok(filterKnowledgeGuides(KNOWLEDGE_GUIDES, { query: "Checklist" }).every((guide) => guide.type === "Checklist"));
  assert.ok(filterKnowledgeGuides(KNOWLEDGE_GUIDES, { query: "storekeeper" }).some((guide) => guide.id === "physical-count"));
  assert.ok(filterKnowledgeGuides(KNOWLEDGE_GUIDES, { query: "first expired first out" }).some((guide) => guide.id === "fefo-labeling"));
});

test("knowledge filters combine role, category and type", () => {
  const results = filterKnowledgeGuides(KNOWLEDGE_GUIDES, { role: "kitchen", category: "cleaning-hygiene", type: "checklist" });
  assert.deepEqual(results.map(({ id }) => id), ["closing-checklist", "cleaning-schedule"]);
});

test("last updated label is relative only when the Riyadh calendar day matches", () => {
  assert.equal(lastUpdatedLabel("2026-09-26", new Date("2026-09-26T18:00:00Z")), "Last updated today");
  assert.match(lastUpdatedLabel("2026-09-25", new Date("2026-09-26T18:00:00Z")), /^Last updated /);
});
