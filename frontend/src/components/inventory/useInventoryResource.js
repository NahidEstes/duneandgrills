"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function useInventoryResource(loader, dependencies = []) {
  const dependencyKey = JSON.stringify(dependencies);
  const [state, setState] = useState({ key: dependencyKey, data: null, loading: true, refreshing: false, error: null, lastSuccessAt: null });
  const loaderRef = useRef(loader);
  const keyRef = useRef(dependencyKey);
  const requestRef = useRef(0);
  const mountedRef = useRef(false);
  keyRef.current = dependencyKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestRef.current += 1; };
  }, []);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const reload = useCallback(async ({ silent = false } = {}) => {
    const request = ++requestRef.current;
    const key = keyRef.current;
    const current = () => mountedRef.current && request === requestRef.current && key === keyRef.current;
    setState(previous => ({ key, data: previous.key === key ? previous.data : null, loading: !silent || previous.key !== key || previous.data === null, refreshing: true, lastSuccessAt: previous.key === key ? previous.lastSuccessAt : null, error: null }));
    try {
      const result = await loaderRef.current();
      if (!current()) return undefined;
      setState({ key, data: result, loading: false, refreshing: false, error: null, lastSuccessAt: Date.now() });
      return result;
    } catch (loadError) {
      if (!current()) return undefined;
      setState(previous => ({ ...previous, loading: false, refreshing: false, error: loadError }));
      throw loadError;
    }
  }, []);

  const setData = useCallback(value => {
    requestRef.current += 1;
    setState(previous => ({ ...previous, key: keyRef.current, data: typeof value === "function" ? value(previous.data) : value, error: null, loading: false, refreshing: false, lastSuccessAt: Date.now() }));
  }, []);

  useEffect(() => {
    reload().catch(() => undefined);
  }, [dependencyKey, reload]);

  const matches = state.key === dependencyKey;
  return { data: matches ? state.data : null, setData, loading: !matches || state.loading, refreshing: matches && state.refreshing, lastSuccessAt: matches ? state.lastSuccessAt : null, error: matches ? state.error : null, reload };
}
