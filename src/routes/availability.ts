import type { Request, Response } from 'express';
import { prisma } from '../db.js';
import { isPaymentConfigured } from '../services/payment.js';

export async function getAvailability(_req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'available',
      type: 'masumi-agent',
      capabilities: {
        newscatcher: Boolean(process.env.NEWSCATCHER_API_KEY?.trim()),
        masumi_payments: isPaymentConfigured(),
        saas_verification: Boolean(process.env.MASUMI_VERIFICATION_SECRET?.trim()),
      },
    });
  } catch {
    res.status(503).json({ status: 'unavailable', type: 'masumi-agent' });
  }
}
