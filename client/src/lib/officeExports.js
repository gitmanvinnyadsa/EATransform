/**
 * Browser-side office-format exports. The diagram image comes from the shared
 * headless SVG renderer (same output as the SVG export), rasterised via canvas.
 */
import { saveAs } from 'file-saver';
import { toSvg, documentModel } from '@eatransform/shared';

function safeName(name) {
  return (name || 'process').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'process';
}

/** Rasterise the process SVG to a PNG data URL. */
export async function mapToPngDataUrl(map, scale = 2) {
  const svg = toSvg(map);
  const dims = /width="(\d+)" height="(\d+)"/.exec(svg);
  const w = Number(dims?.[1] || 1200);
  const h = Number(dims?.[2] || 800);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not rasterise diagram'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(map) {
  const { dataUrl } = await mapToPngDataUrl(map, 2);
  const res = await fetch(dataUrl);
  saveAs(await res.blob(), `${safeName(map.name)}.png`);
}

export async function exportPdf(map) {
  const { jsPDF } = await import('jspdf');
  const { dataUrl, width, height } = await mapToPngDataUrl(map, 2);
  const dm = documentModel(map);
  const landscape = width >= height;
  const pdf = new jsPDF({ orientation: landscape ? 'l' : 'p', unit: 'pt', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();

  // Page 1: title + diagram
  pdf.setFontSize(20);
  pdf.text(map.name, 40, 46);
  pdf.setFontSize(10);
  pdf.setTextColor(110);
  pdf.text(`Process owner: ${map.owner || '—'}   ·   Exported ${new Date().toLocaleDateString()}`, 40, 64);
  pdf.setTextColor(0);
  const maxW = pw - 80;
  const maxH = ph - 110;
  const r = Math.min(maxW / width, maxH / height);
  pdf.addImage(dataUrl, 'PNG', 40, 80, width * r, height * r);

  // Page 2: overview + KPIs + risks
  pdf.addPage();
  let y = 46;
  const line = (label, value, bold = false) => {
    if (y > ph - 50) {
      pdf.addPage();
      y = 46;
    }
    pdf.setFontSize(bold ? 13 : 10);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    const wrapped = pdf.splitTextToSize(label + (value !== undefined ? `: ${value}` : ''), pw - 80);
    pdf.text(wrapped, 40, y);
    y += wrapped.length * (bold ? 18 : 13) + 4;
  };
  line('Process overview', undefined, true);
  for (const [k, v] of Object.entries(dm.overview)) line(k, v);
  y += 8;
  line('Analysis summary', undefined, true);
  line('Health score', String(dm.analysis.healthScore));
  line('Complexity', `${dm.analysis.complexityScore} (${dm.analysis.complexityLabel})`);
  for (const rec of dm.analysis.recommendations) line('→ ' + rec);
  y += 8;
  if (dm.kpis.length) {
    line('KPIs', undefined, true);
    for (const k of dm.kpis) line(k.KPI, `${k.Target} ${k.Unit}`.trim());
    y += 8;
  }
  if (dm.risks.length) {
    line('Risks', undefined, true);
    for (const r2 of dm.risks) line(`${r2.Risk} (${r2.Severity})`, r2.Mitigation || '');
  }
  // Page 3: activities table (simple rows)
  pdf.addPage();
  y = 46;
  line('Activities', undefined, true);
  for (const a of dm.activities) {
    line(`${a['#']}. ${a.Activity} [${a.Type}]`, `${a['Swimlane / Owner lane']}${a.Owner ? ' · ' + a.Owner : ''}${a.Description ? ' — ' + a.Description : ''}`);
  }
  pdf.save(`${safeName(map.name)}.pdf`);
}

export async function exportXlsx(map) {
  const XLSX = await import('xlsx');
  const dm = documentModel(map);
  const wb = XLSX.utils.book_new();
  const add = (rows, name) => {
    if (!rows || rows.length === 0) return;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  };
  add(Object.entries(dm.overview).map(([Field, Value]) => ({ Field, Value })), 'Overview');
  add(dm.activities, 'Activities');
  add(dm.flows, 'Flows');
  add(dm.raci, 'RACI');
  add(dm.kpis, 'KPIs');
  add(dm.risks, 'Risks');
  add(
    [
      { Metric: 'Health score', Value: dm.analysis.healthScore },
      { Metric: 'Complexity', Value: `${dm.analysis.complexityScore} (${dm.analysis.complexityLabel})` },
      { Metric: 'Cycle time (min)', Value: dm.analysis.cycleTimeMins },
      { Metric: 'Waiting time (min)', Value: dm.analysis.waitingTimeMins },
      { Metric: 'Handoffs', Value: dm.analysis.counts.handoffs },
      ...dm.analysis.recommendations.map((r) => ({ Metric: 'Recommendation', Value: r })),
    ],
    'Analysis'
  );
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safeName(map.name)}.xlsx`);
}

export async function exportDocx(map) {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType, TextRun, ImageRun } = docx;
  const dm = documentModel(map);
  const { dataUrl, width, height } = await mapToPngDataUrl(map, 2);
  const imgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const imgW = 620;
  const imgH = Math.round((height / width) * imgW);

  const table = (rows) => {
    if (!rows.length) return [new Paragraph({ children: [new TextRun({ text: 'None recorded.', italics: true })] })];
    const cols = Object.keys(rows[0]);
    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: cols.map(
              (c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c, bold: true })] })] })
            ),
          }),
          ...rows.map(
            (r) =>
              new TableRow({
                children: cols.map((c) => new TableCell({ children: [new Paragraph(String(r[c] ?? ''))] })),
              })
          ),
        ],
      }),
    ];
  };
  const h = (text, level = HeadingLevel.HEADING_1) => new Paragraph({ heading: level, children: [new TextRun(text)] });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(dm.title)] }),
          new Paragraph({ children: [new TextRun({ text: 'Business Process Documentation — generated by EATransform', italics: true })] }),
          h('Process map'),
          new Paragraph({ children: [new ImageRun({ data: imgBytes, transformation: { width: imgW, height: imgH } })] }),
          h('Overview'),
          ...table(Object.entries(dm.overview).map(([Field, Value]) => ({ Field, Value }))),
          h('Analysis'),
          new Paragraph(`Health score: ${dm.analysis.healthScore} / 100 — Complexity: ${dm.analysis.complexityScore} (${dm.analysis.complexityLabel})`),
          ...dm.analysis.recommendations.map((r) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(r)] })),
          h('Activities'),
          ...table(dm.activities.map(({ ['#']: n, Activity, Type, ['Swimlane / Owner lane']: Lane, Owner, Description }) => ({ '#': n, Activity, Type, Lane, Owner, Description }))),
          h('RACI'),
          ...table(dm.raci),
          h('KPIs'),
          ...table(dm.kpis),
          h('Risks'),
          ...table(dm.risks),
          h('Flows'),
          ...table(dm.flows),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${safeName(map.name)}.docx`);
}

