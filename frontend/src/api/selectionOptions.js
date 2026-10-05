// Existing form pickers need every option; searchable record lists request a single page.
// Fetch bounded pages rather than silently truncating a picker after introducing pagination.
export async function collectSelectionOptions(fetchPage, pageSize = 100) {
  const options = [];
  for (let page = 1; ; page += 1) {
    const rows = await fetchPage({ page, limit: pageSize });
    options.push(...rows);
    if (rows.length < pageSize) return options;
  }
}
