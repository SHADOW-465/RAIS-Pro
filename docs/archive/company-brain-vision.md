# THE COMPANY BRAIN — Active Cognitive Architecture & Vision Spec
*Version 1.0 · Technical Strategy & Agentic Architecture · June 2026*

This document outlines the vision, strategic value, and technical implementation specifications for evolving **RAIS/MO!D** from a passive quality analytics tool into a **living Company Brain (Enterprise Cognitive OS)**. It addresses the problem of institutional knowledge decay, details the Core-Harness-Agent layers, specifies the SQL schemas for cognitive tables, and defines offline root-cause recommendation workflows.

---

## 1. The Startup Thesis: Solving Institutional Knowledge Decay

Traditional manufacturing plants operate with fragmented, undocumented institutional memory. 
* **The Problem:** The daily operations, exception overrides, and quality workarounds live inside the heads of a few senior quality managers and supervisors. When a senior operator leaves, their diagnostic knowledge disappears. The factory is forced to relearn process tolerances through expensive scrap losses and audit scares.
* **The Solution:** Evolve the analytics engine into a **Company Brain** — a system that acts as a "living super employee." Every time a supervisor corrects a spreadsheet typo, adjudicates a mass-balance alert, or writes a root-cause CAPA ticket, the system learns. It stores this knowledge in an offline semantic memory graph to assist and train future operators.
* **The Long-Term Pivot:** By proving this cognitive model at Disposafe’s medical device plant, the core learning engine can be verticalized into other Tamil Nadu manufacturing sectors (automotive, textiles, and engineering) under the **LUCID** framework.

---

## 2. Three-Layer Cognitive Taxonomy

The system architecture separates the deterministic code from the adaptable, learning components to ensure stability and compliance.

```
                    THE COGNITIVE LAYERS
  
  ┌────────────────────────────────────────────────────────┐
  │ 1. THE IMMUTABLE KERNEL                                │
  │ - Strict SQL constraints   - Yield & OEE formulations  │
  │ - 6 production dispositions- Transaction ledgers       │
  └──────────────────────────┬─────────────────────────────┘
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2. THE DECLARATIVE HARNESS                             │
  │ - Dynamic YAML/JSON configs- Alert threshold parameters │
  │ - Process flow ontologies  - Standard operating SOPs   │
  └──────────────────────────┬─────────────────────────────┘
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 3. THE COGNITIVE AGENTIC LAYER                         │
  │ - Adjudication memory      - Dynamic rulebook generator│
  │ - Vector-based CAPA memory - Local inference (Ollama)  │
  └────────────────────────────────────────────────────────┘
```

### Layer 1: The Immutable Kernel (Deterministic Operations)
These core modules cannot be modified by the AI. They guarantee database transactional safety, mathematical precision, and FDA/CDSCO compliance audits:
* **The Event Ledger:** Strict transactional records mapping production inputs to the 6 canonical dispositions (`Accept`, `Reject`, `Rework`, `Hold`, `Scrap`, `Downgrade`).
* **Yield Formulations:** Unalterable code functions for calculating stage First Pass Yield (FPY), line Rolled Throughput Yield (RTY), and progressive COPQ scrap costs.
* **Data Sanitization Constraints:** Database-level rules that prevent negative rejection values and enforce structure checks.

### Layer 2: The Declarative Harness (Adaptable Configs)
The AI reads and modifies these JSON/YAML parameters to adjust UI behavior, terminology, and process boundaries without changing the underlying code:
* **Process Flow Map:** An array defining the sequence, cost weight, and inspection steps of the production line (e.g. mapping the 23 steps in `FBC FLOW CHART.pdf`).
* **SPC Threshold Limits:** Upper Control Limits (UCL), Lower Control Limits (LCL), and Nelson Rules sensitivity rules.
* **Standard Operating Procedures (SOPs):** Defect corrective instructions mapped to specific stages and failure modes.

### Layer 3: The Cognitive Agentic Layer (Institutional Memory)
This is the learning engine that builds the "Company Brain" through three loops:
1. **Adjudication Memory Loop:** When a supervisor resolves an anomaly (e.g., bypassing a mass-balance check due to a drying chamber delay), the AI generates a new declarative rule in the `process_rulebook` table, white-listing this specific process deviation to prevent future false alerts.
2. **Data-Ingestion Self-Correction Loop:** The system monitors manual Excel cell corrections. If it detects that a supervisor repeatedly modifies a mapped column header, the AI updates the ingestion regex translation mapping config file.
3. **Semantic CAPA Graph Loop:** Closed CAPA tickets (problem statement, fishbone diagram, 5-Why root cause, and final corrective action) are compiled, embedded into vector coordinates, and linked in a local semantic database.

---

## 3. Database Schema for Cognitive Tables

To support the learning loops, the Supabase PostgreSQL database is extended with the following four tables. Save these to your database migration files:

