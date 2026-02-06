// =============================================================================
// MOSY — generateShiftReport Azure Function
// Timer Trigger (hourly): Finds completed shifts, generates PDF, uploads to Blob,
// sends WhatsApp notification with report link.
// =============================================================================

import { app, InvocationContext } from '@azure/functions';
import type { ShiftDocument, LiftDocument } from '@mosy/shared-types';
import { getContainer } from '../shared/cosmos-client.js';
import { uploadBlob } from '../shared/blob-client.js';
import { sendShiftReportWhatsApp } from '../shared/notifications.js';

interface ShiftWithLifts {
  shift: ShiftDocument;
  lifts: LiftDocument[];
}

async function generateShiftReport(
  _timer: unknown,
  context: InvocationContext
): Promise<void> {
  const now = Date.now();
  const oneHourAgo = now - 3600000;

  context.log('Checking for completed shifts in the last hour...');

  try {
    // 1. Query shifts completed in the last hour
    const shiftsContainer = getContainer('SHIFTS');
    const { resources: completedShifts } = await shiftsContainer.items
      .query<ShiftDocument>({
        query: `SELECT * FROM s WHERE s.shift_end >= @startTime AND s.shift_end <= @endTime AND s.status = 'completed'`,
        parameters: [
          { name: '@startTime', value: oneHourAgo },
          { name: '@endTime', value: now },
        ],
      })
      .fetchAll();

    if (completedShifts.length === 0) {
      context.log('No completed shifts found in the last hour.');
      return;
    }

    context.log(`Found ${completedShifts.length} completed shift(s) to process.`);

    // 2. For each shift, query lifts and generate report
    const liftsContainer = getContainer('LIFTS');

    for (const shift of completedShifts) {
      try {
        const { resources: lifts } = await liftsContainer.items
          .query<LiftDocument>({
            query: `SELECT * FROM l WHERE l.shift_id = @shiftId ORDER BY l.lift_start ASC`,
            parameters: [{ name: '@shiftId', value: shift.id }],
          })
          .fetchAll();

        const reportData: ShiftWithLifts = { shift, lifts };

        // 3. Generate PDF
        const pdfBuffer = await generatePdf(reportData);

        // 4. Upload to Blob Storage
        const date = new Date(shift.shift_end).toISOString().split('T')[0];
        const blobName = `${date}/${shift.id}.pdf`;
        const reportUrl = await uploadBlob(
          'shift-reports',
          blobName,
          pdfBuffer,
          'application/pdf'
        );

        context.log(`Shift report uploaded: ${blobName} (${pdfBuffer.length} bytes)`);

        // 5. Send WhatsApp notification
        await sendShiftReportWhatsApp(
          shift.operator.name,
          shift.craneId,
          reportUrl,
          context
        );

        context.log(`Shift report complete for shift ${shift.id}`);
      } catch (shiftErr) {
        context.error(
          `Failed to generate report for shift ${shift.id}: ${(shiftErr as Error).message}`
        );
      }
    }
  } catch (err) {
    context.error(`generateShiftReport failed: ${(err as Error).message}`);
  }
}

async function generatePdf(data: ShiftWithLifts): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { shift, lifts } = data;
    const shiftDurationHrs = (shift.shift_duration_minutes / 60).toFixed(1);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('MOSY — Shift Report', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
    doc.moveDown(1);

    // Shift summary
    doc.fontSize(14).font('Helvetica-Bold').text('Shift Summary');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');

    const summaryLines = [
      `Operator: ${shift.operator.name} (${shift.operator.employee_id})`,
      `Crane: ${shift.craneId}`,
      `Shift Start: ${new Date(shift.shift_start).toLocaleString()}`,
      `Shift End: ${new Date(shift.shift_end).toLocaleString()}`,
      `Duration: ${shiftDurationHrs} hours`,
      `Total Lifts: ${shift.lifts.count}`,
      `Total Load: ${shift.lifts.total_tonnage.toFixed(1)} tonnes`,
      `Max Single Load: ${shift.lifts.max_load_tonnage.toFixed(1)} tonnes`,
      `Performance Score: ${shift.performance.score.toFixed(0)}%`,
      `Safety Incidents: ${shift.performance.safety_incidents}`,
    ];

    for (const line of summaryLines) {
      doc.text(line);
    }
    doc.moveDown(1);

    // Lift details table
    if (lifts.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Lift Details');
      doc.moveDown(0.3);
      doc.fontSize(9).font('Helvetica');

      const col1 = 50;
      const col2 = 100;
      const col3 = 250;
      const col4 = 350;
      const col5 = 430;

      doc.font('Helvetica-Bold');
      const tableTop = doc.y;
      doc.text('#', col1, tableTop);
      doc.text('Time', col2, tableTop);
      doc.text('Load (t)', col3, tableTop);
      doc.text('Duration', col4, tableTop);
      doc.text('Status', col5, tableTop);
      doc.moveDown(0.5);

      doc.font('Helvetica');
      lifts.forEach((lift, idx) => {
        if (doc.y > 750) {
          doc.addPage();
        }
        const y = doc.y;
        const durationMin = (lift.duration_seconds / 60).toFixed(1);

        doc.text(`${idx + 1}`, col1, y);
        doc.text(new Date(lift.lift_start).toLocaleTimeString(), col2, y);
        doc.text(`${lift.load.weight_tonnes.toFixed(1)}`, col3, y);
        doc.text(`${durationMin} min`, col4, y);
        doc.text(lift.safety.anomalies.length > 0 ? 'Incident' : lift.status, col5, y);
        doc.moveDown(0.3);
      });
    }

    doc.end();
  });
}

app.timer('generateShiftReport', {
  schedule: '0 0 * * * *',
  handler: generateShiftReport,
});

export default generateShiftReport;
