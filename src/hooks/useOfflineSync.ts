import { useState, useEffect, useCallback, useRef } from 'react';
import { openDB } from 'idb';

const DB_NAME = 'todo-offline-db';
const STORE_NAME = 'operations';

export const initDB = async () => {
  return openDB(DB_NAME, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('todos-cache')) {
        db.createObjectStore('todos-cache', { keyPath: 'id' });
      }
    },
  });
};

export function useOfflineSync(token: string | null, onSyncComplete: () => void) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncOperations = useCallback(async (showIndicator = true) => {
    if (!isOnline || !token || syncingRef.current) return;

    try {
      syncingRef.current = true;
      if (showIndicator) setSyncing(true);
      const db = await initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const operations = await store.getAll();

      if (operations.length === 0) {
        syncingRef.current = false;
        if (showIndicator) setSyncing(false);
        return;
      }

      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ operations })
      });

      if (response.ok) {
        const clearTx = db.transaction(STORE_NAME, 'readwrite');
        await clearTx.objectStore(STORE_NAME).clear();
        onSyncComplete();
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      syncingRef.current = false;
      if (showIndicator) setSyncing(false);
    }
  }, [isOnline, token, onSyncComplete]);

  useEffect(() => {
    if (isOnline) {
      syncOperations(true);
    }
  }, [isOnline, syncOperations]);

  const queueOperation = async (type: 'CREATE' | 'UPDATE' | 'DELETE', payload: any) => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.objectStore(STORE_NAME).add({ type, payload, timestamp: Date.now() });
    
    if (isOnline) {
      syncOperations(false);
    }
  };

  return { isOnline, syncing, queueOperation };
}
