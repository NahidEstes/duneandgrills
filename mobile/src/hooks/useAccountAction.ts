import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppProvider';
import { messageOf } from '../components/ui';

// A response belonging to an old account must not update the new screen.
export function useAccountAction() {
  const app = useApp(); const owner = `${app.actor}:${app.session?.token || ''}`;
  const current = useRef(owner); const mounted = useRef(true); const gate = useRef(false);
  const [state, setState] = useState({ owner, busy: false, error: '' });
  useLayoutEffect(() => { current.current = owner; gate.current = false; }, [owner]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = () => mounted.current && current.current === owner;
  const run = async (work: (active: () => boolean) => Promise<void>) => {
    if (gate.current || !active()) return;
    gate.current = true; setState({ owner, busy: true, error: '' });
    try { await work(active); } catch (e) { if (active()) setState({ owner, busy: true, error: messageOf(e) }); }
    finally { if (active()) { gate.current = false; setState(s => ({ ...s, busy: false })); } }
  };
  return { busy: state.owner === owner && state.busy, error: state.owner === owner ? state.error : '', run };
}
