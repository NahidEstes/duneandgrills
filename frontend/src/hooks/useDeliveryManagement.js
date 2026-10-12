"use client";
import { useEffect, useRef, useState } from "react";
import { fetchDeliveryManagement, fetchDeliveryDetails } from "../api/deliveryApi.js";
import { createDeliveryWorkspace, emptyDeliveryQuery } from "../components/admin/delivery/deliveryWorkspace.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function useDeliveryManagement({ preview, rehearsal }) {
  const { setUser, user } = useAuth(), workspace = useRef(null), unauthorized = useRef(setUser);
  useEffect(() => { unauthorized.current = setUser; }, [setUser]);
  const userId = user?._id || user?.id, role = user?.role, hasSession = Boolean(user);
  const [state, setState] = useState({ data: null, query: emptyDeliveryQuery(), loading: true });
  useEffect(() => {
    if (!hasSession) return;
    const current = createDeliveryWorkspace({
      list: (query, signal) => fetchDeliveryManagement({ ...query, preview, rehearsal }, signal),
      detail: (id, signal) => fetchDeliveryDetails(id, { preview, rehearsal, admin: true }, signal),
      onUnauthorized: () => unauthorized.current(null),
    });
    workspace.current = current; const unsubscribe = current.subscribe(setState);
    void current.load();
    return () => { unsubscribe(); current.dispose(); workspace.current = null; };
  }, [preview, rehearsal, userId, role, hasSession]);
  return { ...state, workspace };
}
