import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppProvider';
import { messageOf } from '../components/ui';

// A response belonging to an old account must not update the new screen.
export function useAccountAction() {
  const app = useApp(); const owner = app.actor;
  const current = useRef(owner); const mounted = useRef(true); const gate = useRef(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useLayoutEffect(() => { current.current = app.actor; }, [app.actor]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = () => mounted.current && current.current === owner;
  const run = async (work: (active: () => boolean) => Promise<void>) => {
    if (gate.current || !active()) return;
    gate.current = true; setBusy(true); setError('');
    try { await work(active); } catch (e) { if (active()) setError(messageOf(e)); }
    finally { gate.current = false; if (active()) setBusy(false); }
  };
  return { busy, error, run };
}
