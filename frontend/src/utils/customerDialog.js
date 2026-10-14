let locks = 0, originalOverflow;
export function lockCustomerScroll(body) {
  if (locks++ === 0) { originalOverflow = body.style.overflow; body.style.overflow = "hidden"; }
  let released = false;
  return () => { if (released) return; released = true; if (--locks === 0) body.style.overflow = originalOverflow; };
}
