import { mipHashInputHex, mipHashOutputHex } from '../lib/hash.js';
import { logError } from '../logger.js';
import { parseInputData } from '../parse_input.js';
import { prisma } from '../db.js';
import { isPaymentConfigured, submitResultHash } from './payment.js';
import { searchNews } from './newscatcher.js';

export async function createJobRecord(args: {
  buyerId: string;
  inputDataJson: unknown;
  status?: string;
  blockchainIdentifier?: string | null;
  paymentAddress?: string | null;
  amountLovelace?: string | null;
}): Promise<{ id: string; inputHash: string }> {
  const inputHash = mipHashInputHex(args.buyerId, args.inputDataJson);
  const job = await prisma.job.create({
    data: {
      status: args.status ?? 'running',
      buyerId: args.buyerId,
      inputData: args.inputDataJson as object,
      inputHash,
      blockchainIdentifier: args.blockchainIdentifier ?? null,
      paymentAddress: args.paymentAddress ?? null,
      amountLovelace: args.amountLovelace ?? null,
    },
  });
  return { id: job.id, inputHash };
}

async function markFailed(jobId: string, message: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      errorMessage: message.slice(0, 4000),
      completedAt: new Date(),
    },
  });
}

async function safeMarkFailed(jobId: string, message: string): Promise<void> {
  try {
    await markFailed(jobId, message);
  } catch (e) {
    logError('persist job failed state', e, { jobId });
  }
}

export function runPipeline(jobId: string): void {
  void (async () => {
    try {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) {
        logError('runPipeline missing job', new Error(`not found: ${jobId}`));
        return;
      }
      if (job.status === 'awaiting_payment' || job.status === 'completed') {
        return;
      }

      if (job.status !== 'running') {
        await prisma.job.update({
          where: { id: jobId },
          data: { status: 'running' },
        });
      }

      const payload = parseInputData(job.inputData);
      if (!payload) {
        await safeMarkFailed(jobId, 'Stored input_data is invalid or missing query');
        return;
      }

      const output = await searchNews(payload);
      const outputHash = mipHashOutputHex(job.buyerId, output);
      if (job.blockchainIdentifier && isPaymentConfigured()) {
        try {
          await submitResultHash(job.blockchainIdentifier, outputHash);
        } catch (e) {
          logError('submit result hash failed', e, { jobId });
        }
      }

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          outputData: output as object,
          outputHash,
          completedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await safeMarkFailed(jobId, message);
    }
  })();
}
