#!/usr/bin/env bash
# Local MAS-527 stack: payment node + NewsCatcher agent (no ngrok, no hosted Sokosumi).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PAYMENT_DIR="${PAYMENT_DIR:-$ROOT/../masumi-payment-service}"
AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -d "$PAYMENT_DIR" ]]; then
  echo "Missing masumi-payment-service at $PAYMENT_DIR" >&2
  exit 1
fi

echo "Payment node: cd $PAYMENT_DIR && pnpm dev   (default http://localhost:3005)"
echo "Agent:        cd $AGENT_DIR && pnpm dev       (http://localhost:3040)"
echo ""
echo "After both are up:"
echo "  masumi-cli doctor --json"
echo "  $AGENT_DIR/scripts/smoke-test.sh"
echo ""
echo "Register agent (Preprod, local apiBaseUrl):"
echo "  masumi-cli sell agent register --file @$AGENT_DIR/scripts/register-local-manifest.json --network Preprod --selling-wallet-vkey <vkey> -y"
