# AutoAnalyst

### AI-Assisted Business Intelligence (Offline-First MVP)

AutoAnalyst is an offline-first business intelligence platform built to reduce repetitive analytics work — exports, cleaning, chart building, and summary writing — so analysts can focus on decisions instead of dashboards.

> Built as a product-strategy driven MVP for Indian MSMEs and early-stage teams.

---

# The Problem

Business analysts spend **60–70% of their time** on:

* Cleaning messy Excel exports
* Rebuilding the same charts every week
* Writing repetitive summaries
* Switching between tools (Excel → Power BI → Docs)

This delays decision-making and increases operational friction.

---

# The Solution

AutoAnalyst automates early-stage analysis.

Upload a dataset → Get:

* Smart schema detection
* Auto-generated dashboards
* KPI cards
* Natural-language summary
* Offline AI chat
* SQL sandbox
* GST & Retail health previews

All running locally with an offline-first architecture.

---

# Architecture Overview

```
1. FILE UPLOAD
   └─ PapaParse streams CSV / XLSX
   └─ Loaded into DuckDB-WASM

2. SCHEMA DETECTION
   └─ typeof(), distinct count, null %, numeric inference

3. TEMPLATE AUTO-DETECTION
   └─ Tally / Zoho / POS / Bank / Generic sheet

4. AUTO-CHART LOGIC (Heuristics Engine)
   └─ Date + Amount → Line / Area
   └─ Category + Amount → Horizontal Bar
   └─ Single metric → KPI Card
   └─ Geo fields → Bubble map

5. AI ENRICHMENT
   └─ Structured prompt → JSON response
   └─ Insight summary (≤150 words)
   └─ Optional slot-fill mapping

6. DASHBOARD RENDER
   └─ Recharts visual layer
   └─ KPI store + chart store
   └─ Masking & audit logs
```

---

#  Core Features

## 1️⃣ Universal Upload

* CSV / Excel / clipboard paste
* Tally export detection
* Zoho Books format detection
* POS & Bank statement support
* Column mapping preview

---

## 2️⃣ Smart Schema Detection

* Column type inference
* Null distribution
* Distinct counts
* Numeric sanitization (₹ stripping, formatting fixes)
* Auto-mapping guess logic

---

## 3️⃣ Visual Dashboard Engine

* 5–7 auto-generated charts
* KPI cards
* Area / Line / Bar / Pie / Scatter / Table
* Template override & recompute
* AI slot-fill enhancement
* PII masking toggle
* Audit trail logging

---

## 4️⃣ AI Chat

* Natural language query
* Dataset-aware answers
* Business-question prompt injection
* JSON-only structured AI responses

---

## 5️⃣ SQL Sandbox

* DuckDB running in browser (WASM)
* Offline querying
* Transformations without cloud dependency

---

## 6️⃣ Retail Health Check

* Inventory signals
* Margin indicators
* Category mix analysis

---

## 7️⃣ GST Preview

* Tax structure preview
* GST-ready summaries
* India-focused BI layer

---

# Offline-First Privacy Model

AutoAnalyst runs on:

* DuckDB-WASM
* Browser storage
* Tauri sandbox (desktop build)

No raw financial data is sent to the cloud by default.

This creates:

* Data privacy trust
* Competitive differentiation vs SaaS BI tools
* Usability in low-connectivity regions

---

# Product Design Principles

### Make it useful in 5 minutes

The MVP is built around immediate feedback after upload.

### Be honest about AI limitations

AI does not guess financial meaning without SQL validation.

### Hybrid Rule + AI System

* Heuristics engine for speed
* AI layer for explanation
* Deterministic chart logic

### Show Trade-offs

* Not a full Power BI replacement
* Focused on early-stage insight automation
* Scope limited to 5–7 charts per dataset

---

# ⚙ Tech Stack

| Layer           | Technology                        |
| --------------- | --------------------------------- |
| Frontend        | React + TypeScript                |
| Desktop Runtime | Tauri                             |
| Data Engine     | DuckDB-WASM                       |
| Parsing         | PapaParse + XLSX                  |
| Charts          | Recharts                          |
| State           | Zustand                           |
| UI              | Radix UI                          |
| AI Layer        | OpenAI-compatible (Groq / Gemini) |

---

# Why This Project Matters

AutoAnalyst is positioned between:

| Traditional BI            | AutoAnalyst                 |
| ------------------------- | --------------------------- |
| Requires SQL skills       | Works with natural language |
| Cloud-dependent           | Offline-first               |
| Expensive per seat        | Lightweight MVP             |
| Manual dashboard creation | Auto-generated              |

It complements tools like Power BI by automating the early 60% of analysis work.

---

#  Expected Impact

* Reduce analysis prep time by 50%+
* Enable offline financial analytics
* Democratize BI for non-technical business owners
* Support MSMEs with India-first features (GST, Tally)

---

#  MVP Scope Control

Version 1 intentionally includes:

* Max 5–7 charts per dataset
* Structured AI summary under 150 words
* Deterministic template mapping
* No complex forecasting yet

This prevents feature bloat and ensures performance.

---

# 🛠 Installation (Dev)

```bash
# Data processing
npm install @duckdb/duckdb-wasm
npm install papaparse
npm install xlsx

# Visualization
npm install recharts

# AI
npm install openai

# UI
npm install @radix-ui/react-dialog
npm install @radix-ui/react-tabs
npm install lucide-react

# State
npm install zustand
```

Set API key (PowerShell):

```bash
$env:GROQ_API_KEY="YOUR_KEY"
$env:GROQ_MODEL="llama-3.3-70b-versatile"
vercel dev
```

---

# 📚 Key Learning Areas

* Client-side database architecture (DuckDB WASM)
* Prompt engineering for structured JSON outputs
* Deterministic heuristics vs probabilistic AI
* Product-market fit for Indian MSMEs
* Offline-first UX constraints

---

# 🚀 Future Roadmap

* WhatsApp Insight Cards (PNG export)
* Mapping memory per user
* Multi-client workspace (for CAs)
* Forecasting layer (Prophet / trend projection)
* Voice-to-insight interface
* Saved dashboard views
* Automated smart alerts

---

# 🎯 Positioning

AutoAnalyst is not just a dashboard tool.

It is a:

* Co-Operating System for small business analytics
* AI-augmented decision assistant
* Offline analytics engine for emerging markets

---

# 👤 Author Perspective

Built as a portfolio-level product combining:

* Product strategy
* Systems thinking
* Frontend architecture
* AI integration
* Market positioning

---