export async function exportPptx(map) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const dm = documentModel(map);
  const { dataUrl, width, height } = await mapToPngDataUrl(map, 2);
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  // Slide 1 — title
  let s = pptx.addSlide();
  s.background = { color: '101F38' };
  s.addText(dm.title, { x: 0.7, y: 2.4, w: 12, h: 1.2, fontSize: 40, bold: true, color: 'FFFFFF' });
  s.addText(`Business Process Review · Owner: ${map.owner || 'TBD'} · ${new Date().toLocaleDateString()}`, {
    x: 0.7, y: 3.7, w: 12, h: 0.5, fontSize: 16, color: 'C9D4E6',
  });

  // Slide 2 — process map
  s = pptx.addSlide();
  s.addText('Process map', { x: 0.5, y: 0.25, fontSize: 22, bold: true, color: '16233B' });
  const maxW = 12.3;
  const maxH = 6.3;
  const r = Math.min(maxW / (width / 96), maxH / (height / 96));
  s.addImage({ data: dataUrl, x: 0.5, y: 0.9, w: (width / 96) * r, h: (height / 96) * r });

  // Slide 3 — executive summary
  s = pptx.addSlide();
  s.addText('Executive summary', { x: 0.5, y: 0.25, fontSize: 22, bold: true, color: '16233B' });
  s.addText(
    [
      { text: `Health score: ${dm.analysis.healthScore}/100    Complexity: ${dm.analysis.complexityLabel}\n`, options: { bold: true } },
      { text: `Purpose: ${map.purpose || '—'}\nObjective: ${map.objective || '—'}\n\n` },
      ...dm.analysis.recommendations.map((rec) => ({ text: `• ${rec}\n` })),
    ],
    { x: 0.6, y: 1.0, w: 12, h: 5.8, fontSize: 15, color: '16233B', valign: 'top' }
  );

  // Slide 4 — risks & KPIs table
  s = pptx.addSlide();
  s.addText('KPIs & risks', { x: 0.5, y: 0.25, fontSize: 22, bold: true, color: '16233B' });
  const kpiRows = [['KPI', 'Target', 'Unit'], ...dm.kpis.map((k) => [k.KPI, k.Target, k.Unit])];
  const riskRows = [['Risk', 'Severity', 'Mitigation'], ...dm.risks.map((k) => [k.Risk, k.Severity, k.Mitigation])];
  if (dm.kpis.length) s.addTable(kpiRows.map((row) => row.map((c) => ({ text: String(c) }))), { x: 0.5, y: 1.0, w: 6.0, fontSize: 12, border: { pt: 0.5, color: 'C6CFDD' } });
  if (dm.risks.length) s.addTable(riskRows.map((row) => row.map((c) => ({ text: String(c) }))), { x: 6.9, y: 1.0, w: 6.0, fontSize: 12, border: { pt: 0.5, color: 'C6CFDD' } });

  await pptx.writeFile({ fileName: `${safeName(map.name)}.pptx` });
}
