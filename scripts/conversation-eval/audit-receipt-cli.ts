// Usage: bun --no-env-file scripts/conversation-eval/audit-receipt-cli.ts
// --manifest PATH --runStart PATH --ledger PATH --admitted PATH
// --requestStart PATH --turn PATH
// stdout contains only allowlisted diagnostic fields. No output-file option.
import {
  auditHistoricalReceiptFiles,
  RECEIPT_AUDIT_KEYS,
  type ReceiptAuditPaths,
} from "./audit-receipt";

const args = process.argv.slice(2);
const paths: Record<string, string> = {};
let valid = args.length === RECEIPT_AUDIT_KEYS.length * 2;
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].startsWith("--") ? args[i].slice(2) : "";
  if (!RECEIPT_AUDIT_KEYS.some((allowed) => allowed === key) || key in paths || !args[i + 1])
    valid = false;
  else paths[key] = args[i + 1];
}
const result = auditHistoricalReceiptFiles(
  valid ? (paths as ReceiptAuditPaths) : ({} as ReceiptAuditPaths),
);
console.log(JSON.stringify(result));
if (result.status === "refused") process.exitCode = 1;
