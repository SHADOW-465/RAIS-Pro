# CYBERSECURITY & NETWORK ARCHITECTURE BLUEPRINT
*Version 1.0 · Air-Gapped & Hybrid API Security Specification · June 2026*

This document outlines the security, data privacy, and network integration requirements for deploying **RAIS/MO!D** within **Disposafe Health and Life Care Limited**'s isolated factory network. It addresses strict DNS blocks, air-gapped deployment pathways, data-scrubbing protocols, and whitelist profiles required for IT compliance.

---

## 1. The Conflict: Local Isolation vs. Cloud APIs

Disposafe enforces an isolated manufacturing environment to prevent intellectual property leaks (compounding formulas, production rates) and protect against ransomware. This creates a hard conflict:
* **The Constraint:** No raw production data is allowed to leave the local area network (LAN). Strict firewall rules and DNS sinkholes block standard web domains.
* **The AI Requirement:** Advanced diagnostics (Nelson rules anomalies interpretation, CAPA writing) utilize NVIDIA NIM APIs.
* **The Resolution:** We propose a **Dual-Track Security Architecture**:
  1. **Primary Recommendation:** An on-premise local inference engine running lightweight open-source models (e.g., Llama-3-8B) on a local GPU workstation.
  2. **Secondary Option (Hybrid Whitelisting):** A local forward proxy with strict data scrubbing (de-identification) middleware that filters payloads before whitelisted outbound transit.

---

## 2. Option A: Pure Air-Gapped Architecture (Zero Outbound Traffic)

To achieve 100% compliance with zero data leaks, the application is deployed entirely on a local server within the factory LAN.

```
                     AIR-GAPPED LOCAL NETWORK
  
  ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
  │  Shopfloor PCs  ├───────►│  Local Server   ├───────►│  Local GPU Box  │
  │  (Web Browsers) │  LAN   │  (Next.js App)  │  LAN   │  (vLLM/Ollama)  │
  └─────────────────┘        └────────┬────────┘        └────────┬────────┘
                                      │                          │
                                      ▼                          ▼
                             ┌─────────────────┐        ┌─────────────────┐
                             │    Local DB     │        │  Local Llama3B  │
                             │  (Supabase/PG)  │        │  / Nemotron8B   │
                             └─────────────────┘        └─────────────────┘
```

### Technical Stack for Air-Gapped Inference
* **Model Engine:** `Ollama` or `vLLM` running locally as a system service.
* **Local Model Selection:**
  - `meta-llama/Meta-Llama-3-8B-Instruct`: For general narrative summaries and CAPA ticket formulation.
  - `nvidia/Llama-3-8B-Instruct-Nemotron-Mini-v1`: For mapping structured JSON rejections.
* **Hardware Requirement:** A single desktop workstation equipped with an NVIDIA RTX 4060 Ti (16GB VRAM) or RTX 4070 (12GB VRAM), costing ~₹80,000–₹1,00,000 (a one-time capital expense with zero recurring API costs).
* **Connection String Configuration:**
  - The Next.js API client updates `process.env.NVIDIA_API_KEY` to `local-bypass` and points `BASE_URL` to `http://192.168.1.150:11434/v1` (the local GPU box LAN IP).

---

## 3. Option B: Hybrid Whitelisting & Data Scrubbing Architecture

If local GPU hardware is unavailable and cloud APIs must be used, the system passes all payloads through a **Data De-Identification Middleware** before routing them through an **Nginx Forward Proxy** configured with a strict whitelist.

```
                   HYBRID CLOUD WHITELIST ROUTE
  
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │   Next.js    ├────►│  De-Ident.   ├────►│ Nginx Proxy  ├────►│ NVIDIA Cloud │
  │   Backend    │     │  Middleware  │     │ (Whitelist)  │     │     API      │
  └──────────────┘     └──────────────┘     └──────┬───────┘     └──────────────┘
                                                   │
                                                   ▼ (Block All Other domains)
                                              [DNS Sinkhole]
```

