import { flowTracker } from './flowTracker.js';
import { networkScanner } from './networkScanner.js';
import { getSystemChecks } from '../utils/systemChecks.js';
import logger from '../utils/logger.js';

export async function ensureFlowTrackerRunning() {
  const checks = await getSystemChecks();
  if (!checks.flowReady) {
    return {
      started: false,
      reason: checks.flowBlockReason || 'Flow tracking prerequisites missing'
    };
  }

  if (flowTracker.isActive() && flowTracker.ready) {
    return { started: true, ready: true };
  }

  if (flowTracker.isActive() && !flowTracker.ready) {
    const ready = await flowTracker.waitForReady(6000);
    if (ready) {
      return { started: true, ready: true };
    }
    flowTracker.stop();
  }

  try {
    const networkInfo = await networkScanner.getLocalNetworkInfo();
    const started = await flowTracker.start(networkInfo);
    if (!started) {
      return { started: false, reason: flowTracker.lastError || 'Failed to start flow tracker' };
    }
    const ready = await flowTracker.waitForReady(8000);
    return {
      started: true,
      ready,
      reason: ready ? null : flowTracker.lastError || 'Flow tracker started but not ready'
    };
  } catch (error) {
    logger.warn(`ensureFlowTrackerRunning: ${error.message}`);
    return { started: false, reason: error.message };
  }
}
