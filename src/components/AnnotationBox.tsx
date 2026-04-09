import { Rnd } from "react-rnd";
import type { Annotation } from "../types";

type AnnotationBoxProps = {
  annotation: Annotation;
  index: number;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
  onChange: (id: string, patch: Partial<Annotation>) => void;
};

export function AnnotationBox({
  annotation,
  index,
  selected,
  interactive,
  onSelect,
  onChange
}: AnnotationBoxProps) {
  return (
    <Rnd
      bounds="parent"
      size={{ width: annotation.width, height: annotation.height }}
      position={{ x: annotation.x, y: annotation.y }}
      disableDragging={!interactive}
      enableResizing={interactive}
      onDragStop={(_, d) => onChange(annotation.id, { x: d.x, y: d.y })}
      onResizeStop={(_, __, ref, ___, position) => {
        onChange(annotation.id, {
          x: position.x,
          y: position.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight
        });
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={`border-2 ${
        selected ? "border-blue-600" : "border-red-500"
      } ${interactive ? "cursor-move" : "pointer-events-none"} bg-red-500/10`}
    >
      <div className="pointer-events-none absolute -top-6 left-0 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
        #{index}
      </div>
    </Rnd>
  );
}
