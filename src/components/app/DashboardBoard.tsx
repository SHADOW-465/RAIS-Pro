"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/editorial/Icon";
import { usePersona } from "@/components/app/PersonaContext";
import { visibleCardIds } from "@/lib/access/catalog";
import {
  DASH_COLS,
  clearLayout,
  dropBefore,
  mergeOrder,
  moveCard,
  ordersEqual,
  readLayout,
  writeLayout,
  type MoveDir,
  type StoredLayout,
} from "@/lib/dashboard-layout";

export type DashItemProps = {
  id: string;
  span?: number;
  /** Where the move handle sits so it does not cover a right-side link. */
  handle?: "start" | "end";
  children: React.ReactNode;
};

export function DashItem(_props: DashItemProps): React.ReactElement | null {
  // Board unwraps these; rendering as a child is a no-op fallback.
  return <>{_props.children}</>;
}
DashItem.displayName = "DashItem";

function isDashItem(
  node: React.ReactNode,
): node is React.ReactElement<DashItemProps> {
  return React.isValidElement(node) && node.type === DashItem;
}

function GripIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="5" cy="4" r="1.15" />
      <circle cx="11" cy="4" r="1.15" />
      <circle cx="5" cy="8" r="1.15" />
      <circle cx="11" cy="8" r="1.15" />
      <circle cx="5" cy="12" r="1.15" />
      <circle cx="11" cy="12" r="1.15" />
    </svg>
  );
}

const pill: React.CSSProperties = {
  height: 32,
  borderRadius: 30,
  border: "1px solid var(--border-strong)",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 12px",
  cursor: "pointer",
  boxShadow: "var(--shadow-sm)",
  fontSize: 11.5,
  fontWeight: 600,
  fontFamily: "inherit",
};

/** Masthead control: enter arrange mode, then Fix layout to lock the grid. */
export function DashboardLayoutToggle({
  editing,
  dirty,
  onChangeLayout,
  onFixLayout,
  onReset,
}: {
  editing: boolean;
  dirty: boolean;
  onChangeLayout: () => void;
  onFixLayout: () => void;
  onReset: () => void;
}) {
  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {dirty && (
          <button
            type="button"
            onClick={onReset}
            title="Restore the default card order"
            style={{
              ...pill,
              background: "var(--surface)",
              color: "var(--text-2)",
            }}
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={onFixLayout}
          title="Lock this arrangement and hide the move handles"
          style={{
            ...pill,
            background: "var(--accent)",
            color: "var(--paper)",
            borderColor: "var(--accent)",
          }}
        >
          <Icon name="check" size={13} />
          Fix layout
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onChangeLayout}
      title="Rearrange dashboard cards"
      style={{
        ...pill,
        background: "var(--surface)",
        color: "var(--text-2)",
      }}
    >
      <Icon name="table" size={13} />
      Change layout
    </button>
  );
}

