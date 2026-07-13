/**
 * End-to-end smoke drive of the built application (served by the API server
 * on :4000). Exercises the real user journey: dashboard → AI-guided project
 * creation → clarification questions → map generation → editor → natural-
 * language edit → insights → versions → exports.
 *
 * Run: node client/e2e/e2e.mjs   (server must be running with a built client)
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:4000';
const SHOT_DIR = process.env.E2E_SHOTS || '/tmp';
let failures = 0;

function ok(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✕ ${name} ${extra}`);
  }
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
});
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', (e) => {
  failures++;
  console.error(`  ✕ page error: ${e.message}`);
});

try {
  console.log('1. Dashboard');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  ok('dashboard renders', await page.getByText('Start a new initiative').isVisible());

  console.log('2. AI-guided project creation');
  await page.locator('.template-card', { hasText: 'Start with AI' }).click();
  await page.getByPlaceholder('e.g. Delivery delays reduction').fill('Delivery delays initiative');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/projects\//);
  await page.waitForSelector('h3:has-text("AI Business Analyst")', { timeout: 8000 });
  ok('project page with AI panel', true);

  console.log('3. Clarification questions on vague input');
  const chat = page.getByPlaceholder(/Describe your business/);
  await chat.fill('We want to improve.');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(800);
  ok('AI asks questions with reasons', (await page.getByText(/Which teams or departments/).count()) > 0);

  console.log('4. Map generation from a rich description');
  await chat.fill('We are an online clothing company trying to reduce delivery delays. Sales, warehouse, logistics and finance are involved.');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForURL(/\/editor\//, { timeout: 15000 });
  const processId = page.url().split('/editor/')[1];
  ok('editor opens generated process', Boolean(processId));
  await page.waitForSelector('.pnode', { timeout: 10000 });
  const nodeCount = await page.locator('.pnode').count();
  ok(`canvas renders nodes (${nodeCount})`, nodeCount >= 8);
  ok('swimlanes render', (await page.locator('.lane-node').count()) >= 3);
  await page.screenshot({ path: `${SHOT_DIR}/editor.png` });

  console.log('5. Natural-language AI edit');
  const before = await (await fetch(`${BASE}/api/processes/${processId}`)).json();
  await page.getByRole('tab', { name: '✦ AI' }).click();
  const editBox = page.getByPlaceholder(/Describe a change/);
  await editBox.fill('Add a finance approval before payment');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(1500);
  const after = await (await fetch(`${BASE}/api/processes/${processId}`)).json();
  ok('AI edit added a node', after.map.nodes.length === before.map.nodes.length + 1,
    `(${before.map.nodes.length} → ${after.map.nodes.length})`);

  console.log('6. Insights panel');
  await page.getByRole('tab', { name: 'Insights' }).click();
  await page.waitForSelector('.score-tile', { timeout: 8000 });
  ok('health score visible', await page.getByText('Health score').isVisible());
  ok('bottlenecks section visible', await page.getByText('Bottlenecks').first().isVisible());

  console.log('7. Manual editing: rename via properties');
  await page.getByRole('tab', { name: 'Properties' }).click();
  await page.locator('.pnode').first().click();
  await page.waitForSelector('.right-body h3:has-text("Activity")', { timeout: 5000 });
  const labelInput = page.locator('.right-body input.input').first();
  await labelInput.fill('Renamed by e2e');
  await page.waitForTimeout(1800); // autosave debounce
  const renamed = await (await fetch(`${BASE}/api/processes/${processId}`)).json();
  ok('autosave persisted rename', renamed.map.nodes.some((n) => n.label === 'Renamed by e2e'));

  console.log('8. Undo');
  await page.keyboard.press('Escape');
  await page.locator('.canvas-wrap').click({ position: { x: 30, y: 30 } });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1800);
  const undone = await (await fetch(`${BASE}/api/processes/${processId}`)).json();
  ok('undo reverted rename', !undone.map.nodes.some((n) => n.label === 'Renamed by e2e'));

  console.log('9. Versions');
  await page.getByRole('tab', { name: 'Versions' }).click();
  await page.waitForTimeout(600);
  ok('version list shows AI snapshot', (await page.locator('.list-row', { hasText: 'ai' }).count()) > 0);

  console.log('10. Export centre');
  await page.getByRole('tab', { name: 'Export' }).click();
  const dl = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('.list-row', { hasText: 'PNG image' }).getByRole('button').click();
  const download = await dl;
  ok('PNG export downloads', (await download.suggestedFilename()).endsWith('.png'));
  const dl2 = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('.list-row', { hasText: 'BPMN 2.0' }).getByRole('button').click();
  ok('BPMN export downloads', (await (await dl2).suggestedFilename()).endsWith('.bpmn'));
  const dl3 = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('.list-row', { hasText: 'PowerPoint' }).getByRole('button').click();
  ok('PPTX export downloads', (await (await dl3).suggestedFilename()).endsWith('.pptx'));
  const dl4 = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('.list-row', { hasText: 'Word document' }).getByRole('button').click();
  ok('DOCX export downloads', (await (await dl4).suggestedFilename()).endsWith('.docx'));
  const dl5 = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('.list-row', { hasText: 'Excel workbook' }).getByRole('button').click();
  ok('XLSX export downloads', (await (await dl5).suggestedFilename()).endsWith('.xlsx'));
  const dl6 = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('.list-row', { hasText: 'PDF report' }).getByRole('button').click();
  ok('PDF export downloads', (await (await dl6).suggestedFilename()).endsWith('.pdf'));

  console.log('11. Browser refresh recovery');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.pnode', { timeout: 10000 });
  ok('editor recovers after refresh', (await page.locator('.pnode').count()) >= 8);

  console.log('12. Settings page');
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  ok('AI configuration status shown', await page.getByText('AI configuration').isVisible());
  ok('usage log shown', await page.getByText('AI usage').isVisible());
  await page.screenshot({ path: `${SHOT_DIR}/settings.png` });
} catch (err) {
  failures++;
  console.error(`FATAL: ${err.message}`);
  await page.screenshot({ path: `${SHOT_DIR}/failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nE2E: all checks passed' : `\nE2E: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
