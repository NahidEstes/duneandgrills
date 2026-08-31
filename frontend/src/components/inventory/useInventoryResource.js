"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function useInventoryResource(loader, dependencies = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loaderRef = useRef(loader);
  const dependencyKey = JSON.stringify(dependencies);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      setData(result);
      return result;
    } catch (loadError) {
      setError(loadError);
      throw loadError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => undefined);
  }, [dependencyKey, reload]);

  return { data, setData, loading, error, reload };
}