```sql
-- 1. Process Rulebook (Stores AI-generated and human-approved overrides)
CREATE TABLE process_rulebook (
    id SERIAL PRIMARY KEY,
    rule_type TEXT NOT NULL,          -- 'ALLOW_CARRYOVER', 'IGNORE_OUTLIER', 'MAPPED_HEADER'
    stage_name TEXT NOT NULL REFERENCES stage_cost_weights(stage_name),
    condition_params JSONB NOT NULL,   -- e.g. {"max_carryover_pct": 0.05, "duration_hours": 24}
    allowed_tolerance REAL DEFAULT 0.0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Adjudication Logs (Traces how anomalies were resolved)
CREATE TABLE adjudication_logs (
    id SERIAL PRIMARY KEY,
    finding_description TEXT NOT NULL,
    adjudication_type TEXT NOT NULL,  -- 'MISTAKE', 'INTENTIONAL', 'SYSTEM_BYPASS'
    resolved_by UUID REFERENCES auth.users(id),
    resolution_notes TEXT NOT NULL,
    associated_rule_id INTEGER REFERENCES process_rulebook(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. CAPA Memory (Stores root-cause vectors for offline recommendations)
-- Note: In pure air-gapped setups, pgvector is used.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE capa_memory (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    defect_type TEXT NOT NULL,
    stage_name TEXT NOT NULL REFERENCES stage_cost_weights(stage_name),
    problem_description TEXT NOT NULL,
    fishbone_root_causes TEXT[] NOT NULL, -- Category-based reasons [Material, Method, Machine]
    five_whys TEXT[] NOT NULL,            -- Array of the 5 sequential whys
    corrective_action TEXT NOT NULL,      -- Final resolution step
    resolved_by UUID REFERENCES auth.users(id),
    embedding_vector vector(384) NOT NULL -- 384-dimension vector from local BAAI/bge-small-en model
);

-- 4. Ingestion Mappings (Updates regex templates dynamically)
CREATE TABLE ingestion_mappings (
    id SERIAL PRIMARY KEY,
    raw_header_pattern TEXT NOT NULL UNIQUE, -- The messy Excel string (e.g. 'Appearance Rejections')
    mapped_stage_name TEXT NOT NULL REFERENCES stage_cost_weights(stage_name),
    usage_count INTEGER NOT NULL DEFAULT 1,
    last_validated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

---

## 4. Agent Execution Workflows (The Learning Loops)

### Loop A: Outlier Resolution & Semantic Search Recommendation
When a process yield drops below the UCL threshold:
1. **Detection:** The system registers an SPC out-of-control alert at Stage 9 (Visual Inspection) due to a spike in `Thin Spod` defects.
2. **Analysis & Vector Call:** The Next.js API client queries the local vector database using the embedding of the alert context:
```sql
-- Semantic search for similar past resolutions
SELECT id, problem_description, corrective_action, 1 - (embedding_vector <=> :current_alert_embedding) AS similarity
FROM capa_memory
WHERE stage_name = 'Visual Insp.' AND defect_type = 'Thin Spod'
ORDER BY similarity DESC
LIMIT 1;
```
3. **Recommendation:** On the Quality Engineer’s dashboard, the system renders a recommendation card:
   - *"Similar anomaly occurred on 18 May. Root cause: Compound viscosity dropped due to temperature drop. Resolved by: Adjusting latex dipping tank heating element to 45°C. Similarity match: 94%."*

### Loop B: Adjudication-to-Rulebook Learning
When the ingestion validator flags an integrity breach (e.g., Checked Qty exceeds previous stage Accepted Qty):
1. **Queue:** The daily record is locked in the Adjudication Queue.
2. **Human Resolve:** The supervisor reviews the split screen, identifies that a carryover batch was released, and clicks **"Accept Carryover Deviation"**. They input the explanation: *"Batch FBC-402 cured late due to oven repair, released today."*
3. **AI Rule Compilation:** The local LLM processes the resolution text, structures it into JSON parameters, and inserts it into the `process_rulebook` table:
   - `rule_type`: `'ALLOW_CARRYOVER'`
   - `condition_params`: `{"allowed_excess": 800, "reason": "oven repair"}`
4. **Auto-bypass:** Next time a similar variance occurs under identical parameters, the system references the rulebook, automatically passes the ingestion, and logs: *"Checked count variance within rule parameters (Rule ID: 14) — Auto-bypassed."*

---

## 5. Security & Privacy: Local AI Enforcement

To satisfy Disposafe's security boundaries (Option A: Air-Gapped Network):

* **Embedding Generation:** We run a lightweight embedding model (`BAAI/bge-small-en-v1.5` or `all-MiniLM-L6-v2`) locally on the server using ONNX Runtime. This generates 384-dimension vector embeddings completely offline in under 50ms per sentence, requiring zero outbound API calls.
* **Model Inference:** The Ollama system service serves `Llama-3-8B-Instruct` locally on the GPU workstation. Next.js backend controllers direct all diagnostic prompts locally to `http://localhost:11434/v1`.
* **Zero Telemetry Guarantee:** In the event that a hybrid cloud route is used, the system's outbound proxy enforces strict data masking, ensuring no proprietary raw compound values or operator names leak out of the local network.
