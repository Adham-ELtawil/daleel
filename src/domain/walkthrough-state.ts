export type WalkthroughState = { index: number; playing: boolean; speed: 0.5 | 1 | 2 };
type Action =
  | { type: "step"; delta: -1 | 1 }
  | { type: "scrub"; index: number }
  | { type: "play"; playing: boolean }
  | { type: "speed"; value: WalkthroughState["speed"] };
export const initialWalkthroughState: WalkthroughState = { index: 0, playing: false, speed: 1 };

export function walkthroughReducer(
  state: WalkthroughState,
  action: Action,
  frameCount: number,
): WalkthroughState {
  const last = Math.max(0, frameCount - 1);
  if (action.type === "speed") return { ...state, speed: action.value };
  if (action.type === "play")
    return {
      ...state,
      index: action.playing && state.index === last ? 0 : state.index,
      playing: action.playing && last > 0,
    };
  const index = Math.max(
    0,
    Math.min(last, action.type === "step" ? state.index + action.delta : action.index),
  );
  return { ...state, index, playing: action.type === "step" && state.playing && index < last };
}
