import xml.etree.ElementTree as ET
import html
import os

def create_element(tag, attrib=None, **extra):
    if attrib is None:
        attrib = {}
    else:
        attrib = attrib.copy()
    attrib.update(extra)
    return ET.Element(tag, attrib)

def make_style(styles):
    return ";".join(f"{k}={v}" if v is not None else k for k, v in styles.items())

def generate_drawio():
    root_el = ET.Element('mxfile', host="drawio", version="26.0.0")
    diagram = ET.SubElement(root_el, 'diagram', name="RAIS-Pro Architecture")
    mxGraphModel = ET.SubElement(diagram, 'mxGraphModel', dx="1200", dy="800", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", pageWidth="1100", pageHeight="1100")
    root = ET.SubElement(mxGraphModel, 'root')

    # Root cells
    ET.SubElement(root, 'mxCell', id="0")
    ET.SubElement(root, 'mxCell', id="1", parent="0")

    # Global Style Presets (matching "The Rejection Report" Burnt Orange (#C8421C) & Warm Paper (#F9F6F0))
    # We will use clean, elegant colors:
    # Client = Light Warm Blue (#E8F0F8 / #4A90E2)
    # Server = Warm Orange (#FCECE6 / #C8421C)
    # AI = Soft Purple (#F3E8FA / #8E44AD)
    # DB = Soft Green (#EAF4EA / #27AE60)

    # 1. Swimlane: Client Layer (Browser)
    client_lane_style = make_style({
        "swimlane": None,
        "startSize": "35",
        "fillColor": "#F9F6F0",
        "strokeColor": "#C8421C",
        "fontColor": "#1A1A1A",
        "fontStyle": "1",
        "fontSize": "14",
        "fontFamily": "Georgia",
        "align": "left",
        "spacingLeft": "15"
    })
    ET.SubElement(root, 'mxCell', id="svc_client", value="1. CLIENT LAYER (React 19 / Next.js SPA Client)", style=client_lane_style, vertex="1", parent="1").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="30", y="30", width="1040", height="310")
    )

    # 2. Swimlane: Server/API Layer (Next.js App Router API Routes)
    server_lane_style = make_style({
        "swimlane": None,
        "startSize": "35",
        "fillColor": "#F9F6F0",
        "strokeColor": "#C8421C",
        "fontColor": "#1A1A1A",
        "fontStyle": "1",
        "fontSize": "14",
        "fontFamily": "Georgia",
        "align": "left",
        "spacingLeft": "15"
    })
    ET.SubElement(root, 'mxCell', id="svc_server", value="2. SERVER & INGESTION LAYER (Next.js 16 API Routes & Core Logic)", style=server_lane_style, vertex="1", parent="1").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="30", y="380", width="1040", height="380")
    )

    # 3. Swimlane: AI Layer (Vercel AI Gateway & LLMs)
    ai_lane_style = make_style({
        "swimlane": None,
        "startSize": "35",
        "fillColor": "#F9F6F0",
        "strokeColor": "#C8421C",
        "fontColor": "#1A1A1A",
        "fontStyle": "1",
        "fontSize": "14",
        "fontFamily": "Georgia",
        "align": "left",
        "spacingLeft": "15"
    })
    ET.SubElement(root, 'mxCell', id="svc_ai", value="3. AI LAYER (Resolver Chain)", style=ai_lane_style, vertex="1", parent="1").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="30", y="800", width="500", height="240")
    )

    # 4. Swimlane: Persistence Layer (Supabase / Postgres)
    db_lane_style = make_style({
        "swimlane": None,
        "startSize": "35",
        "fillColor": "#F9F6F0",
        "strokeColor": "#C8421C",
        "fontColor": "#1A1A1A",
        "fontStyle": "1",
        "fontSize": "14",
        "fontFamily": "Georgia",
        "align": "left",
        "spacingLeft": "15"
    })
    ET.SubElement(root, 'mxCell', id="svc_db", value="4. PERSISTENCE LAYER (Supabase Cloud Database)", style=db_lane_style, vertex="1", parent="1").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="570", y="800", width="500", height="240")
    )

    # Nodes in Client Swimlane (parent="svc_client")
    node_style_client = make_style({"rounded": "1", "whiteSpace": "wrap", "html": "1", "fillColor": "#EAF2F8", "strokeColor": "#2980B9", "fontColor": "#1B4F72", "fontStyle": "1", "fontFamily": "Helvetica"})
    node_style_client_alt = make_style({"rounded": "1", "whiteSpace": "wrap", "html": "1", "fillColor": "#FDEDEC", "strokeColor": "#CB4335", "fontColor": "#78281F", "fontStyle": "1", "fontFamily": "Helvetica"})

    # Client Nodes
    # 1. UploadZone
    ET.SubElement(root, 'mxCell', id="c_upload", value="UploadZone.tsx&#xa;(Excel Ingestion)", style=node_style_client, vertex="1", parent="svc_client").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="40", y="60", width="140", height="60")
    )
    # 2. StagingGrid
    ET.SubElement(root, 'mxCell', id="c_staging", value="StagingGrid.tsx&#xa;(Interactive Overrides)", style=node_style_client, vertex="1", parent="svc_client").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="220", y="60", width="160", height="60")
    )
    # 3. Dashboard
    ET.SubElement(root, 'mxCell', id="c_dashboard", value="Dashboard.tsx&#xa;(Serif Num & SVG Charts)", style=node_style_client, vertex="1", parent="svc_client").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="430", y="60", width="180", height="60")
    )
    # 4. BeamOverlay
    ET.SubElement(root, 'mxCell', id="c_beam", value="BeamOverlay.tsx&#xa;(Tracer Beams)", style=node_style_client_alt, vertex="1", parent="svc_client").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="440", y="180", width="160", height="60")
    )
    # 5. ChatPanel
    ET.SubElement(root, 'mxCell', id="c_chat", value="ChatPanel.tsx&#xa;(Ask RAIS Dock)", style=node_style_client, vertex="1", parent="svc_client").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="680", y="60", width="140", height="60")
    )
    # 6. InsightSlide
    ET.SubElement(root, 'mxCell', id="c_slide", value="InsightSlide.tsx&#xa;(Exportable Card)", style=node_style_client, vertex="1", parent="svc_client").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="860", y="60", width="140", height="60")
    )

    # Nodes in Server Swimlane (parent="svc_server")
    node_style_server = make_style({"rounded": "1", "whiteSpace": "wrap", "html": "1", "fillColor": "#FEF5E7", "strokeColor": "#D35400", "fontColor": "#5E2700", "fontStyle": "1", "fontFamily": "Helvetica"})
    node_style_server_pipe = make_style({"rounded": "1", "whiteSpace": "wrap", "html": "1", "fillColor": "#FDF2E9", "strokeColor": "#C8421C", "fontColor": "#C8421C", "fontStyle": "1", "fontFamily": "Helvetica", "strokeWidth": "2"})

    # Server/API Nodes
    # 1. parser.ts
    ET.SubElement(root, 'mxCell', id="s_parser", value="parser.ts&#xa;(SheetJS & Sample Rows)", style=node_style_server, vertex="1", parent="svc_server").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="40", y="60", width="150", height="60")
    )
    # 2. api/analyze
    ET.SubElement(root, 'mxCell', id="s_api_analyze", value="/api/analyze&#xa;(3-Phase Pipeline)", style=node_style_server_pipe, vertex="1", parent="svc_server").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="220", y="60", width="180", height="70")
    )
    # 3. metrics.ts
    ET.SubElement(root, 'mxCell', id="s_metrics", value="metrics.ts&#xa;(inferSheetGraph & Math)", style=node_style_server, vertex="1", parent="svc_server").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="230", y="180", width="160", height="60")
    )
    # 4. dashboard-builder.ts
    ET.SubElement(root, 'mxCell', id="s_builder", value="dashboard-builder.ts&#xa;(Sanity Gate & Reconcile)", style=node_style_server, vertex="1", parent="svc_server").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="430", y="180", width="180", height="60")
    )
    # 5. api/chat
    ET.SubElement(root, 'mxCell', id="s_api_chat", value="/api/chat&#xa;(Insight Answers)", style=node_style_server, vertex="1", parent="svc_server").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="680", y="60", width="140", height="60")
    )
    # 6. api/sessions
    ET.SubElement(root, 'mxCell', id="s_api_sessions", value="/api/sessions&#xa;(CRUD Persistence)", style=node_style_server, vertex="1", parent="svc_server").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="860", y="60", width="140", height="60")
    )
    # 7. api/schema & ingest
    ET.SubElement(root, 'mxCell', id="s_api_schema", value="/api/schema &amp; /api/ingest&#xa;(Manual Override Ledger)", style=node_style_server, vertex="1", parent="svc_server").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="500", y="60", width="150", height="60")
    )

    # Nodes in AI Swimlane (parent="svc_ai")
    node_style_ai = make_style({"rounded": "1", "whiteSpace": "wrap", "html": "1", "fillColor": "#F5EEF8", "strokeColor": "#7D3C98", "fontColor": "#4A235A", "fontStyle": "1", "fontFamily": "Helvetica"})

    # AI Nodes
    # 1. ai.ts
    ET.SubElement(root, 'mxCell', id="a_ai", value="ai.ts&#xa;(tryModels Resolver Chain)", style=node_style_ai, vertex="1", parent="svc_ai").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="40", y="80", width="180", height="60")
    )
    # 2. Vercel AI Gateway
    ET.SubElement(root, 'mxCell', id="a_gateway", value="Vercel AI Gateway&#xa;(Observability &amp; Failover)", style=node_style_ai, vertex="1", parent="svc_ai").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="260", y="50", width="200", height="60")
    )
    # 3. LLM Providers
    ET.SubElement(root, 'mxCell', id="a_providers", value="LLM Backends&#xa;(Anthropic, Gemini, Groq, Ollama)", style=node_style_ai, vertex="1", parent="svc_ai").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="260", y="140", width="200", height="70")
    )

    # Nodes in Database Swimlane (parent="svc_db")
    node_style_db = make_style({"rounded": "1", "whiteSpace": "wrap", "html": "1", "fillColor": "#E8F8F5", "strokeColor": "#117A65", "fontColor": "#0E6251", "fontStyle": "1", "fontFamily": "Helvetica"})
    node_style_db_tables = make_style({"shape": "cylinder3", "whiteSpace": "wrap", "html": "1", "fillColor": "#D1F2EB", "strokeColor": "#16A085", "fontColor": "#0E6251", "fontStyle": "1", "fontFamily": "Helvetica"})

    # DB Nodes
    # 1. supabase.ts
    ET.SubElement(root, 'mxCell', id="d_client", value="supabase.ts&#xa;(Supabase DB Client)", style=node_style_db, vertex="1", parent="svc_db").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="40", y="80", width="160", height="60")
    )
    # 2. Postgres Tables
    ET.SubElement(root, 'mxCell', id="d_tables", value="Postgres Schema&#xa;(registries, stages, events,&#xa;staging_records, sessions)", style=node_style_db_tables, vertex="1", parent="svc_db").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, x="250", y="60", width="210", height="110")
    )

    # Connections / Edges
    edge_style = make_style({"edgeStyle": "orthogonalEdgeStyle", "rounded": "1", "orthogonalLoop": "1", "jettySize": "auto", "html": "1", "strokeColor": "#5D6D7E", "strokeWidth": "1.5"})
    edge_style_main = make_style({"edgeStyle": "orthogonalEdgeStyle", "rounded": "1", "orthogonalLoop": "1", "jettySize": "auto", "html": "1", "strokeColor": "#C8421C", "strokeWidth": "2"})
    edge_style_dashed = make_style({"edgeStyle": "orthogonalEdgeStyle", "rounded": "1", "orthogonalLoop": "1", "jettySize": "auto", "html": "1", "strokeColor": "#7F8C8D", "strokeWidth": "1.5", "dashed": "1"})

    # 1. UploadZone -> parser.ts (sends raw files)
    ET.SubElement(root, 'mxCell', id="e_upload_parser", value="Sends files", style=edge_style, edge="1", parent="1", source="c_upload", target="s_parser").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 2. parser.ts -> /api/analyze (sends parsed summaries + samples)
    ET.SubElement(root, 'mxCell', id="e_parser_api", value="SheetSummary + rows", style=edge_style, edge="1", parent="1", source="s_parser", target="s_api_analyze").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 3. /api/analyze -> metrics.ts (Phase 1/2)
    ET.SubElement(root, 'mxCell', id="e_api_metrics", value="Compute metrics", style=edge_style_main, edge="1", parent="1", source="s_api_analyze", target="s_metrics").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 4. metrics.ts -> dashboard-builder.ts (reconciles and maps)
    ET.SubElement(root, 'mxCell', id="e_metrics_builder", value="Map to KPIs/Charts", style=edge_style_main, edge="1", parent="1", source="s_metrics", target="s_builder").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 5. /api/analyze -> ai.ts (Phase 1 & 3: graph schema & narrative)
    ET.SubElement(root, 'mxCell', id="e_analyze_ai", value="Schema/Narrative", style=edge_style, edge="1", parent="1", source="s_api_analyze", target="a_ai").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 6. ai.ts -> Vercel AI Gateway
    ET.SubElement(root, 'mxCell', id="e_ai_gateway", value="tryModels()", style=edge_style, edge="1", parent="1", source="a_ai", target="a_gateway").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 7. AI Gateway -> Providers
    ET.SubElement(root, 'mxCell', id="e_gateway_providers", value="Failover routing", style=edge_style, edge="1", parent="1", source="a_gateway", target="a_providers").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 8. dashboard-builder.ts -> Dashboard.tsx (Config payload returned to Client)
    ET.SubElement(root, 'mxCell', id="e_builder_client", value="DashboardConfig", style=edge_style_main, edge="1", parent="1", source="s_builder", target="c_dashboard").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 9. Dashboard.tsx -> BeamOverlay.tsx (Coordinates tracer beams client-side)
    ET.SubElement(root, 'mxCell', id="e_dash_beam", value="Traces source", style=edge_style_dashed, edge="1", parent="1", source="c_dashboard", target="c_beam").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 10. ChatPanel -> /api/chat -> ai.ts (Ask RAIS follow-ups)
    ET.SubElement(root, 'mxCell', id="e_chat_api", value="Ask prompt", style=edge_style, edge="1", parent="1", source="c_chat", target="s_api_chat").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    ET.SubElement(root, 'mxCell', id="e_chat_ai", value="Query LLM", style=edge_style, edge="1", parent="1", source="s_api_chat", target="a_ai").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 11. /api/chat -> InsightSlide (renders markdown slide response)
    ET.SubElement(root, 'mxCell', id="e_chat_slide", value="JSON response", style=edge_style, edge="1", parent="1", source="s_api_chat", target="c_slide").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 12. StagingGrid -> /api/schema & /api/ingest
    ET.SubElement(root, 'mxCell', id="e_staging_api", value="Commit overrides", style=edge_style, edge="1", parent="1", source="c_staging", target="s_api_schema").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 13. /api/schema & /api/ingest -> supabase.ts (persists layout & direct logs)
    ET.SubElement(root, 'mxCell', id="e_schema_db", value="Write staging/events", style=edge_style, edge="1", parent="1", source="s_api_schema", target="d_client").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 14. /api/sessions -> supabase.ts (CRUD history)
    ET.SubElement(root, 'mxCell', id="e_sessions_db", value="Saves sessions", style=edge_style, edge="1", parent="1", source="s_api_sessions", target="d_client").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 15. supabase.ts -> Postgres Schema (queries/writes tables)
    ET.SubElement(root, 'mxCell', id="e_client_schema", value="SQL query", style=edge_style, edge="1", parent="1", source="d_client", target="d_tables").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )
    # 16. StagingGrid -> Dashboard (Live classifications reload)
    ET.SubElement(root, 'mxCell', id="e_stage_dash", value="Live reload", style=edge_style_dashed, edge="1", parent="1", source="c_staging", target="c_dashboard").append(
        create_element('mxGeometry', attrib={"as": "geometry"}, relative="1")
    )

    # Write file
    tree = ET.ElementTree(root_el)
    ET.indent(tree, space="  ", level=0)
    out_path = "architecture.drawio"
    tree.write(out_path, encoding="utf-8", xml_declaration=True)
    print(f"Successfully generated {out_path}")

if __name__ == "__main__":
    generate_drawio()
