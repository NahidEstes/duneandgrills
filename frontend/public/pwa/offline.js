const button = document.querySelector("#saved-menu-button");
button?.addEventListener("click", async () => {
  const output = document.querySelector("#saved-menu");
  output.replaceChildren(); button.disabled = true;
  try {
    const response = await fetch("/api/menu", { credentials: "omit" });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.data)) throw new Error("Menu unavailable");
    const note = document.createElement("p"); note.textContent = "Saved menu — prices and availability may have changed. Reconnect to order."; output.append(note);
    for (const item of payload.data) {
      const line = document.createElement("p"); const price = Number(item.price);
      line.textContent = `${String(item.name || "Menu item")} — ${Number.isFinite(price) ? price.toFixed(2) : "—"} SAR`; output.append(line);
    }
  } catch { output.textContent = "No recent menu is saved on this device. Reconnect to load it."; }
  finally { button.disabled = false; }
});
