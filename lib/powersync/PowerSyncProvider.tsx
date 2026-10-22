'use client';

import { PowerSyncDatabase } from '@powersync/web';
import { PowerSyncContext } from '@powersync/react';
import type { ReactNode } from 'react';
import { AppSchema } from './AppSchema';
import { BackendConnector } from './BackendConnector';

// Singleton perezoso: en dev (hot reload) el módulo se re-evalúa y una
// variable de módulo evita crear instancias duplicadas de la DB.
let dbInstance: PowerSyncDatabase | undefined;

function getDB(): PowerSyncDatabase {
  if (!dbInstance) {
    dbInstance = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: 'bazarnaty.db', disableSSRWarning: true },
    });
    dbInstance.connect(new BackendConnector());
  }
  return dbInstance;
}

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const db = getDB();
  return (
    <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
  );
}
