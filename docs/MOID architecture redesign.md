I think you're now at the point where you should **stop writing code** and first produce an **Architecture Design Document (ADD)**. This is exactly how large software teams approach a major refactor.

If you ask Claude to "implement" this directly, it will inevitably miss dependencies. Instead, ask it to **reverse-engineer the current system, design the target architecture, identify every impacted file, and only then generate an implementation plan**.

The redesign isn't just about the parser—it affects the entire application.

The areas that will change include:

* Workbook parser
* Schema extraction
* Entity resolution
* Manufacturing ontology
* Staging & verification
* Registry removal/replacement
* Data entry generation
* Canonical event generation
* Analytics extraction
* Dashboard aggregation
* View Source & provenance
* Ask RAIS
* CAPA
* Reports
* Database schema
* API contracts
* Caching
* Versioning
* Company memory
* LLM integration
* Rule engine
* Permissions
* Migration of existing data

That's why you need a proper design document before touching the code.

---

# This is the prompt I would give Claude

```text
I DO NOT want you to begin implementing this redesign immediately.

This is now a major architectural refactor of the application.

Before changing a single file, I want you to completely reverse-engineer the existing application and produce a comprehensive Architecture Design Document (ADD) for the new system.

Think like a Principal Software Architect redesigning a production manufacturing platform.

The existing codebase has evolved through many iterations and now contains multiple fallback layers, hardcoded company-specific logic, duplicated responsibilities, and hidden dependencies. Rather than continuing to patch the system, I want to redesign the architecture around a single canonical source of truth while preserving all existing business functionality.

This document should become the blueprint for the entire rewrite.

────────────────────────────────────────

OBJECTIVE

Design a new architecture where:

• The parser performs only lossless extraction.
• Every uploaded workbook is represented by a Manufacturing Ontology Document (MOD).
• No hardcoded company schemas exist.
• No hardcoded registries exist.
• No default presets exist.
• Every downstream module consumes the canonical ontology rather than workbook-specific terminology.
• Entity Resolution uses a hybrid approach (rules + LLM + user verification).
• Human verification happens inside the existing Staging & Review page.
• Verified mappings become company knowledge and are reused automatically.
• Data Entry becomes a generated view of the verified ontology.
• Analytics operate only on canonical entities.
• Decision Intelligence consumes analytics, not raw Excel.

────────────────────────────────────────

FIRST TASK

Completely reverse engineer the current project.

Build dependency graphs similar to the existing graph report.

Identify:

• Every major module
• Every responsibility
• Every dependency
• Every API
• Every shared model
• Every database table
• Every registry
• Every parser
• Every analytics extractor
• Every dashboard pipeline
• Every data flow

Do not skip anything.

────────────────────────────────────────

THEN

Design the new architecture.

I expect a proper architecture document.

Include:

1. Current Architecture

2. Problems with Current Architecture

3. Root causes

4. Proposed Architecture

5. Data Flow

6. Control Flow

7. Database Design

8. API Design

9. Shared Models

10. File Structure

11. Entity Resolution

12. Manufacturing Ontology

13. Company Knowledge Base

14. Rule Engine

15. LLM Layer

16. Analytics Layer

17. Dashboard Layer

18. Data Entry Layer

19. View Source Layer

20. CAPA Layer

21. Ask RAIS

22. Permissions

23. Versioning

24. Caching

25. Migration Plan

26. Testing Plan

27. Rollback Plan

────────────────────────────────────────

MANUFACTURING ONTOLOGY

The Manufacturing Ontology Document (MOD) becomes the single source of truth.

Everything should consume the MOD.

The parser should never delete data.

The parser should never classify.

The parser should never infer.

It should only perform lossless extraction.

Entity Resolution performs semantic understanding.

User verification confirms mappings.

The verified ontology is stored.

Every downstream system consumes that ontology.

────────────────────────────────────────

DATABASE REDESIGN

Design the required database changes.

Show:

• New tables
• Removed tables
• Modified tables
• Relationships
• Foreign keys
• Version history
• Company alias storage
• Ontology storage
• Workbook storage
• Schema versions
• Mapping history
• Verification history
• Audit logs
• Company knowledge
• Rule versions

Also explain how existing data will be migrated without losing information.

────────────────────────────────────────

DATA ENTRY

Redesign Data Entry completely.

Data Entry must no longer depend on hardcoded presets.

Instead:

Verified Ontology

↓

Generated Spreadsheet

↓

User Entry

↓

Validation

↓

Canonical Manufacturing Events

↓

Analytics

Explain every transformation.

────────────────────────────────────────

ANALYTICS

Determine every analytics extractor that currently reads workbook-specific schema.

Refactor them conceptually to consume canonical entities.

Nothing should reference workbook headers anymore.

Explain:

Current

↓

Future

for every analytics module.

────────────────────────────────────────

ENTITY RESOLUTION

Design a hybrid resolver.

Priority:

1. Exact Match

2. Company Knowledge

3. Global Manufacturing Ontology

4. Rule Engine

5. LLM Semantic Resolution

6. User Verification

Never allow the LLM to silently modify mappings.

The LLM proposes.

The user verifies.

The system learns.

────────────────────────────────────────

LLM

The LLM should never calculate metrics.

The LLM should never parse Excel.

The LLM receives structured information only.

Describe every LLM responsibility.

Describe every tool call.

Describe every prompt.

Describe every API.

Describe every response model.

────────────────────────────────────────

RULE ENGINE

Design a separate manufacturing rule engine.

Rules must operate only on canonical variables.

No workbook names.

No company names.

No hardcoded terminology.

Rules should support variable substitution and versioning.

────────────────────────────────────────

FILES

For every existing file in the project specify:

KEEP

MODIFY

REPLACE

DELETE

NEW

Explain WHY.

Do not simply list them.

Show dependency impacts.

────────────────────────────────────────

OUTPUTS

Produce documentation similar to the architecture report already generated for this project.

Include:

• Architecture diagrams
• Dependency diagrams
• Sequence diagrams
• Module diagrams
• Database ER diagrams
• File hierarchy
• API contracts
• Data flow diagrams
• Entity relationship maps
• State machines

I want this to become the master redesign document for the next generation of the platform.

Only after this document is complete and internally consistent should implementation begin.
```

## One addition I'd make

Since this is effectively **MO!D v2**, I'd ask Claude to produce **three deliverables**, not one:

1. **Architecture Design Document (ADD)** – the conceptual blueprint.
2. **Technical Design Document (TDD)** – every module, API, database, and file-level change.
3. **Migration Plan** – a phased implementation roadmap showing how to move from the current architecture to the new one without breaking existing functionality.

That gives you a complete "map" of the redesign before any code is changed, making it much easier to review, iterate on, and implement confidently.
