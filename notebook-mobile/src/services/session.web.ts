import type { Session } from '../domain/notebook';
// Never persist staff bearer tokens in browser-accessible storage.
let current: Session | null = null;
export const sessionStore = {
  read: async () => current,
  write: async (value: Session) => { current = value; },
  clear: async () => { current = null; },
};
