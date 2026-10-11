// Do not display arbitrary server text (database, proxy or validation internals).
export function apiMessage(status: number, path: string, serverMessage: unknown) {
  if (status === 401) return path.startsWith('/auth/mobile/') ? 'Check your email and password, then try again.' : 'Your session expired. Please sign in again.';
  if (status === 403) return 'This action is not available for your account.';
  if (status === 429) return 'Please wait a little before trying again.';
  if (status >= 500) return 'The restaurant service is temporarily unavailable. Please try again shortly.';
  if (status === 404) return 'This item or service is currently unavailable.';
  const message = typeof serverMessage === 'string' ? serverMessage : '';
  if (status === 410) return 'This order attempt was already cancelled. Use Check or cancel saved order to clear it safely before placing a new order.';
  if (status === 409) {
    if (/configure a recipe|invalid recipe|repair the (recipe|menu)|recipe unit|do not track/i.test(message)) return 'The restaurant cannot currently prepare one or more selected items. Check or cancel your saved order, then contact the restaurant or choose other items.';
    if (/stock|saleable inventory/i.test(message)) return 'Some ingredients are out of stock. Check or cancel your saved order before reviewing your cart.';
    if (/no longer available|unavailable|sold out/i.test(message)) return 'Some selected items are no longer available. Check or cancel your saved order before reviewing your cart.';
    return 'This request needs to be checked. Open your saved order before trying another order.';
  }
  if (/coupon/i.test(message)) return 'This coupon cannot be applied. Check the code and order requirements.';
  if (/stock|unavailable|sold out/i.test(message)) return 'Some items are no longer available. Please review your cart.';
  if (/minimum.*delivery|delivery.*minimum/i.test(message)) return 'The delivery minimum has changed. Please review your cart.';
  if (/email.*(already|registered|use)/i.test(message)) return 'This email is already registered. Please sign in.';
  return 'Please check your details and selections, then try again.';
}
export function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong. Please retry.';
  if (error instanceof SyntaxError || /protected storage|SecureStore|keychain|keystore|AsyncStorage/i.test(error.message)) return 'Saved data could not be accessed securely. Please retry. Keep any saved order until its outcome is confirmed.';
  return error.message;
}
