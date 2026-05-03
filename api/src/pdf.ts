import PDFDocument from "pdfkit";
import { PassThrough } from "stream";

const C = {
  primary:  "#1a1a2e",
  accent:   "#e94560",
  pass:     "#16a34a",
  fail:     "#dc2626",
  muted:    "#6b7280",
  border:   "#e5e7eb",
  bg:       "#f9fafb",
  white:    "#ffffff",
  failBg:   "#fef2f2",
  infoBg:   "#eff6ff",
  warnBg:   "#fff7ed",
};

const MARGIN  = 45;
const WIDTH   = 595;
const CONTENT = WIDTH - MARGIN * 2;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(d: any): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtTime(d: any): string {
  if (!d) return "—";
  // If it's already a HH:MM string, return as-is
  if (typeof d === "string" && /^\d{1,2}:\d{2}$/.test(d)) return d;
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function calcHoursFromTimes(start: string, end: string, breakMins: number): string {
  if (!start || !end) return "—";
  const toMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return isNaN(h) ? 0 : h * 60 + m;
  };
  let total = toMins(end) - toMins(start);
  if (total < 0) total += 24 * 60;
  const paid = Math.max(0, total - breakMins);
  return `${Math.floor(paid / 60)}h ${(paid % 60).toString().padStart(2, "0")}m`;
}

function sectionBar(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.rect(MARGIN, y, CONTENT, 22).fill(C.primary);
  doc.fillColor(C.white).fontSize(9).font("Helvetica-Bold")
    .text(title.toUpperCase(), MARGIN + 8, y + 6, { width: CONTENT - 16 });
  return y + 28;
}

function infoRow(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, w: number): void {
  doc.fillColor(C.muted).fontSize(7).font("Helvetica").text(label.toUpperCase(), x, y, { width: w });
  doc.fillColor(C.primary).fontSize(9).font("Helvetica-Bold").text(value || "—", x, y + 9, { width: w });
}

function checkRow(doc: PDFKit.PDFDocument, item: any, i: number, y: number): number {
  const bg = i % 2 === 0 ? C.bg : C.white;
  doc.rect(MARGIN, y, CONTENT, 18).fill(bg);
  doc.fillColor(C.primary).fontSize(8).font("Helvetica")
    .text(item.label || item.key, MARGIN + 6, y + 5, { width: CONTENT - 70 });

  // Support both old boolean ok field and new result field
  const result: string = item.result ?? (item.ok === false ? "fail" : item.ok === true ? "pass" : "pass");
  const badgeX  = MARGIN + CONTENT - 48;
  const badgeBg = result === "pass" ? C.pass : result === "na" ? "#9ca3af" : C.fail;
  const badgeTx = result === "pass" ? "PASS" : result === "na" ? "N/A" : "FAIL";

  doc.rect(badgeX, y + 3, 44, 12).fill(badgeBg);
  doc.fillColor(C.white).fontSize(7).font("Helvetica-Bold")
    .text(badgeTx, badgeX, y + 5, { width: 44, align: "center" });
  y += 18;

  if (result === "fail" && item.note) {
    doc.rect(MARGIN, y, CONTENT, 14).fill(C.failBg);
    doc.fillColor(C.fail).fontSize(7).font("Helvetica-Oblique")
      .text(`⚠ Defect: ${item.note}`, MARGIN + 6, y + 3, { width: CONTENT - 12 });
    y += 16;
  }
  return y;
}

