export const POS_SHORTCUTS = [
  ["Alt + S", "Search"], ["Alt + H", "Hold sale"], ["Alt + R", "Held sales"],
  ["Alt + C", "Cash payment"], ["Alt + D", "Card payment"],
  ["Alt + Enter", "Complete sale (confirmation)"], ["Alt + L", "Lock POS"], ["F1", "Shortcut help"],
];
export const resolvePosShortcut = (event, { modalOpen = false, textInput = false } = {}) => {
  if (event.repeat || modalOpen || textInput) return null;
  if (event.key === "F1") return "help";
  if (!event.altKey || event.ctrlKey || event.metaKey) return null;
  return ({ s: "search", h: "hold", r: "held", c: "cash", d: "card", l: "lock", Enter: "complete" })[event.key.length === 1 ? event.key.toLowerCase() : event.key] || null;
};
