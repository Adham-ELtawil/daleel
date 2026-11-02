// Daleel feature icons drawn with the fun-isometric kit (MIT, see ./LICENSE.txt).
// Daleel feature stickers: diagnose, counterexample, hints, coach. Dark dev-tool palette in palette.json.
import { VIEWS, arc, ellipse, line, pill, poly, rect, ring, spark } from './fun'
import { float, jolt, slide, sparkle, sway, twinkle, twist } from './motions'
import type { Icon, Layer, Motion, Shape, Vec } from './fun'

const LINE = 5
const { tilt: FACE, extrude: EXT } = VIEWS.right
const glow = (parent: string, p: Vec, r: number, m: Motion | ReadonlyArray<Motion>): Layer => ({
  parent, a: p, p, m, shapes: [{ d: spark(p[0], p[1], r), fill: 'white' }],
})
// code lines as flat pills on a dark screen; one may be flagged
const codeLines = (x: number, y: number, widths: number[], gap: number, flag = -1): Shape[] =>
  widths.map((w, i): Shape => ({ d: pill(x + (i % 3 === 1 ? 18 : 0), y + i * gap, w, 12), fill: i === flag ? 'hot' : 'tint', line: false }))

export const diagnose: Icon = {
  name: 'diagnose',
  frames: 180,
  still: 70,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'editor', a: [0, 110], p: [228, 330], m: { ...sway, k: 0.5 }, shapes: [] },
    {
      parent: 'editor',
      tilt: FACE,
      shapes: [
        { d: rect(-140, -130, 280, 240, 22), fill: 'main', depth: 1 },
        { d: rect(-120, -96, 240, 186, 10), fill: 'deep', depth: 0.2 },
        ...[0, 1, 2].map((i): Shape => ({ d: ellipse(-112 + i * 22, -113, 7), fill: i === 0 ? 'hot' : 'tint', line: false })),
        { d: rect(-104, -14, 208, 26, 6), fill: '#3A2333', line: false },
        ...codeLines(-96, -76, [120, 150, 90, 170, 110, 70], 30, 3),
      ],
    },
    { id: 'lens', parent: 'editor', a: [30, -20], p: [110, -112], m: { ...twist, at: 6, k: 0.7 }, shapes: [] },
    {
      parent: 'lens',
      tilt: [-20, 28],
      shapes: [
        { d: poly([[40, 68], [68, 40], [140, 112], [112, 140]], [0, 0, 20, 20]), fill: 'gold', depth: 1 },
        { d: poly([[36, 70], [70, 36], [86, 52], [52, 86]], 5), fill: 'grey', depth: 1 },
        { d: ellipse(0, 0, 62), fill: '#24335E' },
        { d: ring(0, 0, 82, 62), fill: 'white', depth: 1 },
        { d: arc(0, 0, 42, 200, 255) },
      ],
    },
    glow('lens', [-70, -70], 18, sparkle(30)),
  ],
}

export const counterexample: Icon = {
  name: 'counterexample',
  frames: 180,
  still: 70,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'term', p: [236, 268], m: jolt(), shapes: [] },
    {
      parent: 'term',
      tilt: FACE,
      shapes: [
        { d: rect(-140, -118, 280, 226, 22), fill: 'main', depth: 1 },
        { d: rect(-120, -86, 240, 170, 10), fill: 'deep', depth: 0.2 },
        { d: poly([[-102, -60], [-82, -46], [-102, -32]], 2), fill: 'gold', line: false },
        ...codeLines(-74, -52, [110], 0),
        ...codeLines(-100, -10, [150, 120, 80], 30),
      ],
    },
    { id: 'chip', parent: 'term', a: [0, 0], p: [70, 70], m: slide([34, 22], 24, 60, 40), shapes: [] },
    {
      parent: 'chip',
      tilt: FACE,
      shapes: [
        { d: rect(-62, -34, 124, 68, 14), fill: 'white', depth: 0.8 },
        { d: pill(-44, -14, 46, 12), fill: 'gold', line: false },
        { d: pill(10, -14, 32, 12), fill: 'main', line: false },
        { d: pill(-44, 6, 70, 12), fill: 'tint', line: false },
      ],
    },
    {
      parent: 'term',
      a: [118, -118],
      p: [118, -118],
      m: [twinkle(14), twinkle(120, true)],
      shapes: [
        { d: ellipse(118, -118, 36), fill: 'hot', depth: 0.7 },
        { d: line([104, -132], [132, -104]), line: 7 },
        { d: line([132, -132], [104, -104]), line: 7 },
      ],
    },
  ],
}

const GLASS = 'M-58 -70L58 -70L70 60L-70 60Z'
export const hints: Icon = {
  name: 'hints',
  frames: 180,
  still: 70,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'lantern', a: [0, -170], p: [250, 118], m: sway, shapes: [] },
    {
      parent: 'lantern',
      tilt: [-12, 20],
      shapes: [
        { d: ring(0, -134, 46, 32), fill: 'grey', depth: 0.6 },
        { d: rect(-74, -112, 148, 34, 10), fill: 'main', depth: 0.8 },
        { d: poly([[-50, -134], [50, -134], [70, -112], [-70, -112]], 4), fill: 'deep', depth: 0.8 },
        { d: GLASS, fill: 'gold', depth: 1 },
        { d: ellipse(0, -2, 22, 34), fill: 'white', line: false },
        { d: line([-30, -70], [-36, 60]) },
        { d: line([30, -70], [36, 60]) },
        { d: rect(-84, 56, 168, 34, 10), fill: 'main', depth: 0.8 },
        { d: rect(-56, 86, 112, 22, 8), fill: 'deep', depth: 0.6 },
      ],
    },
    glow('lantern', [-118, -60], 22, [twinkle(30), twinkle(120, true)]),
    glow('lantern', [120, -20], 16, [twinkle(40), twinkle(130, true)]),
  ],
}

export const coach: Icon = {
  name: 'coach',
  frames: 180,
  still: 70,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'board', p: [240, 262], m: float, shapes: [] },
    {
      id: 'face',
      parent: 'board',
      tilt: FACE,
      shapes: [
        { d: rect(-150, -116, 300, 232, 22), fill: 'main', depth: 1 },
        { d: rect(-128, -92, 256, 186, 10), fill: 'deep', depth: 0.2 },
        { d: line([-108, 70], [108, 70]), line: 4 },
        ...codeLines(-108, -76, [70, 40], 20),
      ],
    },
    ...([[-84, 70, 'tint'], [-30, 110, 'gold'], [24, 50, 'tint'], [78, 130, 'ok']] as const).map(
      ([x, h, fill], i): Layer => ({
        parent: 'face',
        a: [x, 68],
        p: [x, 68],
        m: { ...float, at: i * 20, k: -0.6 },
        shapes: [{ d: rect(x - 18, 68 - h, 36, h, 6), fill, depth: 0.6 }],
      }),
    ),
    glow('board', [150, -124], 20, [twinkle(40), twinkle(130, true)]),
  ],
}

export const featureIcons = { diagnose, counterexample, hints, coach }
export type FeatureName = keyof typeof featureIcons
// Daleel dark palette: Gutter/Editor bodies, Fog tints, Chalk highlights, Lantern accent
export const DALEEL_PALETTE = {
  main: "#2A3763", deep: "#16213F", tint: "#93A1C2", gold: "#F3B95F", ok: "#7BD9A4",
  hot: "#FF7B8A", white: "#E7ECF6", grey: "#93A1C2", paper: "#E7ECF6", ink: "#060A17",
}
