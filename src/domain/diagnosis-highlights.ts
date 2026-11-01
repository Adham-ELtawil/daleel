import {
  Decoration,
  EditorView,
  GutterMarker,
  gutterLineClass,
  RangeSet,
  type EditorState,
} from "@uiw/react-codemirror";
import type { DiagnosisPublic } from "@/src/llm/schemas/diagnosis";

export function diagnosisHighlights(diagnosis?: DiagnosisPublic) {
  function positions(state: EditorState) {
    const lines = (diagnosis?.confidence ?? 0) >= 0.6 ? diagnosis!.lines : [];
    const numbers = new Set(
      lines.flatMap(({ start, end }) =>
        end >= start && end <= state.doc.lines
          ? Array.from({ length: end - start + 1 }, (_, i) => start + i)
          : [],
      ),
    );
    return [...numbers].sort((a, b) => a - b).map((n) => state.doc.line(n).from);
  }
  return [
    EditorView.decorations.compute(["doc"], (state) =>
      Decoration.set(
        positions(state).map((from) => Decoration.line({ class: "diagnosis-suspect" }).range(from)),
      ),
    ),
    gutterLineClass.compute(["doc"], (state) =>
      RangeSet.of(positions(state).map((from) => suspectGutter.range(from))),
    ),
  ];
}

const suspectGutter = new (class extends GutterMarker {
  elementClass = "diagnosis-suspect-gutter";
})();
