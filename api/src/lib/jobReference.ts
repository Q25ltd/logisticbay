/**
 * Generates the next job reference for a company inside an existing transaction.
 * Format: TICKER-YY-NNNNNN  (e.g. LGB-26-000001)
 *
 * Concurrency: uses an atomic UPDATE … RETURNING to claim the sequence number,
 * so two concurrent requests can never receive the same reference.
 * Must be called inside a Prisma $transaction.
 */
export async function generateJobReference(
  companyId: number,
  tx: any,
): Promise<string> {
  const currentYear = new Date().getFullYear();
  const yy = String(currentYear).slice(-2);

  // Atomic read-modify-write. If the stored year differs from the current year,
  // reset the sequence to 1 (new year rollover).
  const rows = await tx.$queryRawUnsafe<Array<{
    ticker: string;
    seq: number;
  }>>(
    `UPDATE "Company"
     SET
       "nextJobSequence" = CASE
         WHEN "jobSequenceYear" = $1 THEN "nextJobSequence" + 1
         ELSE 2
       END,
       "jobSequenceYear" = $1
     WHERE id = $2
     RETURNING
       ticker,
       "nextJobSequence" - 1 AS seq`,
    currentYear,
    companyId,
  );

  if (!rows || rows.length === 0) {
    throw new Error(`Company ${companyId} not found when generating job reference`);
  }

  const { ticker, seq } = rows[0];
  const padded = String(seq).padStart(6, "0");
  return `${ticker}-${yy}-${padded}`;
}
