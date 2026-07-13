# EATransform — AI Business Process Mapping Platform

An intelligent business-analysis platform for Business Architects, Enterprise
Architects, Project Managers, Business Analysts, Operations Managers and
Transformation Teams. Describe your business in plain language — an AI
business analyst asks the right questions, builds professional, editable,
executive-level process maps, analyses them, and lets you change everything
by talking to it.

```
"We are an online clothing company trying to reduce delivery delays."
        ↓  clarification questions (only when needed)
        ↓  cross-functional swimlane process map, fully editable
        ↓  health score, bottlenecks, automation opportunities, KPIs
        ↓  "Add a finance approval before payment" → surgical AI edits
        ↓  export to PDF / PowerPoint / Word / Excel / BPMN / Visio-drawio / …
```

## Quick start

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

- App: http://localhost:5173 (frontend) — the API runs on http://localhost:4000
- Production: `npm run build && npm start` → everything on http://localhost:4000

The platform runs fully **without an AI key** (an offline demo analyst powers
the AI features). To activate real AI, copy `.env.example` to `.env`, add a
free Gemini key, and restart — full instructions in
[docs/AI_SETUP.md](docs/AI_SETUP.md).

## What's inside

| Area | Capabilities |
| --- | --- |
| AI analyst | Understands business descriptions; asks concise clarification questions with reasons; generates validated process maps; edits maps by natural language with surgical operations (your other edits are preserved); consultant-style reviews; automatic fallback and JSON repair — invalid AI output can never corrupt your data. |
| Providers | Google Gemini (default, free tier), Anthropic Claude, OpenAI — switchable purely via `.env` configuration. Offline mock analyst when no key. |
| Editor | Infinite canvas (React Flow), drag-and-drop palette, snap-to-grid, auto-layout, minimap, zoom/pan, undo/redo, autosave, search & highlight, keyboard shortcuts. |
| Swimlanes | Auto-created per department/team/role/customer/supplier; rename, recolour, reorder, resize, collapse/expand, lock, merge, split; drag activities between lanes. |
| Hierarchy | Levels 0–4; sub-process nodes drill down into child maps with breadcrumbs; expansion never breaks connections. |
| Analysis | Health score, complexity, cycle/waiting time, handoffs, bottlenecks, manual work & automation opportunities, risk register, uncontrolled risks, suggested KPIs and owners, customer impact, recommendations — deterministic engine that works offline, enriched by AI. |
| Documents | Upload PDF, DOCX, XLSX, CSV, PPTX, TXT/MD — text is extracted and fed to the AI analyst as business context. |
| Versioning | Automatic snapshots before AI edits/layouts/restores, manual snapshots, one-click restore. |
| Exports | PDF report, PNG, SVG, PowerPoint deck, Word documentation, Excel workbook, BPMN 2.0 XML (with lanes + diagram interchange), draw.io/diagrams.net (Visio-compatible), Mermaid, JSON, CSV packs (activities/RACI/KPIs/risks/flows). |

## Architecture

```
User Interface (React + React Flow)
        ↓ REST
Backend API (Express)
        ↓
AI Service Layer (retry · timeout · usage logging · fallback)
        ↓
AI Provider (Gemini | Claude | OpenAI | offline mock — config-switchable)
        ↓
Validation Layer (Zod schema · structural checks · automatic JSON repair)
        ↓
Process Map Generator (auto-layout · surgical edit operations)
        ↓
Editable Diagram (canonical model in SQLite, versioned)
```

Monorepo layout:

```
shared/   Canonical process-map schema (Zod), auto-layout, analysis engine,
          edit operations, exporters (BPMN/Mermaid/drawio/SVG/CSV) — used by
          both server and client.
server/   Express API, SQLite persistence, AI service layer + providers,
          prompt management, document text extraction.
client/   React app: dashboard, project workspace, process editor,
          AI assistant panel, insights, versions, export centre.
docs/     Setup and architecture documentation.
```

## Testing

```bash
npm test           # shared + server + client unit/integration suites (78 tests)

# End-to-end browser drive (needs a built client and a running server):
npm run build && npm start &
npm run test:e2e   # dashboard → AI generation → editing → insights → exports
```

The suites cover: schema validation & repair, layout (incl. 2000-node
performance), analysis, edit operations, every REST endpoint, the full AI
intake/edit/insights flows (deterministic via the mock analyst), provider
fallback on failure, JSON repair of malformed AI output, document extraction,
and every export format.

## Configuration

All configuration lives in `.env` (see `.env.example` for the annotated
list): `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`,
`AI_MAX_RETRIES`, `PORT`, `DATA_DIR`.
