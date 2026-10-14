"use client";
import { useEffect, useRef, useState } from "react";
import { createDeliverySubmission } from "../components/rider/deliveryPresentation.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function useDeliverySubmission() {
  const { setUser } = useAuth();
  const [request] = useState(createDeliverySubmission);
  const busy = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const submit = async (operation, contents, send, after) => {
    if (busy.current) return null;
    busy.current = true;
    setPending(true); setError(""); setMessage("");
    try { const result = await request(operation, contents, send, navigator.onLine); if (mounted.current) { setMessage(result.duplicate ? "Previously confirmed request recovered." : "Confirmed by the server."); after?.(result); } return result; }
    catch (error) { if (mounted.current) { setError(error.response?.data?.message || error.message || "Delivery request failed. Reload before retrying."); if (error.response?.status === 401) setUser(null); } return null; }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  const clearFeedback = () => { if (!busy.current) { setError(""); setMessage(""); } };
  return { submit, pending, error, message, clearFeedback };
}
