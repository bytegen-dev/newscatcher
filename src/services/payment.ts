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
  id?: string;
  blockchainIdentifier: string;
  agentIdentifier?: string | null;
  inputHash?: string | null;
  payByTime?: string | null;
  submitResultTime?: string | null;
  unlockTime?: string | null;
  externalDisputeUnlockTime?: string | null;
  RequestedFunds?: Array<{ unit: string; amount: string }> | null;
  SmartContractWallet?: {
    walletVkey: string;
    walletAddress: string;
  } | null;
  PaymentSource?: {
    paymentSourceType: 'Web3CardanoV1' | 'Web3CardanoV2';
  } | null;
}

/** Escrow deadlines that satisfy the payment node validation rules. */
function defaultPaymentDeadlines(): {
  payByTime: string;
  submitResultTime: string;
  unlockTime: string;
  externalDisputeUnlockTime: string;
} {
  const now = Date.now();
  const payByTime = new Date(now + 30 * 60 * 1000);
  const submitResultTime = new Date(now + 2 * 60 * 60 * 1000);
  const unlockTime = new Date(submitResultTime.getTime() + 6 * 60 * 60 * 1000);
  const externalDisputeUnlockTime = new Date(
    submitResultTime.getTime() + 12 * 60 * 60 * 1000,
  );
  return {
    payByTime: payByTime.toISOString(),
    submitResultTime: submitResultTime.toISOString(),
    unlockTime: unlockTime.toISOString(),
    externalDisputeUnlockTime: externalDisputeUnlockTime.toISOString(),
  };
}

function supportedPaymentSourceIndexFromEnv(): number {
  const raw = process.env.SUPPORTED_PAYMENT_SOURCE_INDEX?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 24) {
    throw new Error('SUPPORTED_PAYMENT_SOURCE_INDEX must be an integer from 0 to 24');
  }
  return n;
}

export function buildMip003PaidStartJobBody(args: {
  jobId: string;
  inputHash: string;
  identifierFromPurchaser: string;
  payment: PaymentRequestResponse;
}): Record<string, unknown> {
  const sellerVKey = args.payment.SmartContractWallet?.walletVkey?.trim();
  if (!sellerVKey) {
    throw new Error('Payment response missing SmartContractWallet.walletVkey');
  }

  const agentIdentifier =
    args.payment.agentIdentifier?.trim() || process.env.AGENT_IDENTIFIER?.trim();
  if (!agentIdentifier) {
    throw new Error('Missing agentIdentifier on payment response and AGENT_IDENTIFIER env');
  }

  const { payByTime, submitResultTime, unlockTime, externalDisputeUnlockTime } = args.payment;
  if (!payByTime || !submitResultTime || !unlockTime || !externalDisputeUnlockTime) {
    throw new Error('Payment response missing escrow deadline timestamps');
  }

  const body: Record<string, unknown> = {
    id: args.jobId,
    job_id: args.jobId,
    input_hash: args.inputHash,
    identifierFromPurchaser: args.identifierFromPurchaser,
    blockchainIdentifier: args.payment.blockchainIdentifier,
    payByTime,
    submitResultTime,
    unlockTime,
    externalDisputeUnlockTime,
    agentIdentifier,
    sellerVKey,
  };

  const paymentSourceType = args.payment.PaymentSource?.paymentSourceType;
  if (paymentSourceType) {
    body.paymentSourceType = paymentSourceType;
    if (paymentSourceType === 'Web3CardanoV2') {
      body.supportedPaymentSourceIndex = supportedPaymentSourceIndexFromEnv();
    }
  }

  return body;
}

export async function createPaymentRequest(args: {
  inputHash: string;
  identifierFromPurchaser: string;
}): Promise<PaymentRequestResponse> {
  const cfg = getConfig();
  const supportedPaymentSourceIndex = supportedPaymentSourceIndexFromEnv();
  const deadlines = defaultPaymentDeadlines();
  const result = (await apiRequest('POST', '/payment', {
    inputHash: args.inputHash,
    network: cfg.network,
    agentIdentifier: cfg.agentIdentifier,
    identifierFromPurchaser: args.identifierFromPurchaser,
    paymentSourceType: 'Web3CardanoV2',
    supportedPaymentSourceIndex,
    ...deadlines,
  })) as { data: PaymentRequestResponse };
  return result.data;
}

export async function getPaymentStatus(blockchainIdentifier: string): Promise<string | null> {
  const cfg = getConfig();
  // V2 list defaults to V1 when filterPaymentSourceType is omitted. Compressed
  // blockchain identifiers exceed searchQuery's 500-char cap, so filter by the
  // agent NFT id and pick the matching row.
  const result = (await apiRequest('GET', '/payment', undefined, {
    network: cfg.network,
    filterPaymentSourceType: 'Web3CardanoV2',
    filterAgentIdentifier: cfg.agentIdentifier,
    limit: '50',
  })) as {
    data: { Payments: Array<{ blockchainIdentifier: string; onChainState: string | null }> };
  };
  const payment = result.data?.Payments?.find(
    (row) => row.blockchainIdentifier === blockchainIdentifier,
  );
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
  const funds = payment.RequestedFunds;
  if (!funds?.length) return null;
  const amount = funds[0]?.amount;
  if (amount == null) return null;
  const n = Number(amount);
  return Number.isFinite(n) ? n : null;
}
