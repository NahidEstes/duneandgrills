"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { customerSafeBill, isDisplaySession, startDisplayPublisher } from "../utils/customerDisplaySync.js";

export function usePosCustomerDisplay() {
  const [displayUrl, setDisplayUrl] = useState(null);
  const publisher = useRef(null);
  const latestBill = useRef(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;
    let session;
    try { session = sessionStorage.getItem("dg_pos_display_session"); } catch { /* Storage is optional. */ }
    if (!isDisplaySession(session)) session = crypto.randomUUID();
    try { sessionStorage.setItem("dg_pos_display_session", session); } catch { /* Reopening through POS still works. */ }
    let transport;
    try {
      transport = startDisplayPublisher(session, () => latestBill.current);
    } catch {
      return undefined;
    }
    publisher.current = transport;
    setDisplayUrl(`/pos/customer-display?session=${session}`);
    const resume = () => transport.publish();
    const pause = () => transport.disconnect();
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", pause);
    return () => {
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", pause);
      publisher.current = null;
      transport.close();
    };
  }, []);

  const publishBill = useCallback((bill) => {
    latestBill.current = customerSafeBill(bill);
    publisher.current?.publish();
  }, []);
  return { displayUrl, publishBill };
}
