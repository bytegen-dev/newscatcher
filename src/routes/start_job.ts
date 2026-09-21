import type { Request, Response } from 'express';
import { logError } from '../logger.js';
import { parseInputData } from '../parse_input.js';
import { createJobRecord, runPipeline } from '../services/job.js';
import {
  createPaymentRequest,
  isPaymentConfigured,
  parseAmountLovelace,
} from '../services/payment.js';

function shouldUsePaidFlow(buyerId: string): boolean {
  return buyerId !== 'anonymous' && isPaymentConfigured();
}

export async function postStartJob(req: Request, res: Response): Promise<void> {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Request body is required',
    });
    return;
  }

  const identifier =
    (body as Record<string, unknown>).identifier_from_purchaser ??
    (body as Record<string, unknown>).identifierFromPurchaser;
  const buyerId =
    typeof identifier === 'string' && identifier.trim() ? identifier.trim() : 'anonymous';

  const inputData = (body as { input_data?: unknown }).input_data;
  const payload = parseInputData(inputData);
  if (!payload) {
    res.status(400).json({
      error: 'INVALID_INPUT',
      message: "Field 'query' is required in input_data",
    });
    return;
  }

  try {
    if (shouldUsePaidFlow(buyerId)) {
      const { id, inputHash } = await createJobRecord({
        buyerId,
        inputDataJson: inputData,
        status: 'awaiting_payment',
      });

      const payment = await createPaymentRequest({
        inputHash,
        identifierFromPurchaser: buyerId,
      });

      const amountLovelace = parseAmountLovelace(payment);
      await prismaUpdatePaymentFields(id, payment, amountLovelace);

      res.status(201).json({
        job_id: id,
        id,
        identifier_from_seller: id,
        blockchain_identifier: payment.blockchainIdentifier,
        payment_address: payment.payByAddress ?? null,
        amount_lovelace: amountLovelace,
        status: 'awaiting_payment',
      });
      return;
    }

    const { id } = await createJobRecord({ buyerId, inputDataJson: inputData });
    runPipeline(id);
    res.status(201).json({ job_id: id, id, status: 'running' });
  } catch (e) {
    logError('start_job failed', e);
    res.status(500).json({
      error: 'JOB_CREATION_FAILED',
      message: 'Internal error',
    });
  }
}

async function prismaUpdatePaymentFields(
  jobId: string,
  payment: Awaited<ReturnType<typeof createPaymentRequest>>,
  amountLovelace: number | null,
): Promise<void> {
  const { prisma } = await import('../db.js');
  await prisma.job.update({
    where: { id: jobId },
    data: {
      blockchainIdentifier: payment.blockchainIdentifier,
      paymentAddress: payment.payByAddress ?? null,
      amountLovelace: amountLovelace != null ? String(amountLovelace) : null,
    },
  });
}
