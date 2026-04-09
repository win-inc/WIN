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
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: (rect: { x: number; y: number; width: number; height: number }) => void;
  onChange: (id: number, patch: Partial<Annotation>) => void;
};

export function AnnotationLayer({
  annotations,
  selectedId,
  onSelect,
  onCreate,
  onChange
}: AnnotationLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DraftRect | null>(null);

  const indexMap = useMemo(() => {
    return new Map<number, number>(annotations.map((item, i) => [item.id, i + 1]));
  }, [annotations]);

  const beginDraft = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !containerRef.current) {
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
    if (!draft || !containerRef.current) {
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
    if (!draft) {
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
      className="absolute inset-0 z-20 cursor-crosshair select-none"
      onMouseDown={beginDraft}
      onMouseMove={updateDraft}
      onMouseUp={finishDraft}
      onMouseLeave={finishDraft}
    >
      {annotations.map((annotation) => (
        <AnnotationBox
          key={annotation.id}
          annotation={annotation}
          index={indexMap.get(annotation.id) ?? 0}
          selected={annotation.id === selectedId}
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
