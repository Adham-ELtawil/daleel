import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

async function reducer() {
  const path = resolve("src/domain/walkthrough-state.ts");
  expect(existsSync(path), "Walkthrough state behavior is missing").toBe(true);
  return (await import(path)) as typeof import("@/src/domain/walkthrough-state");
}
it("starts paused at frame zero at normal speed", async () => {
  expect((await reducer()).initialWalkthroughState).toEqual({ index: 0, playing: false, speed: 1 });
});
it("steps through frames, clamps both ends and stops playback at the end", async () => {
  const { walkthroughReducer: reduce, initialWalkthroughState: initial } = await reducer();
  expect(reduce(initial, { type: "step", delta: -1 }, 3)).toEqual(initial);
  const next = reduce(initial, { type: "step", delta: 1 }, 3);
  expect(next.index).toBe(1);
  const playing = reduce(next, { type: "play", playing: true }, 3);
  const final = reduce(playing, { type: "step", delta: 1 }, 3);
  expect(final).toEqual({ index: 2, playing: false, speed: 1 });
  expect(reduce(final, { type: "step", delta: 1 }, 3)).toEqual(final);
  expect(initial).toEqual({ index: 0, playing: false, speed: 1 });
});
it("pauses on scrub and clamps the scrubber to valid frames", async () => {
  const { walkthroughReducer: reduce } = await reducer();
  const state = { index: 1, playing: true, speed: 2 as const };
  expect(reduce(state, { type: "scrub", index: 99 }, 4)).toEqual({
    index: 3,
    playing: false,
    speed: 2,
  });
  expect(reduce(state, { type: "scrub", index: -9 }, 4).index).toBe(0);
  expect(reduce(state, { type: "scrub", index: 2 }, 4).index).toBe(2);
});
it.each([0.5, 1, 2] as const)(
  "changes speed to %sx without changing the frame or playback",
  async (value) => {
    const { walkthroughReducer: reduce } = await reducer();
    expect(reduce({ index: 1, playing: true, speed: 1 }, { type: "speed", value }, 4)).toEqual({
      index: 1,
      playing: true,
      speed: value,
    });
  },
);
it("replays from the beginning after the final frame and stays paused for a single frame", async () => {
  const { walkthroughReducer: reduce } = await reducer();
  const final = { index: 3, playing: false, speed: 1 as const };
  expect(reduce(final, { type: "play", playing: true }, 4)).toEqual({
    index: 0,
    playing: true,
    speed: 1,
  });
  expect(reduce(final, { type: "play", playing: false }, 4)).toEqual(final);
  expect(reduce({ ...final, index: 0 }, { type: "play", playing: true }, 1).playing).toBe(false);
});