export default function DashboardBoard({
  userKey,
  editing,
  onDirtyChange,
  children,
}: {
  userKey: string;
  editing: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  children: React.ReactNode;
}) {
  // Cards the signed-in role may see. The decision itself is
  // `visibleCardIds` — a pure function with tests — because policy inside a
  // component is policy nothing can check: this project's tests run in node
  // with no jsdom, so a rule written here would never be exercised.
  const { grants } = usePersona();
  const items = useMemo(() => {
    const all = React.Children.toArray(children).filter(isDashItem);
    const allowed = new Set(visibleCardIds(all.map((el) => el.props.id), grants));
    return all.filter((el) => allowed.has(el.props.id));
  }, [children, grants]);

  const present = useMemo(() => items.map((el) => el.props.id), [items]);
  const spans = useMemo(() => {
    const s: Record<string, number> = {};
    for (const el of items) {
      s[el.props.id] = el.props.span ?? DASH_COLS;
    }
    return s;
  }, [items]);
  const byId = useMemo(() => {
    const m = new Map<string, React.ReactElement<DashItemProps>>();
    for (const el of items) m.set(el.props.id, el);
    return m;
  }, [items]);

  const [saved, setSaved] = useState<StoredLayout | null>(() => readLayout(userKey));
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setSaved(readLayout(userKey));
    sync();
    window.addEventListener("moid_dash_layout_changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("moid_dash_layout_changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, [userKey]);

  const order = useMemo(
    () => mergeOrder(saved?.order ?? [], present),
    [saved, present],
  );
  const dirty = useMemo(() => !ordersEqual(order, present), [order, present]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const persist = useCallback(
    (nextOrder: string[]) => {
      const layout: StoredLayout = { order: nextOrder, spans: {} };
      setSaved(layout);
      writeLayout(userKey, layout);
    },
    [userKey],
  );

  const onMove = useCallback(
    (id: string, dir: MoveDir) => {
      const next = moveCard(order, id, dir, spans);
      if (ordersEqual(next, order)) return;
      persist(next);
    },
    [order, persist, spans],
  );

  const onDropOn = useCallback(
    (target: string) => {
      if (!dragging) return;
      const next = dropBefore(order, dragging, target);
      if (!ordersEqual(next, order)) persist(next);
      setDragging(null);
      setOver(null);
    },
    [dragging, order, persist],
  );

  useEffect(() => {
    if (!editing) {
      setDragging(null);
      setOver(null);
    }
  }, [editing]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${DASH_COLS}, minmax(0, 1fr))`,
        gap: "var(--gap-grid)",
      }}
    >
      {order.map((id) => {
        const el = byId.get(id);
        if (!el) return null;
        const span = spans[id] ?? DASH_COLS;
        const handle = el.props.handle ?? "end";
        const isOver = editing && over === id && dragging !== id;
        const isDrag = editing && dragging === id;
        return (
          <div
            key={id}
            data-dash-id={id}
            onDragOver={(e) => {
              if (!editing || !dragging) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over !== id) setOver(id);
            }}
            onDragLeave={() => {
              if (over === id) setOver(null);
            }}
            onDrop={(e) => {
              if (!editing) return;
              e.preventDefault();
              onDropOn(id);
            }}
            style={{
              gridColumn: `span ${span}`,
              minWidth: 0,
              position: "relative",
              opacity: isDrag ? 0.55 : 1,
              outline: isOver
                ? "2px solid var(--accent)"
                : editing
                  ? "1px dashed var(--border-strong)"
                  : "none",
              outlineOffset: editing ? 2 : 0,
              borderRadius: "var(--radius-lg)",
              transition: "opacity 0.15s ease",
            }}
          >
            {editing && (
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  [handle === "start" ? "left" : "right"]: 8,
                  zIndex: 4,
                }}
              >
                <MoveChrome
                  id={id}
                  onMove={onMove}
                  onDragStart={() => setDragging(id)}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                />
              </div>
            )}
            {el.props.children}
          </div>
        );
      })}
    </div>
  );
}

function MoveChrome({
  id,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  id: string;
  onMove: (id: string, dir: MoveDir) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const btn: React.CSSProperties = {
    width: 22,
    height: 22,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: "var(--text-3)",
    cursor: "pointer",
    padding: 0,
    borderRadius: 4,
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        padding: 2,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "var(--shadow-1)",
      }}
    >
      <span
        role="button"
        tabIndex={0}
        draggable
        aria-label={`Drag ${id} to a new position`}
        title="Drag to move"
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", id);
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        style={{ ...btn, cursor: "grab" }}
      >
        <GripIcon />
      </span>
      <button type="button" aria-label="Move up" title="Move up" style={btn} onClick={() => onMove(id, "up")}>
        <Icon name="chevron-up" size={12} />
      </button>
      <button type="button" aria-label="Move down" title="Move down" style={btn} onClick={() => onMove(id, "down")}>
        <Icon name="chevron-down" size={12} />
      </button>
      <button type="button" aria-label="Move left" title="Move left" style={btn} onClick={() => onMove(id, "left")}>
        <Icon name="arrow-left" size={12} />
      </button>
      <button type="button" aria-label="Move right" title="Move right" style={btn} onClick={() => onMove(id, "right")}>
        <Icon name="arrow-right" size={12} />
      </button>
    </div>
  );
}

export { clearLayout };
