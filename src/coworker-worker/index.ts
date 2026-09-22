import { config } from './config.js';
import { log } from './logger.js';
import { TaskProcessor } from './processor.js';
import { SokosumiClient } from './sokosumi-client.js';
import {
  loadState,
  saveState,
  shouldProcessTask,
  type WorkerState,
} from './state.js';

async function main(): Promise<void> {
  log('Starting News Catcher coworker worker (tasks only)', {
    api: config.sokosumiApiUrl,
    agentId: config.newsAgentId,
    pollMs: config.pollIntervalMs,
  });

  const client = new SokosumiClient(
    config.sokosumiApiUrl,
    config.coworkerToken,
  );

  try {
    const me = await client.get<{ id: string; name: string; capabilities: string[] }>(
      '/v1/coworkers/me',
    );
    log('Authenticated coworker', {
      id: me.id,
      name: me.name,
      capabilities: me.capabilities,
    });
    if (!me.capabilities.includes('tasks')) {
      throw new Error('Coworker must have the tasks capability');
    }
  } catch (error) {
    log('Coworker auth check failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
    return;
  }

  const processor = new TaskProcessor(client, config);
  let state: WorkerState = loadState(config.statePath);

  const shutdown = (): void => {
    log('Shutting down');
    saveState(config.statePath, state);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  for (;;) {
    try {
      const readyTasks = await processor.pollReadyTasks();
      for (const task of readyTasks) {
        if (task.status !== 'READY') {
          continue;
        }
        if (!shouldProcessTask(state, task.id)) {
          continue;
        }
        await processor.processTask(task.id, state);
        saveState(config.statePath, state);
      }
    } catch (error) {
      log('Poll cycle error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    saveState(config.statePath, state);
    await sleep(config.pollIntervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  log('Fatal error', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
