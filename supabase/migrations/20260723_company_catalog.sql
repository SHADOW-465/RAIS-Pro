-- Company master catalog: durable plant schema independent of workbook files.
-- Workbook delete must never wipe stages/defects/sizes — only Data Schema /
-- clear-schema may mutate this table.

CREATE TABLE IF NOT EXISTS company_catalog (
  company_id                text PRIMARY KEY,
  stages                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  defects                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  sizes                     jsonb NOT NULL DEFAULT '[]'::jsonb,
  fiscal_year_start_month   int  NOT NULL DEFAULT 4
    CHECK (fiscal_year_start_month >= 1 AND fiscal_year_start_month <= 12),
  updated_at                timestamptz,
  last_merged_from          text
);

ALTER TABLE company_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_catalog_service_role_all ON company_catalog;
CREATE POLICY company_catalog_service_role_all ON company_catalog
  FOR ALL USING (true) WITH CHECK (true);

-- One-time backfill from currently verified MOD rows (merge first-wins per id).
-- Safe to re-run: only inserts companies that have no catalog row yet.
INSERT INTO company_catalog (company_id, stages, defects, sizes, fiscal_year_start_month, updated_at, last_merged_from)
SELECT
  m.company_id,
  COALESCE(
    (
      SELECT jsonb_agg(s ORDER BY s->>'stageId')
      FROM (
        SELECT DISTINCT ON (e.value->>'stageId') e.value AS s
        FROM mods m2
        CROSS JOIN LATERAL jsonb_array_elements(m2.document->'stages') e
        WHERE m2.company_id = m.company_id AND m2.status = 'verified'
        ORDER BY e.value->>'stageId', m2.verified_at DESC NULLS LAST
      ) uniq
    ),
    '[]'::jsonb
  ),
  COALESCE(
    (
      SELECT jsonb_agg(d ORDER BY d->>'defectCode')
      FROM (
        SELECT DISTINCT ON (e.value->>'defectCode') e.value AS d
        FROM mods m2
        CROSS JOIN LATERAL jsonb_array_elements(m2.document->'defects') e
        WHERE m2.company_id = m.company_id AND m2.status = 'verified'
        ORDER BY e.value->>'defectCode', m2.verified_at DESC NULLS LAST
      ) uniq
    ),
    '[]'::jsonb
  ),
  COALESCE(
    (
      SELECT jsonb_agg(sz ORDER BY sz->>'sizeId')
      FROM (
        SELECT DISTINCT ON (e.value->>'sizeId') e.value AS sz
        FROM mods m2
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m2.document->'sizes', '[]'::jsonb)) e
        WHERE m2.company_id = m.company_id AND m2.status = 'verified'
        ORDER BY e.value->>'sizeId', m2.verified_at DESC NULLS LAST
      ) uniq
    ),
    '[]'::jsonb
  ),
  COALESCE(
    (
      SELECT (m2.document->>'fiscalYearStartMonth')::int
      FROM mods m2
      WHERE m2.company_id = m.company_id AND m2.status = 'verified'
      ORDER BY m2.verified_at DESC NULLS LAST
      LIMIT 1
    ),
    4
  ),
  now(),
  (
    SELECT m2.mod_id
    FROM mods m2
    WHERE m2.company_id = m.company_id AND m2.status = 'verified'
    ORDER BY m2.verified_at DESC NULLS LAST
    LIMIT 1
  )
FROM mods m
WHERE m.status = 'verified'
GROUP BY m.company_id
ON CONFLICT (company_id) DO NOTHING;
