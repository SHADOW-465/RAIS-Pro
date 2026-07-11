I actually think this is the point where you should stop adding fixes and **redesign the core**.

From everything I've seen (your requirements, the graph, and Claude's investigation), the current system has become a **patch architecture**.

Every feature works because another small piece compensates for something else.

Examples:

* Disposafe Registry fallback
* `extraDefects`
* Family parsers
* Generic parsers
* Registry fallback
* Schema extraction
* Data entry presets
* Custom preset mode
* Default preset mode

All of these are trying to solve the same problem at different places.

That is why you're getting "data leaks."

---

# The real problem

Right now your pipeline is essentially this

```text
Excel

↓

Parser

↓

Schema

↓

Registry

↓

Data Entry

↓

Analytics
```

But every block modifies the previous block.

Example

Parser

↓

removes columns

↓

Schema

↓

adds defaults

↓

Registry

↓

falls back to Disposafe

↓

Data Entry

↓

adds extraDefects

↓

Analytics

By now you don't know

where the truth actually is.

````

There is no **single source of truth**.

That is the architectural flaw.

---

# My proposal

Forget patches.

Forget fixes.

Forget the existing registry.

Forget hardcoded schemas.

Build around ONE object.

Everything revolves around one thing.

## Manufacturing Ontology Document (MOD)

This becomes the ONLY source of truth.

---

## Step 1

Parser

ONLY reads.

Never decides.

Never ignores.

Never renames.

Never deletes.

It produces

```json
{
    workbook:{
        sheets:[
            {
                headers:[],
                rows:[],
                mergedCells:[],
                formulas:[],
                formatting:[]
            }
        ]
    }
}
````

Literally

Excel

as JSON.

Nothing else.

---

## Step 2

Profiler

Reads the JSON.

Produces

```json
{
    workbook_profile:{
        sheets:[
            {
                columns:[
                    {
                        name:"Reject Qty",
                        datatype:"integer",
                        uniqueness:...
                        neighbours:[...]
                    }
                ]
            }
        ]
    }
}
```

Still

No decisions.

---

## Step 3

LLM Entity Resolver

This is where MiniCPM comes.

Input

```json
{
"profile":...
}
```

Prompt

> Identify every manufacturing entity.
>
> Never ignore any field.
>
> If uncertain,
>
> assign confidence.

Output

```json
{
entities:[
{
original:"Reject Qty",

canonical:"REJECTED_QTY",

confidence:0.99
},

{
original:"Pin Hole",

canonical:"DEFECT",

subcategory:"PIN_HOLE",

confidence:0.95
}
]
}
```

---

## Step 4

Verification

Staging Page

Shows

```text
Excel Header

↓

Canonical

↓

Confidence

↓

Reason

↓

Verified
```

User clicks

Accept.

Done.

---

## Step 5

Manufacturing Ontology Document

Now create

ONE file.

```json
{
company:"Disposafe",

workbook:"April",

stages:[...],

entities:[...],

relationships:[...],

aliases:[...],

formulas:[...],

dimensions:[...],

validation:[...]
}
```

THIS

becomes

the only thing

saved.

---

No registry.

No presets.

No hardcoded schema.

Nothing.

---

Everything reads

THIS.

---

# Data Entry

Instead of

building

a preset

it simply asks

```text
Ontology

↓

Build UI.
```

Since ontology knows

columns

groups

header rows

merged cells

types

dropdowns

validation

relationships

it generates

the Excel

exactly.

---

# Analytics

Analytics never reads Excel.

Analytics reads

Ontology.

---

# Dashboard

Dashboard never reads parser.

Dashboard reads

Ontology.

---

# View Source

Ontology already stores

```text
Workbook

↓

Sheet

↓

Cell

↓

Column

↓

Entity
```

Done.

---

# Ask RAIS

Never reads Excel.

Reads Ontology.

---

# CAPA

Reads Ontology.

---

# AI

Reads Ontology.

---

# Registry

Doesn't exist anymore.

Instead

Company Knowledge

contains

```text
Aliases

↓

Mappings

↓

Ontology

↓

History
```

---

# Decision Engine

Now

Python

takes

Ontology

↓

Rules

↓

ML

↓

MiniCPM

↓

Recommendations

---

# My file structure

```
src/

core/

    parser/

    profiler/

    ontology/

        entity_resolver/

        verifier/

        ontology_builder/

        ontology_store/

    analytics/

    decision/

        rules/

        ml/

        llm/

ui/

    staging/

    data-entry/

    dashboard/

shared/

    models/

        ontology.ts

        entities.ts

        workbook.ts
```

---

# Delete

I would honestly remove

```
Disposafe Registry

Default Schema

Fallback Schema

Preset Defaults

Hardcoded Defects

Hardcoded Stages

Hardcoded Captures

Hardcoded Data Entry Templates
```

The company itself

becomes

the template.

---

# The MOST important thing

Right now

your pipeline

stores

```
Schema
```

Wrong.

It should store

```
Knowledge
```

Schema

is only

columns.

Knowledge

contains

* columns
* stages
* defects
* relationships
* formulas
* aliases
* validation
* provenance
* business meaning

That's what every module should consume.

---

# Finally, here's the architecture I'd build

```text
                      Excel Upload
                           │
                           ▼
                 Workbook Reader (TS)
        (lossless extraction - no decisions)
                           │
                           ▼
                 Workbook Profiler (TS)
        (structure, data types, context, relationships)
                           │
                           ▼
         MiniCPM Entity Resolver + Rule Engine
        (semantic mapping to canonical ontology)
                           │
                           ▼
            Staging Verification (Human-in-the-loop)
     (review mappings, confidence, relationships, formulas)
                           │
                           ▼
          Manufacturing Ontology Document (Source of Truth)
                           │
      ┌──────────────┬──────────────┬──────────────┐
      ▼              ▼              ▼              ▼
 Data Entry      Analytics      Dashboard     View Source
      │              │              │              │
      └──────────────┴──────────────┴──────────────┘
                           │
                           ▼
            Decision Engine (Python Rules + ML)
                           │
                           ▼
          MiniCPM (Explain, CAPA, Ask RAIS, Reports)
```

## One architectural change I would make

I would **eliminate the idea of "presets" as a special concept**.

Instead, every uploaded workbook produces a **Manufacturing Ontology Document**. That document *is* the preset, the schema, the mapping, the data-entry template, and the analytics contract.

Every downstream module consumes the same document.

That gives you a true **single source of truth**, removes fallback chains and hidden registry dependencies, and makes the system much easier to reason about and extend. It's a bigger refactor than patching the current code, but it addresses the root architectural issue rather than another symptom.