function checkPage(doc: PDFKit.PDFDocument, y: number, needed: number = 60): number {
  if (y + needed > doc.page.height - 60) {
    doc.addPage();
    return 40;
  }
  return y;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main PDF generator
// ─────────────────────────────────────────────────────────────────────────────

export async function generateShiftPDF(shift: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];
    const stream = new PassThrough();
    stream.on("data",  c   => chunks.push(Buffer.from(c)));
    stream.on("end",   ()  => resolve(Buffer.concat(chunks)));
    stream.on("error", err => reject(err));
    doc.pipe(stream);

    let y = 0;

    // ── Header ──────────────────────────────────────────────────────────────
    doc.rect(0, 0, WIDTH, 72).fill(C.primary);
    doc.fillColor(C.white).fontSize(18).font("Helvetica-Bold")
      .text("SHIFT REPORT", MARGIN, 18, { width: CONTENT });
    doc.fillColor(C.accent).fontSize(11).font("Helvetica")
      .text(shift.company?.name ?? shift.driverName, MARGIN, 40);
    doc.fillColor(C.white).fontSize(8).font("Helvetica")
      .text(`Report #${shift.id}`, MARGIN, 18, { width: CONTENT, align: "right" })
      .text(fmtDate(shift.shiftDate), MARGIN, 30, { width: CONTENT, align: "right" });
    y = 82;

    // ── Defect banner ────────────────────────────────────────────────────────
    const allChecks  = (shift.segments ?? []).flatMap((s: any) => [
      ...(s.truckChecks ?? []), ...(s.trailerChecks ?? []),
    ]);
    const hasDefects = allChecks.some((c: any) => c.result === "fail" || c.ok === false);

    if (hasDefects) {
      doc.rect(MARGIN, y, CONTENT, 24).fill(C.failBg);
      doc.rect(MARGIN, y, 4, 24).fill(C.fail);
      doc.fillColor(C.fail).fontSize(9).font("Helvetica-Bold")
        .text("⚠  DEFECTS REPORTED — Review required before vehicle redeployment", MARGIN + 10, y + 7);
      y += 30;
    }

    // ── Shift Details ────────────────────────────────────────────────────────
    // Calculate total mileage upfront — used in shift details and hours box
    const shiftTotalMileage = (shift.segments ?? []).reduce((sum: number, s: any) => {
      if (s.odometerEnd && s.odometerStart && s.odometerEnd > s.odometerStart) {
        return sum + (s.odometerEnd - s.odometerStart);
      }
      return sum;
    }, 0);

    y = sectionBar(doc, "Shift Details", y);

    const c3 = CONTENT / 3;
    infoRow(doc, "Driver",   shift.driver?.name ?? shift.driverName, MARGIN,          y, c3 - 8);
    infoRow(doc, "Date",     fmtDate(shift.shiftDate),               MARGIN + c3,     y, c3 - 8);
    infoRow(doc, "Status",   shift.status?.toUpperCase() ?? "—",     MARGIN + c3 * 2, y, c3 - 8);
    y += 28;

    // Fuel, AdBlue and Total Mileage row
    infoRow(doc, "Fuel Drawn",    shift.fuelDrawn   || "—",                                    MARGIN,          y, c3 - 8);
    infoRow(doc, "AdBlue Drawn",  shift.adBlueDrawn || "—",                                    MARGIN + c3,     y, c3 - 8);
    infoRow(doc, "Total Mileage", shiftTotalMileage > 0 ? shiftTotalMileage.toLocaleString() + " km" : "—", MARGIN + c3 * 2, y, c3 - 8);
    y += 32;

    // ── Hours Summary ────────────────────────────────────────────────────────
    y = sectionBar(doc, "Hours Summary", y);

    const startTime  = shift.startTime  || "—";
    const endTime    = shift.endTime    || "—";
    const breakMins  = parseInt(shift.breakMins ?? "0") || 0;
    const totalHours = shift.totalHours ||
      (shift.startTime && shift.endTime
        ? calcHoursFromTimes(shift.startTime, shift.endTime, breakMins)
        : "—");

    // Hours box — 5 columns including total mileage
    doc.rect(MARGIN, y, CONTENT, 48).fill(C.primary);

    const hc = CONTENT / 5;
    const hItems = [
      { label: "Start Time",    value: startTime },
      { label: "Finish Time",   value: endTime },
      { label: "Unpaid Break",  value: breakMins > 0 ? `${breakMins} min` : "None" },
      { label: "Working Hrs",   value: totalHours, accent: true },
      { label: "Total Mileage", value: shiftTotalMileage > 0 ? shiftTotalMileage.toLocaleString() + " km" : "—", accent: true },
    ];
    hItems.forEach((item, i) => {
      const hx = MARGIN + hc * i + 6;
      doc.fillColor("rgba(255,255,255,0.5)").fontSize(7).font("Helvetica")
        .text(item.label.toUpperCase(), hx, y + 8, { width: hc - 12 });
      doc.fillColor(item.accent ? C.accent : C.white).fontSize(14).font("Helvetica-Bold")
        .text(item.value, hx, y + 20, { width: hc - 12 });
    });
    y += 56;

    // Legal note
    doc.rect(MARGIN, y, CONTENT, 16).fill(C.infoBg);
    doc.fillColor("#1e40af").fontSize(7).font("Helvetica")
      .text(
        "UK/EU Working Time Directive: max 48h average per week (17-week period) · max 60h in any single week · min 11h daily rest",
        MARGIN + 6, y + 4, { width: CONTENT - 12 }
      );
    y += 22;

    // ── Segments ─────────────────────────────────────────────────────────────
    for (const seg of shift.segments ?? []) {
      y = checkPage(doc, y, 100);

      const odomDiff = seg.odometerEnd && seg.odometerStart
        ? seg.odometerEnd - seg.odometerStart
        : null;
      const segMileage = (odomDiff !== null && odomDiff > 0)
        ? odomDiff.toLocaleString() + " km"
        : "—";

      // Build descriptive segment header
      const vehicleTypeLabel =
        seg.vehicleClass === "class2" ? "Rigid" :
        seg.vehicleClass === "van"    ? "Van" :
        seg.trailerReg ? "" : "Solo Unit";
      const segmentTitle =
        seg.trailerReg
          ? `Segment ${seg.segmentNumber} — ${seg.truckReg} + ${seg.trailerReg}`
          : vehicleTypeLabel
            ? `Segment ${seg.segmentNumber} — ${seg.truckReg} (${vehicleTypeLabel})`
            : `Segment ${seg.segmentNumber} — ${seg.truckReg}`;
      y = sectionBar(doc, segmentTitle, y);

      infoRow(doc, "Truck",          seg.truckReg,                                  MARGIN,          y, c3 - 8);
      infoRow(doc, "Trailer",        seg.trailerReg ?? "No trailer",                MARGIN + c3,     y, c3 - 8);
      infoRow(doc, "Segment Mileage", segMileage,                                   MARGIN + c3 * 2, y, c3 - 8);
      y += 28;

      infoRow(doc, "Odometer Start", seg.odometerStart?.toLocaleString() + " km",  MARGIN,          y, c3 - 8);
      const odomEndDisplay = (seg.odometerEnd && seg.odometerEnd !== seg.odometerStart)
        ? seg.odometerEnd.toLocaleString() + " km"
        : "—";
      infoRow(doc, "Odometer End", odomEndDisplay, MARGIN + c3, y, c3 - 8);
      infoRow(doc, "Start Time",     fmtTime(seg.startTime),                        MARGIN + c3 * 2, y, c3 - 8);
      y += 32;

      // Truck/vehicle checks — only show if this segment required them
      const truckChecks = seg.truckChecks ?? [];
      if (seg.needsTruckCheck !== false && truckChecks.length > 0) {
        y = checkPage(doc, y, 40);
        const truckLabel =
          seg.vehicleClass === "van"    ? "VAN WALK ROUND CHECKS" :
          seg.vehicleClass === "class2" ? "RIGID HGV WALK ROUND CHECKS (DVSA 2023)" :
                                          "TRUCK WALK ROUND CHECKS (DVSA 2023)";
        doc.fillColor(C.muted).fontSize(8).font("Helvetica-Bold").text(truckLabel, MARGIN, y);
        y += 12;
        truckChecks.forEach((item: any, i: number) => {
          y = checkPage(doc, y, 20);
          y = checkRow(doc, item, i, y);
        });
        y += 6;
      } else if (seg.needsTruckCheck === false) {
        // Truck unchanged — note it briefly so auditor knows it was intentional
        doc.rect(MARGIN, y, CONTENT, 14).fill(C.bg);
        doc.fillColor(C.muted).fontSize(7).font("Helvetica-Oblique")
          .text("Truck/unit unchanged from previous segment — walk round check not repeated", MARGIN + 6, y + 3);
        y += 18;
      }

      // Trailer checks — only show if this segment required them
      const trailerChecks = seg.trailerChecks ?? [];
      if (seg.needsTrailerCheck !== false && trailerChecks.length > 0) {
        y = checkPage(doc, y, 40);
        doc.fillColor(C.muted).fontSize(8).font("Helvetica-Bold")
          .text("TRAILER WALK ROUND CHECKS (DVSA 2023)", MARGIN, y);
        y += 12;
        trailerChecks.forEach((item: any, i: number) => {
          y = checkPage(doc, y, 20);
          y = checkRow(doc, item, i, y);
        });
        y += 6;
      } else if (seg.vehicleClass === "class1" && seg.trailerReg && seg.needsTrailerCheck === false) {
        doc.rect(MARGIN, y, CONTENT, 14).fill(C.bg);
        doc.fillColor(C.muted).fontSize(7).font("Helvetica-Oblique")
          .text("Trailer unchanged from previous segment — walk round check not repeated", MARGIN + 6, y + 3);
        y += 18;
      }

      // Deliveries table
      if (seg.deliveries?.length) {
        y = checkPage(doc, y, 60);
        doc.fillColor(C.muted).fontSize(8).font("Helvetica-Bold").text("DELIVERIES / JOBS", MARGIN, y);
        y += 12;

        // Table header
        doc.rect(MARGIN, y, CONTENT, 16).fill(C.primary);
        const cols = [
          { label: "Materials",    x: MARGIN + 2,   w: 78  },
          { label: "Collect From", x: MARGIN + 82,  w: 78  },
          { label: "Deliver To",   x: MARGIN + 162, w: 78  },
          { label: "Ticket No",    x: MARGIN + 242, w: 50  },
          { label: "Start",        x: MARGIN + 294, w: 32  },
          { label: "Finish",       x: MARGIN + 328, w: 32  },
          { label: "Hours",        x: MARGIN + 362, w: 28  },
          { label: "Tonnes",       x: MARGIN + 392, w: 32  },
          { label: "Kgs",          x: MARGIN + 426, w: 28  },
          { label: "Notes",        x: MARGIN + 456, w: 44  },
        ];
        cols.forEach(col => {
          doc.fillColor(C.white).fontSize(6).font("Helvetica-Bold")
            .text(col.label, col.x, y + 4, { width: col.w });
        });
        y += 18;

        seg.deliveries.forEach((d: any, i: number) => {
          const rowH = 16;
          y = checkPage(doc, y, rowH + 4);
          doc.rect(MARGIN, y, CONTENT, rowH).fill(i % 2 === 0 ? C.bg : C.white);
          const vals = [d.materials, d.collectFrom, d.deliverTo, d.ticketNo, d.startTime, d.finishTime, d.hours, d.tonnes, d.kgs, d.notes];
          cols.forEach((col, ci) => {
            doc.fillColor(C.primary).fontSize(7).font("Helvetica")
              .text(vals[ci] || "—", col.x, y + 4, { width: col.w, lineBreak: false });
          });
          y += rowH;
        });
        y += 8;
      }

      if (seg.notes) {
        y = checkPage(doc, y, 20);
        doc.fillColor(C.muted).fontSize(7).font("Helvetica").text("Segment notes: ", MARGIN, y);
        doc.fillColor(C.primary).fontSize(7).text(seg.notes, MARGIN + 65, y, { width: CONTENT - 65 });
        y += 14;
      }
      y += 8;
    }

    // ── Total Mileage Summary ────────────────────────────────────────────────
    y = checkPage(doc, y, 50);
    const totalMileage = (shift.segments ?? []).reduce((sum: number, s: any) => {
      if (s.odometerEnd && s.odometerStart && s.odometerEnd > s.odometerStart) {
        return sum + (s.odometerEnd - s.odometerStart);
      }
      return sum;
    }, 0);

    // Total mileage is shown in hours summary box above

    // ── End of Shift Summary ──────────────────────────────────────────────────
    y = checkPage(doc, y, 80);
    y = sectionBar(doc, "End of Shift Summary", y);

    infoRow(doc, "Night Out", shift.nightOut ? "Yes" : "No", MARGIN,      y, c3 - 8);
    infoRow(doc, "Expenses",  shift.expenses || "None",       MARGIN + c3, y, c3 - 8);
    y += 28;

    if (shift.delaysNote) {
      y = checkPage(doc, y, 30);
      doc.fillColor(C.muted).fontSize(7).font("Helvetica").text("DELAYS / REPORT", MARGIN, y);
      doc.fillColor(C.primary).fontSize(9).font("Helvetica")
        .text(shift.delaysNote, MARGIN, y + 9, { width: CONTENT });
      y += 9 + doc.heightOfString(shift.delaysNote, { width: CONTENT }) + 10;
    }

    if (shift.defectsNote) {
      y = checkPage(doc, y, 30);
      doc.rect(MARGIN, y, CONTENT, 22).fill(C.failBg);
      doc.fillColor(C.fail).fontSize(8).font("Helvetica-Bold")
        .text("DEFECTS NOTED: " + shift.defectsNote, MARGIN + 6, y + 6);
      y += 28;
    }

    // ── Driver Declaration ────────────────────────────────────────────────────
    y = checkPage(doc, y, 50);
    doc.rect(MARGIN, y, CONTENT, 44).fill(C.bg);
    doc.rect(MARGIN, y, 3, 44).fill(C.primary);
    doc.fillColor(C.primary).fontSize(8).font("Helvetica-Bold")
      .text("DRIVER DECLARATION", MARGIN + 10, y + 6);
    const isSpareDriver = (shift.segments ?? []).length === 0;
    doc.fillColor(C.muted).fontSize(7).font("Helvetica")
      .text(
        isSpareDriver
          ? "I confirm that the information in this report is accurate and complete. I was on standby / spare driver duty today with no vehicle assigned. " +
            "No walkaround check was required. This report was submitted electronically and is authenticated by the driver login."
          : "I confirm that the information in this report is accurate and complete. I have carried out the required DVSA walkaround check " +
            "before moving the vehicle and reported all defects. This report was submitted electronically and is authenticated by the driver login.",
        MARGIN + 10, y + 18, { width: CONTENT - 20 }
      );
    doc.fillColor(C.primary).fontSize(8).font("Helvetica-Bold")
      .text(`Driver: ${shift.driver?.name ?? shift.driverName}`, MARGIN + 10, y + 34)
      .text(`Submitted: ${shift.submittedAt ? fmtDate(shift.submittedAt) : fmtDate(new Date())}`, MARGIN + 250, y + 34);
    y += 52;

    // ── Footer ────────────────────────────────────────────────────────────────
    const pageH = doc.page.height;
    doc.rect(0, pageH - 36, WIDTH, 36).fill(C.primary);
    doc.fillColor(C.muted).fontSize(6).font("Helvetica")
      .text(
        `Generated ${new Date().toISOString()} · Report #${shift.id} · ${shift.company?.name ?? ""} · ` +
        `DVSA compliant · gov.uk/guidance/carry-out-daily-heavy-goods-vehicle-hgv-walkaround-checks`,
        MARGIN, pageH - 24, { width: CONTENT, align: "center" }
      );

    doc.end();
  });
}
