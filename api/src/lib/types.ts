/**
 * Shared type aliases.
 *
 * A.9 fix: `Omit<PrismaClient, "$connect" | "$disconnect" | ...>` was
 * copy-pasted in 4 places. When Prisma changes the disallowed key list,
 * all copies go stale. Use TxClient everywhere.
 */

import { Prisma } from '../generated/client.js';

/**
 * The transaction-client type injected by `prisma.$transaction(async tx => ...)`.
 * Use this for any function that must run inside a caller-provided transaction.
 */
export type TxClient = Prisma.TransactionClient;
