import { Decoration, EditorView } from "@uiw/react-codemirror";
import type { DiagnosisPublic } from "@/src/llm/schemas/diagnosis";

export function diagnosisHighlights(diagnosis?: DiagnosisPublic) {
  return EditorView.decorations.compute(["doc"], (state) => {
    const lines = (diagnosis?.confidence ?? 0) >= 0.6 ? diagnosis!.lines : [];
    const numbers = new Set(
      lines.flatMap(({ start, end }) =>
        end >= start && end <= state.doc.lines
          ? Array.from({ length: end - start + 1 }, (_, i) => start + i)
          : [],
      ),
    );
    return Decoration.set(
      [...numbers].map((n) =>
        Decoration.line({ class: "bg-amber-500/20" }).range(state.doc.line(n).from),
      ),
      true,
    );
  });
}
