export function filterMenu(items, { search = "", sort = "menu", maximumPrice = "" } = {}) {
  const query = search.trim().toLocaleLowerCase();
  const ceiling = maximumPrice === "" ? Infinity : Number(maximumPrice);
  const result = items.filter(item => (!query || `${item.name} ${item.description || ""} ${item.category || ""}`.toLocaleLowerCase().includes(query)) && Number(item.price ?? item.comboPrice) <= ceiling);
  if (sort === "price-low") result.sort((a, b) => Number(a.price ?? a.comboPrice) - Number(b.price ?? b.comboPrice));
  if (sort === "price-high") result.sort((a, b) => Number(b.price ?? b.comboPrice) - Number(a.price ?? a.comboPrice));
  if (sort === "name") result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
