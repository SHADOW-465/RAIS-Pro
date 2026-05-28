"use client";

interface EditorialHeaderProps {
  initials?: string;
  name?: string;
}

/**
 * Editorial masthead for the landing screen. The dashboard uses its own
 * sticky variant (.masthead) — this one is for the upload/landing flow.
 */
export default function EditorialHeader({
  initials = "MI",
  name = "M. Iyer",
}: EditorialHeaderProps) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <header
      style={{
        borderTop: "6px solid var(--ink)",
        borderBottom: "1px solid var(--ink)",
        padding: "20px 0 14px",
        background: "var(--paper)",
      }}
    >
      <div className="shell between">
        <div
          className="flex"
          style={{ alignItems: "baseline", gap: 18, whiteSpace: "nowrap" }}
        >
          <div
            className="serif"
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
            }}
          >
            R<span style={{ color: "var(--accent)" }}>·</span>A
            <span style={{ color: "var(--accent)" }}>·</span>I
            <span style={{ color: "var(--accent)" }}>·</span>S&nbsp;
            <em style={{ fontWeight: 400, fontStyle: "italic" }}>Pro</em>
          </div>
          <div
            className="muted"
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Rejection · Analysis · Intelligence
          </div>
        </div>
        <div
          className="flex gap-4"
          style={{ alignItems: "center", whiteSpace: "nowrap" }}
        >
          <div className="muted mono" style={{ fontSize: 11 }}>
            {today}
          </div>
          <div
            style={{ width: 1, height: 16, background: "var(--hairline-strong)" }}
          />
          <div className="flex gap-2" style={{ alignItems: "center" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--ink)",
                color: "var(--paper)",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--serif)",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {initials}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
