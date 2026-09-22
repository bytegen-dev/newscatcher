import { readFileSync, writeFileSync } from 'node:fs';

import { log } from './logger.js';

export type WorkerState = {
  eventsCursor: string | null;
  processedTaskIds: string[];
  inFlightTaskIds: string[];
};

const EMPTY: WorkerState = {
  eventsCursor: null,
  processedTaskIds: [],
  inFlightTaskIds: [],
};

export function loadState(path: string): WorkerState {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as WorkerState;
    return {
      eventsCursor: parsed.eventsCursor ?? null,
      processedTaskIds: Array.isArray(parsed.processedTaskIds)
        ? parsed.processedTaskIds
        : [],
      inFlightTaskIds: Array.isArray(parsed.inFlightTaskIds)
        ? parsed.inFlightTaskIds
        : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...EMPTY };
    }
    log('Could not read state file; starting fresh', { path });
    return { ...EMPTY };
  }
}

export function saveState(path: string, state: WorkerState): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function markProcessed(state: WorkerState, taskId: string): void {
  state.inFlightTaskIds = state.inFlightTaskIds.filter((id) => id !== taskId);
  if (!state.processedTaskIds.includes(taskId)) {
    state.processedTaskIds.push(taskId);
    if (state.processedTaskIds.length > 500) {
      state.processedTaskIds = state.processedTaskIds.slice(-500);
    }
  }
}

export function markInFlight(state: WorkerState, taskId: string): void {
  if (!state.inFlightTaskIds.includes(taskId)) {
    state.inFlightTaskIds.push(taskId);
  }
}

export function shouldProcessTask(state: WorkerState, taskId: string): boolean {
  return (
    !state.processedTaskIds.includes(taskId) &&
    !state.inFlightTaskIds.includes(taskId)
  );
}
