import type { SyncRunResult } from './types';

/** Connectivity/session changes need a later trigger; transient server failures warrant an OS retry. */
export const isTaskSuccess = (result: SyncRunResult): boolean => result.stoppedBy !== 'RETRY_LATER';
