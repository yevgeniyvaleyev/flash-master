import * as repo from '@/db/repo';
import { useDataVersion } from '@/store/data-version';

import { syncBackground } from './background';

const bump = () => useDataVersion.getState().bump();

/**
 * Wraps a repo mutation so every screen refreshes and the blocker, alarms and reminders follow at once (a logged
 * unit may unlock the apps).
 */
function mutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    const result = await fn(...args);
    bump();
    void syncBackground();
    return result;
  };
}

export const createTopic = mutation(repo.createTopic);
export const updateTopic = mutation(repo.updateTopic);
export const setTopicPaused = mutation(repo.setTopicPaused);
export const setTopicCompleted = mutation(repo.setTopicCompleted);
export const resetTopicProgress = mutation(repo.resetTopicProgress);
export const archiveTopic = mutation(repo.archiveTopic);
export const moveTopic = mutation(repo.moveTopic);
export const addEntry = mutation(repo.addEntry);
export const deleteEntry = mutation(repo.deleteEntry);
