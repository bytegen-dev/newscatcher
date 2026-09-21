import { logError, logInfo } from '../logger.js';

export function isPaymentConfigured(): boolean {
  return Boolean(
    process.env.PAYMENT_SERVICE_URL?.trim() &&
      process.env.PAYMENT_API_KEY?.trim() &&
      process.env.AGENT_IDENTIFIER?.trim(),
  );
}

function requirePaymentEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function getConfig() {
  const apiUrl = requirePaymentEnv('PAYMENT_SERVICE_URL').replace(/\/$/, '');
  return {
    apiUrl,
    apiKey: requirePaymentEnv('PAYMENT_API_KEY'),
    agentIdentifier: requirePaymentEnv('AGENT_IDENTIFIER'),
    network: (process.env.NETWORK?.trim() || 'Preprod') as 'Preprod' | 'Mainnet',
  };
}

async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<unknown> {
  const cfg = getConfig();
  const url = new URL(`${cfg.apiUrl}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      token: cfg.apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Payment API ${method} ${path} returned ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

export interface PaymentRequestResponse {
  blockchainIdentifier: string;
  payByAddress?: string | null;
  requestedFunds?: Array<{ unit: string; amount: string }> | null;
  payByTime?: string | null;
  submitResultTime?: string | null;
  unlockTime?: string | null;
  externalDisputeUnlockTime?: string | null;
  inputHash?: string | null;
}

export async function createPaymentRequest(args: {
  inputHash: string;
  identifierFromPurchaser: string;
}): Promise<PaymentRequestResponse> {
  const cfg = getConfig();
  const result = (await apiRequest('POST', '/payment', {
    inputHash: args.inputHash,
    network: cfg.network,
    agentIdentifier: cfg.agentIdentifier,
    identifierFromPurchaser: args.identifierFromPurchaser,
  })) as { data: PaymentRequestResponse };
  return result.data;
}

export async function getPaymentStatus(blockchainIdentifier: string): Promise<string | null> {
  const cfg = getConfig();
  const result = (await apiRequest('GET', '/payment', undefined, {
    network: cfg.network,
    filterBlockchainIdentifier: blockchainIdentifier,
    limit: '1',
  })) as { data: { Payments: Array<{ onChainState: string | null }> } };
  const payment = result.data?.Payments?.[0];
  return payment?.onChainState ?? null;
}

export async function submitResultHash(
  blockchainIdentifier: string,
  submitResultHashHex: string,
): Promise<void> {
  const cfg = getConfig();
  await apiRequest('POST', '/payment/submit-result', {
    blockchainIdentifier,
    submitResultHash: submitResultHashHex,
    network: cfg.network,
  });
  logInfo('submitted result hash to payment service', { blockchainIdentifier });
}

export function startPaymentPolling(): void {
  const POLL_INTERVAL = 20_000;

  setInterval(() => {
    void (async () => {
      try {
        const { prisma } = await import('../db.js');
        const pendingJobs = await prisma.job.findMany({
          where: { status: 'awaiting_payment', blockchainIdentifier: { not: null } },
          select: { id: true, blockchainIdentifier: true },
          take: 50,
        });

        for (const job of pendingJobs) {
          if (!job.blockchainIdentifier) continue;
          try {
            const state = await getPaymentStatus(job.blockchainIdentifier);
            if (state === 'FundsLocked') {
              logInfo('payment confirmed, starting pipeline', { jobId: job.id });
              await prisma.job.update({
                where: { id: job.id },
                data: { status: 'running' },
              });
              const { runPipeline } = await import('./job.js');
              runPipeline(job.id);
            }
          } catch (e) {
            logError('payment poll error', e, { jobId: job.id });
          }
        }
      } catch (e) {
        logError('payment polling cycle error', e);
      }
    })();
  }, POLL_INTERVAL);

  logInfo('payment polling started', { intervalMs: POLL_INTERVAL });
}

export function parseAmountLovelace(payment: PaymentRequestResponse): number | null {
  const funds = payment.requestedFunds;
  if (!funds?.length) return null;
  const amount = funds[0]?.amount;
  if (amount == null) return null;
  const n = Number(amount);
  return Number.isFinite(n) ? n : null;
}
