export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? Array.from(parts[0])[0].toUpperCase() + (parts.length > 1 ? Array.from(parts[parts.length - 1])[0].toUpperCase() : '') : '?';
}

export function profileError(name: string, email: string, phone: string): string | null {
  if (!name.trim() || name.trim().length > 100) return 'Enter your name (1–100 characters).';
  if (!email.trim() || email.trim().length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  if (phone.trim() && !/^[+\d][\d\s()-]{5,29}$/.test(phone.trim())) return 'Enter a valid phone number.';
  return null;
}

function contactNumber(value?: string) {
  const number = value?.trim();
  if (!number || !/^[+\d][\d\s()-]{5,29}$/.test(number) || number.replace(/\D/g, '').length < 6) return null;
  return { display: number, normalized: number.replace(/[\s()-]/g, '') };
}

export function restaurantContact(location?: { phone?: string; whatsapp?: string }, receipt?: { phone?: string }) {
  const phone = contactNumber(location?.phone) || contactNumber(receipt?.phone);
  if (phone) return { label: phone.display, url: `tel:${phone.normalized}` };
  const whatsapp = contactNumber(location?.whatsapp);
  return whatsapp ? { label: `WhatsApp · ${whatsapp.display}`, url: `https://wa.me/${whatsapp.normalized.replace(/^\+/, '')}` } : null;
}
