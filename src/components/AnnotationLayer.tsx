import { type MouseEvent, useMemo, useRef, useState } from "react";
import { AnnotationBox } from "./AnnotationBox";
import type { Annotation } from "../types";

type DraftRect = {
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type AnnotationLayerProps = {
  annotations: Annotation[];
  selectedId: string | null;
  interactive: boolean;
  onSelect: (id: string) => void;
  onCreate: (rect: { x: number; y: number; width: number; height: number }) => void;
  onChange: (id: string, patch: Partial<Annotation>) => void;
};

export function AnnotationLayer({
  annotations,
  selectedId,
  interactive,
  onSelect,
  onCreate,
  onChange
}: AnnotationLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DraftRect | null>(null);

  const indexMap = useMemo(() => {
    return new Map<string, number>(annotations.map((item, i) => [item.id, i + 1]));
  }, [annotations]);

  const beginDraft = (event: MouseEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0 || !containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    setDraft({
      startX,
      startY,
      x: startX,
      y: startY,
      width: 0,
      height: 0
    });
  };

  const updateDraft = (event: MouseEvent<HTMLDivElement>) => {
    if (!interactive || !draft || !containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    const x = Math.min(draft.startX, currentX);
    const y = Math.min(draft.startY, currentY);
    const width = Math.abs(currentX - draft.startX);
    const height = Math.abs(currentY - draft.startY);
    setDraft({
      ...draft,
      x,
      y,
      width,
      height
    });
  };

  const finishDraft = () => {
    if (!interactive || !draft) {
      return;
    }
    const minSize = 12;
    if (draft.width >= minSize && draft.height >= minSize) {
      onCreate({
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height
      });
    }
    setDraft(null);
  };

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-20 select-none ${
        interactive ? "cursor-crosshair" : "pointer-events-none"
      }`}
      onMouseDown={interactive ? beginDraft : undefined}
      onMouseMove={interactive ? updateDraft : undefined}
      onMouseUp={interactive ? finishDraft : undefined}
      onMouseLeave={interactive ? finishDraft : undefined}
    >
      {annotations.map((annotation) => (
        <AnnotationBox
          key={annotation.id}
          annotation={annotation}
          index={indexMap.get(annotation.id) ?? 0}
          selected={annotation.id === selectedId}
          interactive={interactive}
          onSelect={() => onSelect(annotation.id)}
          onChange={onChange}
        />
      ))}
      {draft && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-blue-500 bg-blue-300/15"
          style={{
            left: draft.x,
            top: draft.y,
            width: draft.width,
            height: draft.height
          }}
        />
      )}
    </div>
  );
}
