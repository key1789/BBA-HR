"use client";

type TrendPoint = {
  dayKey: string;
  ackRate: number;
};

type BacklogPoint = {
  tenantName: string;
  delivered: number;
  readRate: number;
  ackRate: number;
  unread: number;
  unacked: number;
};

function formatDateLabel(dayKey: string) {
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function AnalyticsExportButton({
  periodLabel,
  roleLabel,
  readRate,
  ackRate,
  recipients,
  trend,
  exporterName,
  backlog,
}: {
  periodLabel: string;
  roleLabel: string;
  readRate: number;
  ackRate: number;
  recipients: number;
  trend: TrendPoint[];
  exporterName: string;
  backlog: BacklogPoint[];
}) {
  const drawCanvas = () => {
    const width = 1200;
    const height = 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    // Header with simple brand badge
    ctx.fillStyle = "#4f46e5";
    ctx.fillRect(52, 28, 56, 56);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("BBA", 60, 64);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText("Broadcast Analytics", 126, 72);
    ctx.fillStyle = "#475569";
    ctx.font = "24px sans-serif";
    ctx.fillText(`Period: ${periodLabel} | Role: ${roleLabel}`, 126, 110);

    // KPI cards
    const cards = [
      { title: "Recipients", value: `${recipients}` },
      { title: "Read Rate", value: `${readRate}%` },
      { title: "Ack Rate", value: `${ackRate}%` },
    ];
    cards.forEach((card, i) => {
      const x = 52 + i * 370;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, 150, 340, 130);
      ctx.strokeStyle = "#e2e8f0";
      ctx.strokeRect(x, 150, 340, 130);
      ctx.fillStyle = "#64748b";
      ctx.font = "20px sans-serif";
      ctx.fillText(card.title, x + 22, 195);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 44px sans-serif";
      ctx.fillText(card.value, x + 22, 248);
    });

    // Sparkline area
    const chartX = 52;
    const chartY = 340;
    const chartW = width - 104;
    const chartH = 300;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(chartX, chartY, chartW, chartH);
    ctx.strokeStyle = "#e2e8f0";
    ctx.strokeRect(chartX, chartY, chartW, chartH);

    ctx.fillStyle = "#334155";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("Ack Trend", chartX + 18, chartY + 34);

    if (trend.length > 0) {
      const max = Math.max(1, ...trend.map((p) => p.ackRate));
      const plotX = chartX + 40;
      const plotY = chartY + 70;
      const plotW = chartW - 80;
      const plotH = chartH - 110;
      const step = trend.length > 1 ? plotW / (trend.length - 1) : plotW;

      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const y = plotY + (i * plotH) / 4;
        ctx.beginPath();
        ctx.moveTo(plotX, y);
        ctx.lineTo(plotX + plotW, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "#059669";
      ctx.lineWidth = 3;
      ctx.beginPath();
      trend.forEach((point, idx) => {
        const x = plotX + idx * step;
        const y = plotY + plotH - (point.ackRate / max) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      trend.forEach((point, idx) => {
        const x = plotX + idx * step;
        const y = plotY + plotH - (point.ackRate / max) * plotH;
        ctx.fillStyle = "#059669";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#64748b";
        ctx.font = "14px sans-serif";
        ctx.fillText(formatDateLabel(point.dayKey), x - 14, plotY + plotH + 26);
      });
    }

    // Footer watermark / attribution
    const exportedAt = new Date();
    const exportedAtLabel = exportedAt.toLocaleString("id-ID");
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px sans-serif";
    ctx.fillText(`Exported by ${exporterName} at ${exportedAtLabel}`, 52, height - 22);
    ctx.fillText("BBA HR - Internal Analytics Snapshot", width - 350, height - 22);

    return canvas;
  };

  const onDownloadPng = async () => {
    const canvas = drawCanvas();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `broadcast-analytics-${periodLabel}-${roleLabel}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const onDownloadPdf = async (withAppendix: boolean) => {
    const canvas = drawCanvas();
    if (!canvas) return;
    const imgData = canvas.toDataURL("image/png");
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const appendixRows = backlog
      .map(
        (row, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${row.tenantName}</td>
            <td>${row.delivered}</td>
            <td>${row.readRate}%</td>
            <td>${row.ackRate}%</td>
            <td>${row.unread}</td>
            <td>${row.unacked}</td>
          </tr>
        `,
      )
      .join("");
    const monthLabel = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });

    const html = `<!doctype html>
<html>
  <head>
    <title>Executive Broadcast Analytics</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; }
      .page { width: 100%; max-width: 794px; margin: 0 auto; padding: 8px 0; }
      .title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 10px; }
      img { width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
      .note { font-size: 11px; color: #64748b; margin-top: 8px; }
      .break { page-break-before: always; }
      table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 12px; text-align: left; }
      th { background: #f1f5f9; font-weight: 700; color: #0f172a; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="title">Executive Broadcast Analytics</div>
      <img src="${imgData}" alt="Broadcast Analytics" />
      <div class="note">Tip: gunakan destination "Save as PDF".</div>
    </div>
    ${
      withAppendix
        ? `<div class="page break">
      <div class="title">Monthly Executive Snapshot</div>
      <table>
        <tbody>
          <tr><th style="width: 220px;">Reporting Month</th><td>${monthLabel}</td></tr>
          <tr><th>Period Filter</th><td>${periodLabel}</td></tr>
          <tr><th>Role Filter</th><td>${roleLabel}</td></tr>
          <tr><th>Exported By</th><td>${exporterName}</td></tr>
          <tr><th>Recipients</th><td>${recipients}</td></tr>
          <tr><th>Read Rate</th><td>${readRate}%</td></tr>
          <tr><th>Ack Rate</th><td>${ackRate}%</td></tr>
        </tbody>
      </table>
      <div class="note">Snapshot ini ditujukan untuk ringkasan eksekutif bulanan.</div>
    </div>
    <div class="page break">
      <div class="title">Appendix - Top Backlog Cabang</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Cabang</th>
            <th>Sent</th>
            <th>Read</th>
            <th>Ack</th>
            <th>Unread</th>
            <th>Unacked</th>
          </tr>
        </thead>
        <tbody>
          ${appendixRows || '<tr><td colspan="7">Tidak ada data backlog.</td></tr>'}
        </tbody>
      </table>
      <div class="note">Period: ${periodLabel} | Role: ${roleLabel} | Exported by: ${exporterName}</div>
    </div>`
        : ""
    }
    <script>
      window.onload = () => {
        setTimeout(() => window.print(), 250);
      };
    </script>
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onDownloadPng}
        className="inline-flex rounded-xl border border-slate-300 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700"
      >
        Download PNG Analytics
      </button>
      <button
        type="button"
        onClick={() => onDownloadPdf(false)}
        className="inline-flex rounded-xl border border-indigo-300 px-3 py-2 text-xs font-black uppercase tracking-wider text-indigo-700"
      >
        Executive PDF (Compact)
      </button>
      <button
        type="button"
        onClick={() => onDownloadPdf(true)}
        className="inline-flex rounded-xl border border-indigo-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-indigo-800"
      >
        Executive PDF + Appendix
      </button>
    </div>
  );
}
