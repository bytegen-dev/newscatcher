import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';

export function getCredential(req: Request, res: Response): void {
  const challenge =
    typeof req.query.masumi_challenge === 'string' ? req.query.masumi_challenge : '';

  if (!challenge) {
    res.status(400).type('text/plain').send('masumi_challenge query parameter is required');
    return;
  }

  const secret = process.env.MASUMI_VERIFICATION_SECRET?.trim();
  if (!secret) {
    res.status(503).type('text/plain').send('MASUMI_VERIFICATION_SECRET is not configured');
    return;
  }

  const hmac = createHmac('sha256', secret).update(challenge).digest('hex');
  res.type('text/plain').send(hmac);
}
