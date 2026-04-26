import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const EMAIL_FROM      = process.env.EMAIL_FROM!;
const EMAIL_RECIPIENT = process.env.EMAIL_REPORT_RECIPIENT!;

function fmtDate(d: any): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export async function sendShiftReportEmail({ shift, pdfBuffer, recipientEmail }: { shift: any; pdfBuffer: Buffer; recipientEmail?: string }): Promise<void> {
  const allChecks  = (shift.segments ?? []).flatMap((s: any) => [...(s.truckChecks ?? []), ...(s.trailerChecks ?? [])]);
  const isFailed   = (c: any) => c.result === "fail" || c.ok === false;
  const hasDefects  = allChecks.some(isFailed);
  const failedItems = allChecks.filter(isFailed).map((c: any) => c.label || c.key);

  // Only count mileage where truck actually moved (odometerEnd > odometerStart)
  // Trailer-only changes share the same truck odometer, not counted separately
  const totalMileage = (shift.segments ?? []).reduce((sum: number, s: any) => {
    if (s.odometerEnd && s.odometerStart && s.odometerEnd > s.odometerStart) {
      return sum + (s.odometerEnd - s.odometerStart);
    }
    return sum;
  }, 0);

  const breakMins  = parseInt(shift.breakMins ?? "0") || 0;
  const startTime  = shift.startTime || "—";
  const endTime    = shift.endTime   || "—";
  const totalHours = shift.totalHours || "—";

  const subject = hasDefects
    ? `DEFECTS REPORTED — ${shift.driver?.name ?? shift.driverName} · Shift #${shift.id} · ${fmtDate(shift.shiftDate)}`
    : `Shift Report — ${shift.driver?.name ?? shift.driverName} · Shift #${shift.id} · ${fmtDate(shift.shiftDate)}`;

  const defectBanner = hasDefects ? `
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin-bottom:20px;border-radius:4px;">
      <p style="margin:0;color:#dc2626;font-weight:700;font-size:15px;">&#9888; Defects Reported</p>
      <p style="margin:8px 0 0;color:#7f1d1d;font-size:13px;">Failed items: ${failedItems.join(", ")}</p>
    </div>` : "";

  const segmentRows = (shift.segments ?? []).map((s: any, i: number) => `
    <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#fff"}">
      <td style="padding:8px 12px;font-size:13px;color:#111827;font-weight:600;">Segment ${s.segmentNumber}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;">${s.truckReg}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;">${s.trailerReg ?? "No trailer"}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;">${s.odometerEnd && s.odometerStart ? (s.odometerEnd - s.odometerStart).toLocaleString() + " km" : "—"}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;">${s.deliveries?.length ?? 0} jobs</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <!-- Header -->
        <tr><td style="background:#1a1a2e;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">Shift Report</p>
          <p style="margin:6px 0 0;color:#e94560;font-size:13px;">${shift.company?.name ?? ""}</p>
        </td></tr>

        <tr><td style="padding:28px 36px;">
          ${defectBanner}

          <p style="margin:0 0 20px;color:#374151;font-size:14px;">
            Shift report submitted by <strong>${shift.driver?.name ?? shift.driverName}</strong> for <strong>${fmtDate(shift.shiftDate)}</strong>.
            Full report attached as PDF.
          </p>

          <!-- Hours summary -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;margin-bottom:20px;">
            <tr>
              <td width="25%" style="padding:14px;text-align:center;border-right:1px solid rgba(255,255,255,0.1);">
                <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;">Start Time</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#fff;">${startTime}</p>
              </td>
              <td width="25%" style="padding:14px;text-align:center;border-right:1px solid rgba(255,255,255,0.1);">
                <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;">Finish Time</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#fff;">${endTime}</p>
              </td>
              <td width="25%" style="padding:14px;text-align:center;border-right:1px solid rgba(255,255,255,0.1);">
                <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;">Unpaid Break</p>
                <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#fff;">${breakMins > 0 ? breakMins + " min" : "None"}</p>
              </td>
              <td width="25%" style="padding:14px;text-align:center;">
                <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;">Paid Hours</p>
                <p style="margin:6px 0 0;font-size:20px;font-weight:800;color:#e94560;">${totalHours}</p>
              </td>
            </tr>
          </table>

          <!-- Shift summary grid -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:20px;">
            <tr>
              <td width="50%" style="padding:10px 14px;">
                <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;">Total Mileage</p>
                <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#111827;">${totalMileage.toLocaleString()} km</p>
              </td>
              <td width="50%" style="padding:10px 14px;">
                <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;">Segments</p>
                <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#111827;">${shift.segments?.length ?? 0}</p>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding:10px 14px;">
                <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;">Night Out</p>
                <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#111827;">${shift.nightOut ? "Yes" : "No"}</p>
              </td>
              <td width="50%" style="padding:10px 14px;">
                <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;">Checklist Status</p>
                <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:${hasDefects ? "#dc2626" : "#16a34a"};">
                  ${hasDefects ? "&#9888; Defects — see PDF" : "&#10003; All checks passed"}
                </p>
              </td>
            </tr>
          </table>

          <!-- Segments table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;overflow:hidden;margin-bottom:20px;">
            <tr style="background:#1a1a2e;">
              <td style="padding:8px 12px;font-size:10px;color:#fff;font-weight:700;">SEG</td>
              <td style="padding:8px 12px;font-size:10px;color:#fff;font-weight:700;">TRUCK</td>
              <td style="padding:8px 12px;font-size:10px;color:#fff;font-weight:700;">TRAILER</td>
              <td style="padding:8px 12px;font-size:10px;color:#fff;font-weight:700;">MILEAGE</td>
              <td style="padding:8px 12px;font-size:10px;color:#fff;font-weight:700;">JOBS</td>
            </tr>
            ${segmentRows}
          </table>

          ${shift.delaysNote ? `<p style="font-size:13px;color:#374151;margin:0 0 8px;"><strong>Delays:</strong> ${shift.delaysNote}</p>` : ""}
          ${shift.expenses   ? `<p style="font-size:13px;color:#374151;margin:0 0 8px;"><strong>Expenses:</strong> ${shift.expenses}</p>` : ""}
          ${shift.defectsNote ? `<p style="font-size:13px;color:#dc2626;margin:0;"><strong>Defects noted:</strong> ${shift.defectsNote}</p>` : ""}

          <!-- Legal note -->
          <div style="margin-top:20px;background:#eff6ff;border-radius:6px;padding:10px 14px;">
            <p style="margin:0;font-size:11px;color:#1e40af;">
              ℹ️ UK/EU Working Time Directive: max 48h average per week · max 60h in any single week · min 11h daily rest between shifts
            </p>
          </div>
        </td></tr>

        <tr><td style="background:#f9fafb;padding:16px 36px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            Report #${shift.id} &middot; ${shift.company?.name ?? ""} &middot; DVSA compliant &middot; Generated automatically
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const filename = `shift-report-${shift.id}-${new Date(shift.shiftDate).toISOString().split("T")[0]}.pdf`;

  await sgMail.send({
    to:   (recipientEmail || EMAIL_RECIPIENT),
    from: EMAIL_FROM,
    subject,
    html,
    attachments: [{
      content:     pdfBuffer.toString("base64"),
      filename,
      type:        "application/pdf",
      disposition: "attachment",
    }],
  });
}
