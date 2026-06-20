/**
 * appendLoadTrack — the single writer for the LoadTrack custody ledger.
 *
 * LOAD_MOVEMENT_PLAN.md Step 2. LoadTrack is append-only (invariant 4): rows are
 * never updated or deleted (soft-delete only, GDPR). Every row references the
 * JobExecutionEvent that caused it (invariant 5: no orphan custody).
 *
 * Keep all custody writes funnelled through here — do not scatter
 * `tx.loadTrack.create` across routes/services (the cleanup phases removed
 * exactly this kind of duplication).
 */

import { Prisma } from '../generated/client.js';
import {
  TransactionType,
  TRANSACTION_CUSTODY_MAP,
  custodyBaseOf,
} from '../constants/loadVocab.js';

type TxClient = Prisma.TransactionClient;

export interface AppendLoadTrackInput {
  companyId:        number;
  jobId:            number;
  jobPartId:        number;
  runId?:           number | null;
  runAssignmentId?: number | null;
  /** The JobExecutionEvent.id that caused this custody change (required). */
  eventId:          number;
  transactionType:  TransactionType;
  quantity:         number;
  unit?:            string;
  /** `<base>` or `<base>:<ref>` — base must be in CUSTODY_BASES. */
  fromCustody:      string;
  toCustody:        string;
  driverId?:        number | null;
  /** Vehicle/trailer identifier string (LoadTrack.trailerId). */
  trailerId?:       string;
  timestamp:        Date;
  gpsLat?:          number | null;
  gpsLng?:          number | null;
  notes?:           string | null;
}

/**
 * Append one custody row inside the caller's transaction.
 *
 * Defensive validation (throws — programmer error, rolls back the tx):
 *   - from/to custody bases must be recognised (CUSTODY_BASES).
 *   - the from→to bases must match TRANSACTION_CUSTODY_MAP for the transaction
 *     type, where the map specifies them (split/consolidate/damage allow null).
 */
export async function appendLoadTrack(
  tx: TxClient,
  input: AppendLoadTrackInput,
): Promise<void> {
  const fromBase = custodyBaseOf(input.fromCustody);
  const toBase   = custodyBaseOf(input.toCustody);
  if (!fromBase || !toBase) {
    throw new Error(`appendLoadTrack: unrecognised custody base in '${input.fromCustody}' → '${input.toCustody}'`);
  }

  const expected = TRANSACTION_CUSTODY_MAP[input.transactionType];
  if (expected.from !== null && expected.from !== fromBase) {
    throw new Error(`appendLoadTrack: '${input.transactionType}' expects from-base '${expected.from}', got '${fromBase}'`);
  }
  if (expected.to !== null && expected.to !== toBase) {
    throw new Error(`appendLoadTrack: '${input.transactionType}' expects to-base '${expected.to}', got '${toBase}'`);
  }

  await tx.loadTrack.create({
    data: {
      companyId:       input.companyId,
      jobId:           input.jobId,
      jobPartId:       input.jobPartId,
      runId:           input.runId ?? null,
      runAssignmentId: input.runAssignmentId ?? null,
      eventId:         input.eventId,
      transactionType: input.transactionType,
      quantity:        new Prisma.Decimal(input.quantity),
      unit:            input.unit ?? '',
      fromCustody:     input.fromCustody,
      toCustody:       input.toCustody,
      driverId:        input.driverId ?? null,
      trailerId:       input.trailerId ?? '',
      timestamp:       input.timestamp,
      gpsLat:          input.gpsLat ?? null,
      gpsLng:          input.gpsLng ?? null,
      notes:           input.notes ?? null,
    },
  });
}
