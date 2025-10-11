import { createContext, useContext, useMemo, useRef } from 'react';

const DataCacheContext = createContext(null);

export function DataCacheProvider({ children }) {
  // cache shape: { habits: { [key]: any }, vitals: { [key]: any } }
  const cacheRef = useRef({ habits: {}, vitals: {} });

  const api = useMemo(() => ({
    getCached(type, key) {
      const bucket = cacheRef.current[type] || {};
      return bucket[key] ?? null;
    },
    setCached(type, key, value) {
      if (!cacheRef.current[type]) cacheRef.current[type] = {};
      cacheRef.current[type][key] = value;
    },
    clear(type, key) {
      if (type && key) {
        if (cacheRef.current[type]) delete cacheRef.current[type][key];
        return;
      }
      if (type) { cacheRef.current[type] = {}; return; }
      cacheRef.current = { habits: {}, vitals: {} };
    },
  }), []);

  return (
    <DataCacheContext.Provider value={api}>
      {children}
    </DataCacheContext.Provider>
  );
}

export function useDataCache() {
  const ctx = useContext(DataCacheContext);
  if (!ctx) throw new Error('useDataCache must be used within a DataCacheProvider');
  return ctx;
}
