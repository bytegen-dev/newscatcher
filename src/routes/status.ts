import type { Request, Response } from 'express';
import { prisma } from '../db.js';

export async function getStatus(req: Request, res: Response): Promise<void> {
  const jobId = typeof req.query.job_id === 'string' ? req.query.job_id : '';
  if (!jobId) {
    res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'job_id query parameter is required',
    });
    return;
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    res.status(404).json({
      error: 'JOB_NOT_FOUND',
      message: `No job exists with ID: ${jobId}`,
    });
    return;
  }

  const base = {
    job_id: job.id,
    status: job.status,
    created_at: job.createdAt.toISOString(),
  };

  if (job.status === 'completed' && job.outputData != null) {
    const completedAt = job.completedAt ?? job.createdAt;
    const executionTimeSeconds = Math.max(
      0,
      (completedAt.getTime() - job.createdAt.getTime()) / 1000,
    );
    const output = job.outputData as { summary_markdown?: string };
    const result =
      typeof output.summary_markdown === 'string'
        ? output.summary_markdown
        : JSON.stringify(job.outputData);

    res.json({
      ...base,
      result,
      output: job.outputData,
      input_hash: job.inputHash,
      output_hash: job.outputHash,
      completed_at: completedAt.toISOString(),
      execution_time_seconds: executionTimeSeconds,
    });
    return;
  }

  if (job.status === 'failed') {
    res.json({
      ...base,
      error: 'PROCESSING_ERROR',
      message: job.errorMessage,
      failed_at: job.completedAt?.toISOString() ?? null,
    });
    return;
  }

  if (job.status === 'awaiting_payment') {
    const amount =
      job.amountLovelace != null && job.amountLovelace !== ''
        ? Number(job.amountLovelace)
        : null;
    res.json({
      ...base,
      payment_address: job.paymentAddress,
      amount_lovelace: Number.isFinite(amount) ? amount : null,
      blockchain_identifier: job.blockchainIdentifier,
    });
    return;
  }

  res.json(base);
}
