import { EditorState, EditorView, gutterLineClass } from "@uiw/react-codemirror";
import { expect, it } from "vitest";
import { diagnosisHighlights } from "@/src/domain/diagnosis-highlights";
import { DiagnosisSchema, toPublic } from "@/src/llm/schemas/diagnosis";
import fixture from "@/tests/fixtures/llm/diagnosis-a.json";

it.each([0.59, 0.6, 0.93])(
  "decorates only reported CodeMirror lines when confidence=%s",
  (confidence) => {
    const state = EditorState.create({
      doc: "a\nb\nc\nd\ne\nf\ng",
      extensions: [
        diagnosisHighlights({ ...toPublic(DiagnosisSchema.parse(fixture)), confidence }),
      ],
    });
    const decoration = state.facet(EditorView.decorations)[0];
    expect(typeof decoration).not.toBe("function");
    if (typeof decoration === "function") throw new Error("Expected static decorations");
    const positions: number[] = [];
    decoration.between(0, state.doc.length, (from) => {
      positions.push(from);
    });
    expect(positions).toEqual(confidence >= 0.6 ? [state.doc.line(6).from] : []);
    decoration.between(0, state.doc.length, (_from, _to, value) => {
      expect(value.spec.class).toBe("diagnosis-suspect");
    });
    const gutterPositions: number[] = [];
    for (const markers of state.facet(gutterLineClass)) {
      markers.between(0, state.doc.length, (from, _to, marker) => {
        expect(marker.elementClass).toBe("diagnosis-suspect-gutter");
        gutterPositions.push(from);
      });
    }
    expect(gutterPositions).toEqual(positions);
  },
);