### A. Data De-Identification Middleware
Before sending text to a cloud model, the system must redact all sensitive context (SKU names, batch numbers, operator names, and precise yields).
We implement a two-way mapping dictionary (Pseudonymization):

```typescript
// src/lib/security/scrubber.ts

interface ScrubbingMap {
  [key: string]: string;
}

export class DataScrubber {
  private tokenMap: ScrubbingMap = {};
  private reverseMap: ScrubbingMap = {};
  private counter = 0;

  // Mask sensitive factory tokens
  public scrub(text: string, sensitiveTerms: string[]): string {
    let scrubbedText = text;
    for (const term of sensitiveTerms) {
      if (!this.tokenMap[term]) {
        this.counter++;
        const token = `[VAL-ID-${this.counter}]`;
        this.tokenMap[term] = token;
        this.reverseMap[token] = term;
      }
      const regex = new RegExp(term, 'g');
      scrubbedText = scrubbedText.replace(regex, this.tokenMap[term]);
    }
    return scrubbedText;
  }

  // Restore the tokens in the AI output
  public restore(text: string): string {
    let restoredText = text;
    for (const [token, term] of Object.entries(this.reverseMap)) {
      restoredText = restoredText.replace(new RegExp(escapeRegExp(token), 'g'), term);
    }
    return restoredText;
  }
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

* **Scrubbing Scope:**
  - SKU names (e.g. `Latex Foley Catheter Fr12` $\rightarrow$ `[VAL-ID-1]`).
  - Raw numbers of Checked/Accepted units (e.g. `12,456` checked $\rightarrow$ replace with percentages `100% checked`, `8.1% rejected`). The AI only needs percentages to run Nelson Rules or write CAPAs; it does not need raw batch volumes.
  - Operators and Machines (e.g. `Operator Ramesh` $\rightarrow$ `[VAL-ID-2]`, `Machine M3` $\rightarrow$ `[VAL-ID-3]`).

---

### B. Network Whitelisting Profile for IT Audits

Provide this configuration profile to the Disposafe IT Network team to whitelist the specific diagnostic ports:

#### 1. Outbound API Traffic Whitelist
* **Target Domain:** `api.nvcf.nvidia.com` (NVIDIA NIM Cloud Services)
* **IP Range:** Whitelist specific NVIDIA gateway IPs (refer to NVIDIA network docs for updated subnet masks).
* **Port:** `443` (HTTPS)
* **Protocol:** TCP
* **SSL Inspection Bypass:** The firewall must allow outbound encrypted traffic to NVIDIA's domain without SSL decrypt-inspection, as the API requests require native TLS handshakes.

#### 2. Forward Proxy Configuration (Squid/Nginx)
Set up Nginx as a local forward proxy. It intercepts outbound requests on the server and blocks any destination domain that is not whitelisted:

```nginx
# /etc/nginx/nginx.conf
http {
    server {
        listen 8888; # Local proxy port

        # Only allow requests to NVIDIA NIM Cloud
        location / {
            resolver 1.1.1.1;
            proxy_method POST;
            proxy_pass https://api.nvcf.nvidia.com;
            
            # Prevent headers containing local server IP leaks
            proxy_set_header X-Real-IP "";
            proxy_set_header X-Forwarded-For "";
        }
    }
}
```

---

## 4. Compliance: FDA 21 CFR Part 11 & Data Integrity

To ensure that the security architecture satisfies international medical device audit criteria:

1. **Local Audit Trail Logging:**
   - Every read/write operation is logged to the local PostgreSQL database containing: User UUID, Action, Client IP (local LAN address), Timestamp, and Hash of modified row.
   - Database audits are locked (read-only for all roles except system DBA).
2. **Transport Encryption:**
   - Even within the local LAN, all connections between the browser terminals and the local Next.js server run over HTTPS (using a self-signed certificate registered on the factory's root certificate authorities).
3. **No Training Guarantee:**
   - Under the NVIDIA enterprise API contract, all whitelisted payload headers must contain the parameter `'X-Disable-Telemetry': 'true'` to ensure no prompt data is stored or cached in cloud logs.
