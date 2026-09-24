import { handleHttpError, inflyClient } from "@api";
import {
  useChallenges,
  useUpdateChallengeAvatarMutation,
  useUpdateChallengePrerequisitesMutation,
} from "@api/challenge";
import { useGame, useSelfSolves } from "@api/game";
import { uploadMedia } from "@api/media";
import {
  useCreateMilestoneMutation,
  useDeleteMilestoneMutation,
  useMilestones,
  useUpdateMilestoneMutation,
} from "@api/milestone";
import { Dialog } from "@ark-ui/solid";
import { mediaPath } from "@lib/utils/media";
import type { Milestone } from "@models/milestone";
import { useNavigate } from "@solidjs/router";
import { isAdminOfGame } from "@storage/game";
import { fullTheme, t } from "@storage/theme";
import { addToast } from "@storage/toast";
import Avatar from "@widgets/avatar";
import Button from "@widgets/button";
import Card from "@widgets/card";
import Divider from "@widgets/divider";
import Input from "@widgets/input";
import LoadingTips from "@widgets/loading-tips";
import Popover from "@widgets/popover";
import Tag from "@widgets/tag";
import clsx from "clsx";
import { DateTime } from "luxon";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  untrack,
} from "solid-js";
import { Portal } from "solid-js/web";

const NODE_W = 224;
const MILESTONE_H = 88;
const CHALLENGE_H = 48;
const GAP_X = 120;
const GAP_Y = 24;
const PAD = 24;

type NodeKind = "challenge" | "milestone";

type GNode = {
  key: string;
  kind: NodeKind;
  id: number;
  name: string;
  h: number;
};

type NodePos = { x: number; y: number };

type Edge = { from: string; to: string };

function edgeKey(edge: Edge) {
  return `${edge.from}->${edge.to}`;
}

function probeColor(cls: string, fallback: string, property: "color" | "backgroundColor" = "color") {
  const el = document.createElement("span");
  el.className = cls;
  el.style.display = "none";
  document.body.appendChild(el);
  const color = getComputedStyle(el)[property] || fallback;
  el.remove();
  return color;
}

/** Blends `fg` over `bg` at the given alpha into an opaque rgb() color, so
 * overlapping translucent strokes never bleed into each other. */
function mixColors(fg: string, bg: string, alpha: number) {
  const parse = (color: string) => color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  const f = parse(fg);
  const b = parse(bg);
  const mix = (i: number) => Math.round(f[i] * alpha + b[i] * (1 - alpha));
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

/** Raises the HSL lightness of an rgb() color by `amount` (0-1). */
function lightenColor(color: string, amount: number) {
  const [r, g, b] = (color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]).slice(0, 3).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let sat = 0;
  if (d !== 0) {
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  const l2 = Math.min(1, l + amount);
  const hue = (p: number, q: number, sector: number) => {
    const t = sector < 0 ? sector + 1 : sector > 1 ? sector - 1 : sector;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q2 = l2 < 0.5 ? l2 * (1 + sat) : l2 + sat - l2 * sat;
  const p2 = 2 * l2 - q2;
  return `rgb(${Math.round(hue(p2, q2, h + 1 / 3) * 255)}, ${Math.round(hue(p2, q2, h) * 255)}, ${Math.round(
    hue(p2, q2, h - 1 / 3) * 255
  )})`;
}

const REGION_GAP = 96;
// nodes snap to this virtual grid while dragging; the canvas dot grid uses
// the same step, and gap centers between columns form the vertical grid
// lines that edge bends align to
const GRID_Y = 24;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
// fitting the view never zooms in beyond 100%
const MAX_FIT_ZOOM = 1;
const WHEEL_ZOOM_SPEED = 0.0015;
// pointer moves below this distance count as clicks instead of drags
const DRAG_THRESHOLD_PX = 4;
// how far from an edge a click still selects it
const EDGE_HIT_TOLERANCE_PX = 8;
// stroke width of all edges, in world px
const EDGE_WIDTH = 8;
// unsolved track colors follow the theme so the tracks hug the background:
// light theme uses #dddddd/#aaaaaa, dark theme uses #444444/#777777
// the >>>>> texture: chevrons repeating along the track at this spacing
const EDGE_TEXTURE_SPACING = 11;
const EDGE_TEXTURE_LEN = 6;
const EDGE_TEXTURE_HALF_W = 4;
// edges entering the same column gap run on parallel tracks spaced this far
// apart instead of overlapping on the gap center line; the same spacing fans
// edges out of a shared source port
const EDGE_TRACK_SPACING = EDGE_WIDTH + 4;
// solved tracks brighten the success color by this lightness
const SOLVED_LIGHTNESS_BOOST = 0.2;
// tracks carry a 1px outline in the divider color
const EDGE_BORDER_EXTRA = 2;
// non-ancestor edges fade to this alpha while a node is selected
const DIM_ALPHA = 0.12;
// the port hit zone is a vertical strip of this width spanning the full node
// height, centered on the node border
const PORT_STRIP_W = 16;
// the inner port square matches the edge corner squares
const PORT_SQUARE = EDGE_WIDTH + 2;
// connection drags snap to in-ports within this world-px radius
const PORT_SNAP_RADIUS = 40;
// keep horizontal edge segments this far away from node boxes
const EDGE_NODE_MARGIN_PX = 8;
// upper bound for the monotone edge/node overlap resolution loop
const MAX_OVERLAP_ITERATIONS = 16;
// canvas theme fallbacks, used until the probed theme colors resolve
const FALLBACK_TEXT_COLOR = "#888888";
const FALLBACK_BG_COLOR = "#111111";
const FALLBACK_PRIMARY_COLOR = "#3b82f6";
const FALLBACK_SUCCESS_COLOR = "#22c55e";
const FALLBACK_DIVIDER_COLOR = "rgba(136, 136, 136, 0.1)";

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/// Node keys are `<kind-prefix><id>` strings; `c` challenges, `m` milestones.
function nodeKindOf(key: string): NodeKind {
  return key.startsWith("c") ? "challenge" : "milestone";
}

function nodeIdOf(key: string): number {
  return Number(key.slice(1));
}

function heightOf(key: string) {
  return nodeKindOf(key) === "challenge" ? CHALLENGE_H : MILESTONE_H;
}

function columnX(column: number) {
  return PAD + column * (NODE_W + GAP_X);
}

function columnOf(x: number) {
  return Math.round((x - PAD) / (NODE_W + GAP_X));
}

function snapX(x: number) {
  return columnX(Math.round((x - PAD) / (NODE_W + GAP_X)));
}

function snapY(y: number) {
  return PAD + Math.round((y - PAD) / GRID_Y) * GRID_Y;
}

type Graph = {
  preds: Map<string, string[]>;
  succs: Map<string, string[]>;
  adjacent: Map<string, string[]>;
};

function pushTo(map: Map<string, string[]>, key: string, value: string) {
  if (!map.has(key)) map.set(key, []);
  map.get(key)?.push(value);
}

function buildGraph(keys: string[], edges: Edge[]): Graph {
  const keySet = new Set(keys);
  const graph: Graph = { preds: new Map(), succs: new Map(), adjacent: new Map() };
  for (const edge of edges) {
    if (!keySet.has(edge.from) || !keySet.has(edge.to)) continue;
    pushTo(graph.preds, edge.to, edge.from);
    pushTo(graph.succs, edge.from, edge.to);
    pushTo(graph.adjacent, edge.from, edge.to);
    pushTo(graph.adjacent, edge.to, edge.from);
  }
  return graph;
}

/** Splits the undirected view of the graph into connected components with
 * more than one node ("trees") and isolated nodes ("singles"). */
function splitComponents(keys: string[], graph: Graph) {
  const visited = new Set<string>();
  const trees: string[][] = [];
  const singles: string[] = [];
  for (const key of keys) {
    if (visited.has(key)) continue;
    const component: string[] = [];
    const queue = [key];
    visited.add(key);
    while (queue.length > 0) {
      const current = queue.pop()!;
      component.push(current);
      for (const next of graph.adjacent.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    component.sort();
    if (component.length > 1) trees.push(component);
    else singles.push(key);
  }
  // trees containing milestones come first, then sorted by first node key
  trees.sort((a, b) => {
    const am = a.some((k) => nodeKindOf(k) === "milestone") ? 0 : 1;
    const bm = b.some((k) => nodeKindOf(k) === "milestone") ? 0 : 1;
    return am - bm || a[0].localeCompare(b[0]);
  });
  return { trees, singles };
}

/** Column assignment for one tree via two fixpoint iterations: a node with
 * predecessors hugs the deepest one (column = deepest predecessor + 1); a
 * source node without predecessors hugs its nearest successor (column =
 * nearest successor - 1). */
function assignColumns(tree: string[], edges: Edge[], graph: Graph): Map<string, number> {
  const treeEdges = edges.filter((e) => tree.includes(e.from) && tree.includes(e.to));

  // earliest possible column (hug predecessors)
  const minLayer = new Map<string, number>(tree.map((key) => [key, 0]));
  for (let i = 0; i < tree.length; i++) {
    let changed = false;
    for (const edge of treeEdges) {
      const next = (minLayer.get(edge.from) ?? 0) + 1;
      if (next > (minLayer.get(edge.to) ?? 0)) {
        minLayer.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const columnOfNode = new Map<string, number>(tree.map((key) => [key, minLayer.get(key) ?? 0]));
  for (let i = 0; i < tree.length; i++) {
    let changed = false;
    for (const key of tree) {
      const keyPreds = graph.preds.get(key) ?? [];
      const keySuccs = graph.succs.get(key) ?? [];
      if (keyPreds.length > 0) {
        const target = Math.max(...keyPreds.map((p) => columnOfNode.get(p) ?? 0)) + 1;
        if (target !== columnOfNode.get(key)) {
          columnOfNode.set(key, target);
          changed = true;
        }
      } else if (keySuccs.length > 0) {
        const target = Math.max(0, Math.min(...keySuccs.map((s) => columnOfNode.get(s) ?? 0)) - 1);
        if (target !== columnOfNode.get(key)) {
          columnOfNode.set(key, target);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return columnOfNode;
}

/** Pass A (left to right): place every column top to bottom, anchoring each
 * node to the lower-median center of its predecessors, and record the slots
 * spanned by long edges as blocked intervals. Mutates `result` and
 * `columnBottom` in place. */
function placeByPredecessors(
  byColumn: Map<number, string[]>,
  graph: Graph,
  columnOfNode: Map<string, number>,
  result: Record<string, NodePos>,
  columnBottom: Map<number, number>,
  regionY: number
): Map<number, { top: number; bottom: number }[]> {
  const blocked = new Map<number, { top: number; bottom: number }[]>();
  for (const column of [...byColumn.keys()].sort((a, b) => a - b)) {
    let y = regionY;
    let firstInRegion = true;
    const members = byColumn.get(column)!;
    // a node prefers to sit directly right of its lower-median predecessor
    // (index floor((count - 1) / 2): two predecessors align with the first,
    // three with the second); nodes sharing the same predecessors or
    // successors get the same anchor and are therefore placed adjacently
    const anchor = new Map<string, number>();
    for (const key of members) {
      const centers = (graph.preds.get(key) ?? [])
        .filter((p) => result[p])
        .map((p) => result[p].y + heightOf(p) / 2)
        .sort((a, b) => a - b);
      if (centers.length > 0) anchor.set(key, centers[Math.floor((centers.length - 1) / 2)]);
    }
    const firstSucc = (key: string) => (graph.succs.get(key) ?? []).sort()[0] ?? "";
    const sortedMembers = [...members].sort(
      (a, b) =>
        (anchor.get(a) ?? Number.POSITIVE_INFINITY) - (anchor.get(b) ?? Number.POSITIVE_INFINITY) ||
        firstSucc(a).localeCompare(firstSucc(b)) ||
        a.localeCompare(b)
    );
    for (const key of sortedMembers) {
      const h = heightOf(key);
      // align by y-center with the anchor predecessor; the first node of a
      // column in this region may rise above regionY for the alignment, as
      // long as it stays clear of the previous region's nodes in this column
      let yPos = firstInRegion
        ? Math.max(
            anchor.has(key) ? (anchor.get(key) ?? 0) - h / 2 : y,
            (columnBottom.get(column) ?? Number.NEGATIVE_INFINITY) + GAP_Y
          )
        : Math.max(y, (anchor.get(key) ?? y + h / 2) - h / 2);
      firstInRegion = false;
      let moved = true;
      while (moved) {
        moved = false;
        for (const interval of (blocked.get(column) ?? []).sort((a, b) => a.top - b.top)) {
          if (yPos < interval.bottom && yPos + h > interval.top) {
            yPos = interval.bottom + GAP_Y;
            moved = true;
          }
        }
      }
      result[key] = { x: columnX(column), y: yPos };
      columnBottom.set(column, yPos + h);
      const center = yPos + h / 2;
      for (const succ of graph.succs.get(key) ?? []) {
        const succColumn = columnOfNode.get(succ) ?? 0;
        for (let crossed = column + 1; crossed < succColumn; crossed++) {
          if (!blocked.has(crossed)) blocked.set(crossed, []);
          blocked.get(crossed)?.push({
            top: center - MILESTONE_H / 2 - GAP_Y / 2,
            bottom: center + MILESTONE_H / 2 + GAP_Y / 2,
          });
        }
      }
      y = yPos + h + GAP_Y;
    }
  }
  return blocked;
}

/** Pass B (right to left, runs once): pull every node toward the
 * lower-median center of its successors; successor attraction wins over the
 * predecessor anchor when they conflict. A move is skipped when it would
 * overlap another node, a spanning edge, or the previous region. */
function pullTowardSuccessors(
  byColumn: Map<number, string[]>,
  tree: string[],
  graph: Graph,
  columnOfNode: Map<string, number>,
  result: Record<string, NodePos>,
  outerBottom: Map<number, number>,
  blocked: Map<number, { top: number; bottom: number }[]>
) {
  for (const column of [...byColumn.keys()].sort((a, b) => b - a)) {
    for (const key of byColumn.get(column)!) {
      const centers = (graph.succs.get(key) ?? []).map((s) => result[s].y + heightOf(s) / 2).sort((a, b) => a - b);
      if (centers.length === 0) continue;
      const h = heightOf(key);
      const newTop = centers[Math.floor((centers.length - 1) / 2)] - h / 2;
      if (Math.abs(newTop - result[key].y) < 1) continue;
      const guard = outerBottom.get(column);
      if (guard !== undefined && newTop < guard + GAP_Y) continue;
      const overlapsNode = tree.some(
        (other) =>
          other !== key &&
          (columnOfNode.get(other) ?? 0) === column &&
          newTop < result[other].y + heightOf(other) &&
          newTop + h > result[other].y
      );
      if (overlapsNode) continue;
      const overlapsEdge = (blocked.get(column) ?? []).some(
        (interval) => newTop < interval.bottom && newTop + h > interval.top
      );
      if (overlapsEdge) continue;
      result[key] = { ...result[key], y: newTop };
    }
  }
}

/** Lays out the full graph from scratch. Connected components (independent
 * multi-way trees) are stacked into separate vertical regions. Within a
 * tree, a node with predecessors hugs them (column = deepest predecessor +
 * 1); a node without predecessors but with successors hugs the nearest
 * successor (column = nearest successor - 1). When an edge spans over
 * intermediate columns, the covered slots in those columns are left empty
 * and following nodes shift down, so long edges never cross a node.
 * Isolated nodes share a trailing single-column region. */
function fullLayout(keys: string[], edges: Edge[]) {
  const graph = buildGraph(keys, edges);
  const { trees, singles } = splitComponents(keys, graph);

  const result: Record<string, NodePos> = {};
  let regionY = PAD;
  // lowest occupied bottom per column across all regions placed so far
  const columnBottom = new Map<number, number>();

  for (const tree of trees) {
    const columnOfNode = assignColumns(tree, edges, graph);

    // place columns left to right; sources of spanning edges are always
    // placed before the intermediate columns they cross
    const byColumn = new Map<number, string[]>();
    for (const key of tree) {
      const column = columnOfNode.get(key) ?? 0;
      if (!byColumn.has(column)) byColumn.set(column, []);
      byColumn.get(column)?.push(key);
    }
    const outerBottom = new Map(columnBottom);
    const blocked = placeByPredecessors(byColumn, graph, columnOfNode, result, columnBottom, regionY);
    pullTowardSuccessors(byColumn, tree, graph, columnOfNode, result, outerBottom, blocked);

    let bottom = regionY;
    for (const key of tree) {
      bottom = Math.max(bottom, result[key].y + heightOf(key));
      const column = columnOfNode.get(key) ?? 0;
      columnBottom.set(
        column,
        Math.max(columnBottom.get(column) ?? Number.NEGATIVE_INFINITY, result[key].y + heightOf(key))
      );
    }
    regionY = bottom + REGION_GAP;
  }

  // isolated nodes share one trailing single-column region
  for (const key of singles.sort()) {
    result[key] = { x: columnX(0), y: regionY };
    regionY += heightOf(key) + GAP_Y;
  }
  return result;
}

/** Places nodes missing from `existing` relative to their already positioned
 * neighbors, leaving every existing (possibly user-dragged) node untouched.
 * The y position prefers the median predecessor's row when it does not
 * overlap existing nodes in the same column. */
function incrementalLayout(keys: string[], edges: Edge[], existing: Record<string, NodePos>) {
  const result = { ...existing };
  const keySet = new Set(keys);
  const missing = keys.filter((key) => !existing[key]).sort();
  for (const key of missing) {
    const placedPreds = edges.filter((e) => e.to === key && keySet.has(e.from) && result[e.from]).map((e) => e.from);
    const succColumns = edges
      .filter((e) => e.from === key && keySet.has(e.to) && result[e.to])
      .map((e) => columnOf(result[e.to].x));
    let column = 0;
    if (placedPreds.length > 0) column = Math.max(...placedPreds.map((p) => columnOf(result[p].x))) + 1;
    else if (succColumns.length > 0) column = Math.max(0, Math.min(...succColumns) - 1);

    const h = heightOf(key);
    const occupants = Object.entries(result)
      .filter(([other]) => other !== key && columnOf(result[other].x) === column)
      .map(([other, pos]) => ({ top: pos.y, bottom: pos.y + heightOf(other) }));
    let bottom = PAD;
    for (const occ of occupants) bottom = Math.max(bottom, occ.bottom + GAP_Y);

    const predCenters = placedPreds.map((p) => result[p].y + heightOf(p) / 2).sort((a, b) => a - b);
    let y = bottom;
    if (predCenters.length > 0) {
      const candidate = predCenters[Math.floor((predCenters.length - 1) / 2)] - h / 2;
      if (candidate >= PAD && occupants.every((occ) => candidate + h <= occ.top || candidate >= occ.bottom + GAP_Y)) {
        y = candidate;
      }
    }
    result[key] = { x: columnX(column), y };
  }
  return result;
}

/** Assigns positions to the nodes missing from `existing`. A fresh page does
 * a full forest-aware layout; nodes added later (e.g. a newly created
 * milestone) are placed incrementally next to their neighbors. */
function autoLayout(keys: string[], edges: Edge[], existing: Record<string, NodePos>) {
  if (Object.keys(existing).length === 0) return fullLayout(keys, edges);
  return incrementalLayout(keys, edges, existing);
}

export default function Milestones(props: { gameId: number }) {
  const navigate = useNavigate();
  const game = useGame({ id: () => props.gameId });
  const challenges = useChallenges({ game_id: () => props.gameId });
  const milestones = useMilestones({ game_id: () => props.gameId, enabled: () => !!game.data });
  const solves = useSelfSolves({ game_id: () => props.gameId });

  const admin = createMemo(() => isAdminOfGame(game.data));
  const solvedIds = createMemo(() => new Set((solves.data ?? []).map((s) => s.challenge_id)));
  const challengeMap = createMemo(() => new Map((challenges.data?.[0] ?? []).map((c) => [c.id, c])));

  const nodes = createMemo<GNode[]>(() => [
    ...(challenges.data?.[0] ?? []).map((c) => ({
      key: `c${c.id}`,
      kind: "challenge" as const,
      id: c.id,
      name: c.name,
      h: CHALLENGE_H,
    })),
    ...(milestones.data ?? []).map((m) => ({
      key: `m${m.id}`,
      kind: "milestone" as const,
      id: m.id,
      name: m.name,
      h: MILESTONE_H,
    })),
  ]);
  const nodeSet = createMemo(() => new Set(nodes().map((n) => n.key)));
  const nodeKeys = createMemo(() => nodes().map((n) => n.key));
  const nodeMap = createMemo(() => new Map(nodes().map((n) => [n.key, n])));

  const baseEdges = createMemo<Edge[]>(() => {
    const result: Edge[] = [];
    for (const c of challenges.data?.[0] ?? []) {
      for (const pre of c.prerequisites ?? []) result.push({ from: `c${pre}`, to: `c${c.id}` });
    }
    for (const m of milestones.data ?? []) {
      for (const pre of m.prerequisites) result.push({ from: `c${pre}`, to: `m${m.id}` });
    }
    return result;
  });

  const [baseline, setBaseline] = createSignal<Edge[]>([]);
  const [edges, setEdges] = createSignal<Edge[]>([]);
  const validEdges = createMemo(() => edges().filter((e) => nodeSet().has(e.from) && nodeSet().has(e.to)));

  // live prerequisite challenge ids of each node, derived from the edge set
  const prerequisitesByNode = createMemo(() => {
    const map = new Map<string, number[]>();
    for (const edge of validEdges()) {
      if (nodeKindOf(edge.from) !== "challenge") continue;
      if (!map.has(edge.to)) map.set(edge.to, []);
      map.get(edge.to)?.push(nodeIdOf(edge.from));
    }
    return map;
  });

  // node selection lives with the graph state: the ancestor chain memo
  // below reads it at creation time
  const [selectedNode, setSelectedNode] = createSignal<string | null>(null);

  // the transitive ancestor chain of the selected node: every predecessor
  // node that can reach it, plus the edges along those chains
  const ancestorChain = createMemo(() => {
    const sel = selectedNode();
    if (!sel) return null;
    const edgeList = validEdges();
    const predsByTarget = new Map<string, string[]>();
    for (const edge of edgeList) pushTo(predsByTarget, edge.to, edge.from);
    const nodes = new Set<string>();
    const stack = [sel];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const pred of predsByTarget.get(current) ?? []) {
        if (nodes.has(pred)) continue;
        nodes.add(pred);
        stack.push(pred);
      }
    }
    const edges = new Set<string>();
    for (const edge of edgeList) {
      if ((nodes.has(edge.to) || edge.to === sel) && nodes.has(edge.from)) edges.add(edgeKey(edge));
    }
    return { nodes, edges, selected: sel };
  });

  const dirty = createMemo(() => {
    const pack = (list: Edge[]) => list.map(edgeKey).sort().join("|");
    return pack(validEdges()) !== pack(baseline().filter((e) => nodeSet().has(e.from) && nodeSet().has(e.to)));
  });

  // follow server state whenever there is no local unsaved edit
  createEffect(
    on(baseEdges, (server) => {
      if (untrack(dirty)) return;
      setBaseline(server);
      setEdges(server);
    })
  );

  // node positions are intentionally session-only: every page open re-runs
  // the auto layout, so admins always preview the same graph players see
  const [positions, setPositions] = createSignal<Record<string, NodePos>>({});

  // layout nodes that do not have a position yet; wait until both queries
  // resolve, otherwise nodes arriving first would be laid out with an empty
  // edge set and pile up in the first column. edges are derived from
  // baseEdges (a pure data memo) instead of the synced edge signal, because
  // the sync effect may run after this one within the same update
  createEffect(
    on(nodeKeys, (keys) => {
      if (!challenges.data || !milestones.data) return;
      const set = untrack(nodeSet);
      const current = untrack(baseEdges).filter((e) => set.has(e.from) && set.has(e.to));
      setPositions((prev) => {
        if (keys.every((key) => prev[key])) return prev;
        return autoLayout(keys, current, prev);
      });
    })
  );

  const [pan, setPan] = createSignal({ x: 0, y: 0 });
  const [zoom, setZoom] = createSignal(1);
  const [connecting, setConnecting] = createSignal<{ from: string; x: number; y: number } | null>(null);
  // the in-port closest to an in-progress connection, snapped on drop
  const [nearPort, setNearPort] = createSignal<string | null>(null);
  const [selectedEdge, setSelectedEdge] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [detailId, setDetailId] = createSignal<number | null>(null);
  const [formOpen, setFormOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Milestone | null>(null);

  const detailMilestone = createMemo(() => milestones.data?.find((m) => m.id === detailId()) ?? null);

  // batch save runs sequentially and reports once, so the per-item toasts and
  // invalidations of the mutation hooks are silenced there
  const updateMilestoneMutation = useUpdateMilestoneMutation({ silenced: true });
  const updatePrerequisitesMutation = useUpdateChallengePrerequisitesMutation({ silenced: true });
  const challengeAvatarMutation = useUpdateChallengeAvatarMutation();
  const milestoneAvatarMutation = useUpdateMilestoneMutation();

  let wrapperRef: HTMLDivElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let cleanupWrapper: (() => void) | undefined;
  const [size, setSize] = createSignal({ w: 0, h: 0 });
  const [colors, setColors] = createSignal({
    content: FALLBACK_TEXT_COLOR,
    muted: FALLBACK_TEXT_COLOR,
    primary: FALLBACK_PRIMARY_COLOR,
    success: FALLBACK_SUCCESS_COLOR,
    divider: FALLBACK_DIVIDER_COLOR,
    edgeBase: "#dddddd",
    edgeTexture: "#aaaaaa",
  });

  function toWorld(clientX: number, clientY: number) {
    const rect = wrapperRef?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan().x) / zoom(),
      y: (clientY - rect.top - pan().y) / zoom(),
    };
  }

  function fitView() {
    if (!wrapperRef) return;
    const ns = nodes();
    if (ns.length === 0) return;
    const pos = positions();
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of ns) {
      const p = pos[node.key];
      if (!p) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + NODE_W);
      maxY = Math.max(maxY, p.y + node.h);
    }
    if (!Number.isFinite(minX)) return;
    const rect = wrapperRef.getBoundingClientRect();
    const bw = maxX - minX + PAD * 2;
    const bh = maxY - minY + PAD * 2;
    const z = clampZoom(Math.min(MAX_FIT_ZOOM, rect.width / bw, rect.height / bh));
    setZoom(z);
    setPan({
      x: (rect.width - (maxX - minX) * z) / 2 - minX * z,
      y: (rect.height - (maxY - minY) * z) / 2 - minY * z,
    });
  }

  function zoomBy(factor: number) {
    if (!wrapperRef) return;
    const rect = wrapperRef.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;
    const z = zoom();
    const nz = clampZoom(z * factor);
    const wx = (mx - pan().x) / z;
    const wy = (my - pan().y) / z;
    setZoom(nz);
    setPan({ x: mx - wx * nz, y: my - wy * nz });
  }

  function edgeGeometry(edge: Edge, pos: Record<string, NodePos> = positions()) {
    const from = nodeMap().get(edge.from);
    const to = nodeMap().get(edge.to);
    if (!from || !to || !pos[from.key] || !pos[to.key]) return null;
    const key = edgeKey(edge);
    return {
      x1: pos[from.key].x + NODE_W,
      // edges fan out from the source port so parallel departures stay apart
      y1: pos[from.key].y + from.h / 2 + (edgeFans().get(key) ?? 0),
      x2: pos[to.key].x,
      y2: pos[to.key].y + to.h / 2,
      lane: edgeLanes().get(key) ?? 0,
    };
  }

  function pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const lenSq = (bx - ax) * (bx - ax) + (by - ay) * (by - ay) || 1;
    const u = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lenSq));
    return Math.hypot(px - (ax + u * (bx - ax)), py - (ay + u * (by - ay)));
  }

  /** Rectilinear (right-angle) elbow segments of an edge in world coords.
   * The vertical segment runs at the center of the column gap right before
   * the target column; since node x positions snap to the column grid, this
   * always lands on the vertical grid line of the gap. */
  function elbowSegments(g: { x1: number; y1: number; x2: number; y2: number; lane?: number }) {
    const mx = g.x2 - GAP_X / 2 + (g.lane ?? 0);
    if (Math.abs(g.y2 - g.y1) < 1) {
      return { segments: [{ ax: g.x1, ay: g.y1, bx: g.x2, by: g.y2 }], corners: [] as { x: number; y: number }[] };
    }
    return {
      segments: [
        { ax: g.x1, ay: g.y1, bx: mx, by: g.y1 },
        { ax: mx, ay: g.y1, bx: mx, by: g.y2 },
        { ax: mx, ay: g.y2, bx: g.x2, by: g.y2 },
      ],
      corners: [
        { x: mx, y: g.y1 },
        { x: mx, y: g.y2 },
      ],
    };
  }

  // corridor tracks: edges entering the same column gap get parallel lane
  // offsets (per target, since edges sharing a target are one logical
  // corridor), ordered by target y so adjacent targets take adjacent lanes
  const edgeLanes = createMemo(() => {
    const lanes = new Map<string, number>();
    const pos = positions();
    const targetsByCorridor = new Map<number, string[]>();
    for (const edge of validEdges()) {
      const target = pos[edge.to];
      if (!target) continue;
      const corridor = columnOf(target.x);
      const list = targetsByCorridor.get(corridor) ?? [];
      if (!list.includes(edge.to)) {
        list.push(edge.to);
        targetsByCorridor.set(corridor, list);
      }
    }
    for (const [corridor, targets] of targetsByCorridor) {
      targets.sort((a, b) => (pos[a]?.y ?? 0) - (pos[b]?.y ?? 0) || a.localeCompare(b));
      const n = targets.length;
      for (const [i, target] of targets.entries()) {
        const offset = (i - (n - 1) / 2) * EDGE_TRACK_SPACING;
        for (const edge of validEdges()) {
          if (edge.to === target && columnOf(pos[edge.to]?.x ?? 0) === corridor) {
            lanes.set(edgeKey(edge), offset);
          }
        }
      }
    }
    return lanes;
  });

  // fan-out: edges leaving the same source port start at staggered heights
  // so their first horizontal runs stay parallel instead of stacked
  const edgeFans = createMemo(() => {
    const fans = new Map<string, number>();
    const pos = positions();
    const bySource = new Map<string, Edge[]>();
    for (const edge of validEdges()) {
      if (!pos[edge.from] || !pos[edge.to]) continue;
      const list = bySource.get(edge.from) ?? [];
      list.push(edge);
      bySource.set(edge.from, list);
    }
    for (const [source, edges] of bySource) {
      edges.sort((a, b) => (pos[a.to]?.y ?? 0) - (pos[b.to]?.y ?? 0) || a.to.localeCompare(b.to));
      const from = nodeMap().get(source);
      const maxFan = from ? from.h / 2 - EDGE_WIDTH : 0;
      const n = edges.length;
      for (const [i, edge] of edges.entries()) {
        const raw = (i - (n - 1) / 2) * EDGE_TRACK_SPACING;
        fans.set(edgeKey(edge), Math.max(-maxFan, Math.min(maxFan, raw)));
      }
    }
    return fans;
  });

  function hitTestEdge(world: { x: number; y: number }): string | null {
    const threshold = EDGE_HIT_TOLERANCE_PX / zoom();
    for (const edge of validEdges()) {
      const g = edgeGeometry(edge);
      if (!g) continue;
      for (const seg of elbowSegments(g).segments) {
        if (pointToSegmentDistance(world.x, world.y, seg.ax, seg.ay, seg.bx, seg.by) < threshold) {
          return edgeKey(edge);
        }
      }
    }
    return null;
  }

  // keep edges from passing behind nodes: when an edge's horizontal segment
  // crosses a slot occupied by a node, that node is pushed down until the
  // line sits at the vertical center of the gap between the node and the
  // node above it (cascading within its column). pushes are monotone
  // downward, so the resolution always converges; the node currently being
  // dragged is exempt and wins over the lines
  let draggingKey: string | null = null;
  createEffect(() => {
    const edgeList = validEdges();
    const pos = positions();
    const nm = nodeMap();
    if (edgeList.length === 0) return;
    const adjusted: Record<string, NodePos> = {};
    for (const [key, p] of Object.entries(pos)) adjusted[key] = { ...p };
    let changed = false;
    const margin = EDGE_NODE_MARGIN_PX;
    for (let iter = 0; iter < MAX_OVERLAP_ITERATIONS; iter++) {
      let moved = false;
      for (const edge of edgeList) {
        const g = edgeGeometry(edge, adjusted);
        if (!g) continue;
        for (const seg of elbowSegments(g).segments) {
          if (Math.abs(seg.ay - seg.by) > 1) continue;
          const segY = seg.ay;
          const minX = Math.min(seg.ax, seg.bx);
          const maxX = Math.max(seg.ax, seg.bx);
          for (const node of nm.values()) {
            if (node.key === edge.from || node.key === edge.to || node.key === draggingKey) continue;
            const np = adjusted[node.key];
            if (!np) continue;
            if (np.x + NODE_W <= minX + 2 || np.x >= maxX - 2) continue;
            if (segY <= np.y - margin || segY >= np.y + node.h + margin) continue;
            // center the line in the gap between this node and the one above
            const column = columnOf(np.x);
            const above = [...nm.values()]
              .filter((other) => other.key !== node.key && columnOf(adjusted[other.key]?.x ?? 0) === column)
              .map((other) => ({ bottom: (adjusted[other.key]?.y ?? 0) + other.h }))
              .filter((entry) => entry.bottom <= np.y + margin)
              .sort((a, b) => b.bottom - a.bottom)[0];
            const targetTop = above ? Math.max(2 * segY - above.bottom, segY + margin) : segY + margin;
            if (np.y < targetTop) {
              np.y = targetTop;
              moved = true;
              changed = true;
            }
          }
        }
      }
      // cascade: restore spacing inside each column after the pushes
      const columns = new Map<number, GNode[]>();
      for (const node of nm.values()) {
        const np = adjusted[node.key];
        if (!np) continue;
        const column = columnOf(np.x);
        if (!columns.has(column)) columns.set(column, []);
        columns.get(column)?.push(node);
      }
      for (const members of columns.values()) {
        members.sort((a, b) => adjusted[a.key].y - adjusted[b.key].y);
        let prevBottom = Number.NEGATIVE_INFINITY;
        for (const node of members) {
          const np = adjusted[node.key];
          if (node.key !== draggingKey && np.y < prevBottom + GAP_Y) {
            np.y = prevBottom + GAP_Y;
            moved = true;
            changed = true;
          }
          prevBottom = Math.max(prevBottom, np.y + node.h);
        }
      }
      if (!moved) break;
    }
    // only commit when the result actually differs: pushes are monotone, so
    // an equal result means the layout already converged and a redundant
    // setPositions here could feed the effect back into itself
    if (changed) {
      const prev = positions();
      const identical =
        Object.keys(adjusted).length === Object.keys(prev).length &&
        Object.keys(adjusted).every((key) => {
          const a = adjusted[key];
          const b = prev[key];
          return b && a.x === b.x && a.y === b.y;
        });
      if (!identical) setPositions(adjusted);
    }
  });

  function draw() {
    // read every reactive source before the guards, otherwise the effect
    // tracks nothing when the canvas has not mounted yet and never redraws
    const { w, h } = size();
    const z = zoom();
    const p = pan();
    const c = colors();
    const edgeList = validEdges();
    const selected = selectedEdge();
    const solved = solvedIds();
    const conn = connecting();
    positions();
    nodeMap();
    const canvas = canvasRef;
    if (!canvas) return;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const step = GRID_Y * z;
    if (step >= 8) {
      ctx.fillStyle = c.content;
      ctx.globalAlpha = 0.08;
      const startX = (((p.x % step) + step) % step) - step;
      const startY = (((p.y % step) + step) % step) - step;
      for (let x = startX; x < w; x += step) {
        for (let y = startY; y < h; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // edges sharing a successor converge into a single trunk in the column
    // gap before the target
    const byTarget = new Map<string, Edge[]>();
    for (const edge of edgeList) {
      if (!byTarget.has(edge.to)) byTarget.set(edge.to, []);
      byTarget.get(edge.to)?.push(edge);
    }
    const chain = ancestorChain();
    const isSolved = (edge: Edge) => nodeKindOf(edge.from) === "challenge" && solved.has(nodeIdOf(edge.from));
    // track palette: unsolved tracks are gray with a lighter >>>>> texture,
    // solved tracks use success with a lightness-boosted texture
    const trackStyleOf = (solvedFlag: boolean, isSelected: boolean) => {
      if (isSelected) return { base: c.primary, texture: lightenColor(c.primary, SOLVED_LIGHTNESS_BOOST) };
      if (solvedFlag) return { base: c.success, texture: lightenColor(c.success, SOLVED_LIGHTNESS_BOOST) };
      return { base: c.edgeBase, texture: c.edgeTexture };
    };
    // while a node is selected, edges outside its ancestor chain fade out
    const alphaOf = (key: string) => (chain ? (chain.edges.has(key) ? 1 : DIM_ALPHA) : 1);

    type TrackSegment = { ax: number; ay: number; bx: number; by: number };
    // every track dimension is world units scaled by the zoom, so zooming
    // reads as zooming into the drawing
    const strokeTrack = (segments: TrackSegment[], color: string, alpha: number, width: number) => {
      ctx.beginPath();
      ctx.moveTo(segments[0].ax * z + p.x, segments[0].ay * z + p.y);
      for (const seg of segments) {
        ctx.lineTo(seg.bx * z + p.x, seg.by * z + p.y);
      }
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width * z;
      ctx.stroke();
    };

    // the >>>>> texture: chevrons repeating along every segment, pointing
    // along the flow direction
    const drawChevrons = (
      segments: { ax: number; ay: number; bx: number; by: number }[],
      color: string,
      alpha: number
    ) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      for (const seg of segments) {
        const dx = seg.bx - seg.ax;
        const dy = seg.by - seg.ay;
        const len = Math.hypot(dx, dy);
        if (len < EDGE_TEXTURE_SPACING) continue;
        const dirX = dx / len;
        const dirY = dy / len;
        const perpX = -dirY;
        const perpY = dirX;
        const tip = (EDGE_TEXTURE_LEN / 2) * z;
        const half = EDGE_TEXTURE_HALF_W * z;
        for (let d = EDGE_TEXTURE_SPACING / 2; d < len; d += EDGE_TEXTURE_SPACING) {
          const cx = (seg.ax + dirX * d) * z + p.x;
          const cy = (seg.ay + dirY * d) * z + p.y;
          ctx.beginPath();
          ctx.moveTo(cx + dirX * tip, cy + dirY * tip);
          ctx.lineTo(cx - dirX * tip + perpX * half, cy - dirY * tip + perpY * half);
          ctx.lineTo(cx - dirX * tip - perpX * half, cy - dirY * tip - perpY * half);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    const drawMember = (edge: Edge) => {
      const g = edgeGeometry(edge);
      if (!g) return;
      const elbow = elbowSegments(g);
      const bundled = (byTarget.get(edge.to)?.length ?? 0) > 1;
      // bundled members stop at the junction; the trunk is drawn once below.
      // a straight member (same height) has no distinct trunk segment and is
      // drawn in full — the trunk simply overlays it
      const segments = bundled && elbow.segments.length > 1 ? elbow.segments.slice(0, -1) : elbow.segments;
      if (segments.length === 0) return;
      const key = edgeKey(edge);
      const style = trackStyleOf(isSolved(edge), key === selected);
      const alpha = alphaOf(key);
      // 1px divider-colored outline under the base stroke
      strokeTrack(segments, c.divider, alpha, EDGE_WIDTH + EDGE_BORDER_EXTRA);
      strokeTrack(segments, style.base, alpha, EDGE_WIDTH);
      // corner squares join the segments (the junction at the target side is
      // owned by the trunk)
      const corners = bundled ? elbow.corners.slice(0, -1) : elbow.corners;
      const halfCorner = (EDGE_WIDTH / 2 + 1) * z;
      ctx.fillStyle = style.base;
      ctx.globalAlpha = alpha;
      for (const corner of corners) {
        const cx = corner.x * z + p.x;
        const cy = corner.y * z + p.y;
        ctx.fillRect(cx - halfCorner, cy - halfCorner, halfCorner * 2, halfCorner * 2);
      }
      drawChevrons(segments, style.texture, alpha);
      ctx.globalAlpha = 1;
    };

    // solved edges first, unsolved on top
    for (const edge of edgeList.filter((e) => isSolved(e))) drawMember(edge);
    for (const edge of edgeList.filter((e) => !isSolved(e))) drawMember(edge);

    // shared trunks: the final horizontal hop into the target, drawn once
    for (const members of byTarget.values()) {
      if (members.length < 2) continue;
      const g = edgeGeometry(members[0]);
      if (!g) return;
      const style = trackStyleOf(
        members.every(isSolved),
        members.some((e) => edgeKey(e) === selected)
      );
      const alpha = alphaOf(edgeKey(members[0]));
      const trunkSegment = { ax: g.x2 - GAP_X / 2 + g.lane, ay: g.y2, bx: g.x2, by: g.y2 };
      strokeTrack([trunkSegment], c.divider, alpha, EDGE_WIDTH + EDGE_BORDER_EXTRA);
      strokeTrack([trunkSegment], style.base, alpha, EDGE_WIDTH);
      const halfJunction = (EDGE_WIDTH / 2 + 1) * z;
      ctx.fillStyle = style.base;
      ctx.globalAlpha = alpha;
      const jx = trunkSegment.ax * z + p.x;
      const jy = trunkSegment.ay * z + p.y;
      ctx.fillRect(jx - halfJunction, jy - halfJunction, halfJunction * 2, halfJunction * 2);
      drawChevrons([trunkSegment], style.texture, alpha);
      ctx.globalAlpha = 1;
    }

    if (conn) {
      const from = nodeMap().get(conn.from);
      const pos = positions()[conn.from];
      if (from && pos) {
        const elbow = elbowSegments({ x1: pos.x + NODE_W, y1: pos.y + from.h / 2, x2: conn.x, y2: conn.y });
        strokeTrack(elbow.segments, c.divider, 1, EDGE_WIDTH + EDGE_BORDER_EXTRA);
        strokeTrack(elbow.segments, c.primary, 1, EDGE_WIDTH);
        drawChevrons(elbow.segments, lightenColor(c.primary, SOLVED_LIGHTNESS_BOOST), 1);
      }
    }
  }

  // the graph wrapper mounts conditionally (after loading), so the
  // ResizeObserver and the wheel listener attach in the ref callback
  function setupWrapper(el: HTMLDivElement) {
    cleanupWrapper?.();
    wrapperRef = el;
    const observer = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const z = zoom();
      const nz = clampZoom(z * Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED));
      const wx = (mx - pan().x) / z;
      const wy = (my - pan().y) / z;
      setZoom(nz);
      setPan({ x: mx - wx * nz, y: my - wy * nz });
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    cleanupWrapper = () => {
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
      if (wrapperRef === el) wrapperRef = undefined;
    };
  }

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNode(null);
        if (admin()) {
          setSelectedEdge(null);
          setConnecting(null);
        }
        return;
      }
      if (!admin()) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEdge()) {
        if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")) return;
        e.preventDefault();
        deleteSelectedEdge();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    onCleanup(() => {
      cleanupWrapper?.();
      window.removeEventListener("keydown", onKeyDown);
    });
  });

  createEffect(() => {
    fullTheme();
    const content = probeColor("text-layer-content", FALLBACK_TEXT_COLOR);
    const dark = fullTheme() === "dark";
    setColors({
      content,
      muted: mixColors(content, probeColor("bg-layer", FALLBACK_BG_COLOR, "backgroundColor"), 0.25),
      primary: probeColor("text-primary", FALLBACK_PRIMARY_COLOR),
      success: probeColor("text-success", FALLBACK_SUCCESS_COLOR),
      // tracks are outlined in the divider color, matching <Divider />
      divider: probeColor("bg-layer-content/10", FALLBACK_DIVIDER_COLOR, "backgroundColor"),
      edgeBase: dark ? "#444444" : "#dddddd",
      edgeTexture: dark ? "#777777" : "#aaaaaa",
    });
  });

  createEffect(() => {
    draw();
  });

  let fitted = false;
  createEffect(() => {
    if (fitted || nodes().length === 0 || size().w === 0) return;
    if (Object.keys(positions()).length === 0) return;
    fitted = true;
    fitView();
  });

  function onBackgroundPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = pan();
    let moved = false;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) moved = true;
      if (moved) setPan({ x: startPan.x + dx, y: startPan.y + dy });
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      if (!moved) {
        setSelectedNode(null);
        if (admin()) {
          const hit = hitTestEdge(toWorld(ev.clientX, ev.clientY));
          setSelectedEdge(hit);
        }
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }

  function onNodePointerDown(e: PointerEvent, node: GNode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = positions()[node.key] ?? { x: 0, y: 0 };
    let moved = false;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) moved = true;
      if (!moved || !admin()) return;
      draggingKey = node.key;
      setPositions((prev) => ({
        ...prev,
        [node.key]: { x: snapX(startPos.x + dx / zoom()), y: snapY(startPos.y + dy / zoom()) },
      }));
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      draggingKey = null;
      if (!moved) {
        // a click selects the node and highlights its ancestor chain; the
        // former click action (detail dialog / challenge page) moved to
        // double click
        setSelectedNode(node.key);
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }

  function onPortPointerDown(e: PointerEvent, from: string) {
    if (!admin() || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const world = toWorld(e.clientX, e.clientY);
    setConnecting({ from, x: world.x, y: world.y });
    const onMove = (ev: PointerEvent) => {
      const w = toWorld(ev.clientX, ev.clientY);
      setConnecting({ from, x: w.x, y: w.y });
      // snap feedback: highlight the nearest in-port within reach
      let nearest: string | null = null;
      let nearestDist = PORT_SNAP_RADIUS;
      for (const node of nodes()) {
        if (node.key === from) continue;
        const p = positions()[node.key];
        if (!p) continue;
        const dist = Math.hypot(w.x - p.x, w.y - (p.y + node.h / 2));
        if (dist < nearestDist) {
          nearest = node.key;
          nearestDist = dist;
        }
      }
      setNearPort(nearest);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setConnecting(null);
      const target =
        nearPort() ??
        document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-port-in]")?.getAttribute("data-port-in");
      setNearPort(null);
      if (target) tryConnect(from, target);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function createsCycle(from: string, to: string) {
    const adjacency = new Map<string, string[]>();
    for (const edge of edges()) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      adjacency.get(edge.from)?.push(edge.to);
    }
    const stack = [to];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const key = stack.pop()!;
      if (key === from) return true;
      if (visited.has(key)) continue;
      visited.add(key);
      stack.push(...(adjacency.get(key) ?? []));
    }
    return false;
  }

  function tryConnect(from: string, to: string) {
    if (from === to) return;
    if (edges().some((e) => e.from === from && e.to === to)) {
      addToast({ level: "info", description: t("challenge.milestone.editor.duplicate") });
      return;
    }
    if (createsCycle(from, to)) {
      addToast({ level: "warning", description: t("challenge.milestone.editor.cycle") });
      return;
    }
    setEdges([...edges(), { from, to }]);
  }

  function deleteSelectedEdge() {
    const key = selectedEdge();
    if (!key) return;
    setEdges(edges().filter((e) => edgeKey(e) !== key));
    setSelectedEdge(null);
  }

  function resetChanges() {
    setEdges(baseline().filter((e) => nodeSet().has(e.from) && nodeSet().has(e.to)));
    setSelectedEdge(null);
  }

  let avatarInput: HTMLInputElement | undefined;
  const [avatarTarget, setAvatarTarget] = createSignal<string | null>(null);
  const [avatarUploading, setAvatarUploading] = createSignal<string | null>(null);

  async function applyNodeAvatar(key: string, avatar: string | null) {
    if (nodeKindOf(key) === "challenge") {
      await challengeAvatarMutation.mutateAsync({
        game_id: props.gameId,
        challenge_id: nodeIdOf(key),
        avatar,
      });
    } else {
      const milestone = milestones.data?.find((m) => `m${m.id}` === key);
      if (!milestone) return;
      await milestoneAvatarMutation.mutateAsync({
        game_id: props.gameId,
        milestone: { ...milestone, avatar },
      });
    }
  }

  function onPickNodeAvatar(key: string) {
    setAvatarTarget(key);
    avatarInput?.click();
  }

  async function onNodeAvatarSelected(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    const key = avatarTarget();
    if (!file || !key) return;
    setAvatarUploading(key);
    try {
      const resp = await uploadMedia(file, false);
      await applyNodeAvatar(key, resp.hash);
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.upload.status.fail"));
    }
    setAvatarUploading(null);
    setAvatarTarget(null);
  }

  async function onClearNodeAvatar(key: string) {
    setAvatarUploading(key);
    try {
      await applyNodeAvatar(key, null);
    } catch {
      // the mutation hooks already toast failures
    }
    setAvatarUploading(null);
  }

  async function onSave() {
    const prereqs = prerequisitesByNode();
    setSaving(true);
    let count = 0;
    try {
      for (const m of milestones.data ?? []) {
        const next = [...(prereqs.get(`m${m.id}`) ?? [])].sort((a, b) => a - b);
        const prev = [...m.prerequisites].sort((a, b) => a - b);
        if (next.join(",") === prev.join(",")) continue;
        await updateMilestoneMutation.mutateAsync({
          game_id: props.gameId,
          milestone: { ...m, prerequisites: next },
        });
        count++;
      }
      for (const c of challenges.data?.[0] ?? []) {
        const next = [...(prereqs.get(`c${c.id}`) ?? [])].sort((a, b) => a - b);
        const prev = [...(c.prerequisites ?? [])].sort((a, b) => a - b);
        if (next.join(",") === prev.join(",")) continue;
        await updatePrerequisitesMutation.mutateAsync({
          game_id: props.gameId,
          challenge_id: c.id,
          prerequisites: next,
        });
        count++;
      }
      addToast({
        level: "success",
        description: t("challenge.milestone.editor.saved", { count }),
        duration: 5000,
      });
      setBaseline(validEdges());
      setSelectedEdge(null);
    } catch (err) {
      handleHttpError(err as Error, t("general.actions.save.status.fail"));
    } finally {
      setSaving(false);
      inflyClient.invalidateQueries({ queryKey: ["game", props.gameId, "challenge"] });
      inflyClient.invalidateQueries({ queryKey: ["game", props.gameId, "milestone"] });
    }
  }

  return (
    <div class="flex-1 overflow-hidden flex flex-col">
      <div class="h-16 shrink-0 flex items-center px-2 space-x-2 border-b border-b-layer-content/10">
        <span class="shrink-0 icon-[fluent--trophy-20-regular] w-5 h-5 text-primary" />
        <span class="font-bold truncate">{t("challenge.milestone.title")}</span>
        <span class="flex-1" />
        <Show when={admin()}>
          <span class="opacity-60 hidden xl:inline">{t("challenge.milestone.editor.hint")}</span>
          <Show when={dirty()}>
            <Tag level="warning">
              <span>{t("challenge.milestone.editor.unsaved")}</span>
            </Tag>
          </Show>
        </Show>
        <Button ghost square title="-" onClick={() => zoomBy(1 / 1.2)}>
          <span class="shrink-0 icon-[fluent--zoom-out-20-regular] w-5 h-5" />
        </Button>
        <Button ghost square title="+" onClick={() => zoomBy(1.2)}>
          <span class="shrink-0 icon-[fluent--zoom-in-20-regular] w-5 h-5" />
        </Button>
        <Button ghost square title={t("challenge.milestone.editor.fit")} onClick={fitView}>
          <span class="shrink-0 icon-[fluent--arrow-fit-20-regular] w-5 h-5" />
        </Button>
        <Show when={admin()}>
          <Divider direction="vertical" class="h-8" />
          <Show when={selectedEdge()}>
            <Button ghost square title={t("challenge.milestone.editor.deleteEdge")} onClick={deleteSelectedEdge}>
              <span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5 text-error" />
            </Button>
          </Show>
          <Button ghost onClick={resetChanges} disabled={!dirty()} title={t("general.actions.reset.title")}>
            <span class="shrink-0 icon-[fluent--arrow-reset-20-regular] w-5 h-5" />
          </Button>
          <Button
            ghost
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <span class="shrink-0 icon-[fluent--add-20-regular] w-5 h-5" />
            <span>{t("general.actions.create.title")}</span>
          </Button>
          <Button
            level="primary"
            onClick={onSave}
            disabled={!dirty()}
            loading={saving()}
            title={t("general.actions.save.title")}
          >
            <Show when={!saving()}>
              <span class="shrink-0 icon-[fluent--save-20-regular] w-5 h-5" />
            </Show>
            <span>{t("general.actions.save.title")}</span>
          </Button>
        </Show>
      </div>
      <input ref={avatarInput} type="file" accept="image/*" class="hidden" onChange={onNodeAvatarSelected} />
      <Switch
        fallback={
          <div class="flex-1 flex flex-col space-y-2 items-center justify-center opacity-60">
            <span class="shrink-0 icon-[fluent--emoji-sad-slight-20-regular] w-8 h-8" />
            <span>{t("challenge.milestone.empty")}</span>
          </div>
        }
      >
        <Match when={milestones.isLoading || challenges.isLoading}>
          <div class="flex-1 flex flex-row space-x-2 items-center justify-center">
            <LoadingTips />
          </div>
        </Match>
        <Match when={nodes().length > 0}>
          <div
            ref={setupWrapper}
            class="relative flex-1 overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing"
            onPointerDown={onBackgroundPointerDown}
          >
            <canvas ref={canvasRef} class="absolute inset-0 w-full h-full" />
            <div class="absolute inset-0 pointer-events-none">
              <div
                class="absolute top-0 left-0 pointer-events-none"
                style={{
                  transform: `translate(${pan().x}px, ${pan().y}px) scale(${zoom()})`,
                  "transform-origin": "0 0",
                }}
              >
                <For each={nodes()}>
                  {(node) => {
                    const pos = () => positions()[node.key] ?? { x: PAD, y: PAD };
                    return (
                      <Switch>
                        <Match when={node.kind === "challenge"}>
                          {/* biome-ignore lint/a11y/noStaticElementInteractions: canvas graph node, pointer-driven like the canvas itself */}
                          <div
                            title={node.name}
                            class={clsx(
                              "absolute flex items-center gap-2 px-3 rounded-lg border-2 backdrop-blur-sm cursor-pointer transition-all pointer-events-auto",
                              "bg-layer/80",
                              // while a node is selected, everything outside
                              // its ancestor chain fades out
                              ancestorChain() &&
                                !ancestorChain()!.nodes.has(node.key) &&
                                node.key !== ancestorChain()!.selected &&
                                "opacity-40",
                              node.key === selectedNode() && "ring-2 ring-primary/70",
                              // solved: success border; locked while any
                              // predecessor is unsolved; unlocked (primary
                              // border) otherwise, including no predecessors
                              (() => {
                                if (solvedIds().has(node.id)) return "border-success hover:border-success";
                                const prereqs = prerequisitesByNode().get(node.key) ?? [];
                                const locked = prereqs.some((id) => !solvedIds().has(id));
                                return locked ? "border-layer-content/20" : "border-primary/50 hover:border-primary";
                              })()
                            )}
                            style={{
                              left: `${pos().x}px`,
                              top: `${pos().y}px`,
                              width: `${NODE_W}px`,
                              height: `${CHALLENGE_H}px`,
                            }}
                            onPointerDown={(e) => onNodePointerDown(e, node)}
                            onDblClick={(e) => {
                              e.stopPropagation();
                              navigate(`/games/${props.gameId}/challenges?challenge=${node.id}`);
                            }}
                          >
                            <NodeAvatar
                              nodeKey={node.key}
                              avatar={challengeMap().get(node.id)?.avatar ?? null}
                              fallback={node.name}
                              defaultIcon={
                                solvedIds().has(node.id)
                                  ? "icon-[fluent--checkmark-circle-20-regular] text-success"
                                  : "icon-[fluent--flag-20-regular]"
                              }
                              admin={admin()}
                              uploading={avatarUploading() === node.key}
                              onPick={onPickNodeAvatar}
                              onClear={onClearNodeAvatar}
                            />
                            <span class="flex-1 truncate text-left font-bold">{node.name}</span>
                            <span class="shrink-0 opacity-60">{challengeMap().get(node.id)?.score} pts</span>
                            <Show when={admin()}>
                              <PortMarker nodeKey={node.key} side="in" active={nearPort() === node.key} />
                              <PortMarker
                                nodeKey={node.key}
                                side="out"
                                active={connecting()?.from === node.key}
                                onPointerDown={onPortPointerDown}
                              />
                            </Show>
                          </div>
                        </Match>
                        <Match when={node.kind === "milestone"}>
                          <Show when={milestones.data?.find((m) => m.id === node.id)}>
                            {(milestone) => {
                              const prereqs = createMemo(() => prerequisitesByNode().get(node.key) ?? []);
                              const solvedCount = createMemo(
                                () => prereqs().filter((id) => solvedIds().has(id)).length
                              );
                              const achieved = createMemo(
                                () => prereqs().length > 0 && prereqs().every((id) => solvedIds().has(id))
                              );
                              return (
                                // biome-ignore lint/a11y/noStaticElementInteractions: canvas graph node, pointer-driven like the canvas itself
                                <div
                                  title={milestone().name}
                                  class={clsx(
                                    "absolute flex flex-col justify-center gap-1 px-3 rounded-lg border-2 backdrop-blur-sm cursor-pointer transition-all pointer-events-auto",
                                    "bg-layer/80 hover:border-primary/60",
                                    ancestorChain() &&
                                      !ancestorChain()!.nodes.has(node.key) &&
                                      node.key !== ancestorChain()!.selected &&
                                      "opacity-40",
                                    node.key === selectedNode() && "ring-2 ring-primary/70",
                                    achieved() ? "border-success/60" : "border-layer-content/10"
                                  )}
                                  style={{
                                    left: `${pos().x}px`,
                                    top: `${pos().y}px`,
                                    width: `${NODE_W}px`,
                                    height: `${MILESTONE_H}px`,
                                  }}
                                  onPointerDown={(e) => onNodePointerDown(e, node)}
                                  onDblClick={(e) => {
                                    e.stopPropagation();
                                    setDetailId(node.id);
                                  }}
                                >
                                  <div class="flex items-center gap-2 w-full">
                                    <NodeAvatar
                                      nodeKey={node.key}
                                      avatar={milestone().avatar}
                                      fallback={milestone().name}
                                      defaultIcon={clsx(
                                        "icon-[fluent--trophy-20-regular]",
                                        achieved() && "text-success"
                                      )}
                                      admin={admin()}
                                      uploading={avatarUploading() === node.key}
                                      onPick={onPickNodeAvatar}
                                      onClear={onClearNodeAvatar}
                                    />
                                    <span class="flex-1 truncate text-left font-bold">{milestone().name}</span>
                                    <Show when={achieved()}>
                                      <span class="shrink-0 icon-[fluent--checkmark-circle-20-filled] w-5 h-5 text-success" />
                                    </Show>
                                  </div>
                                  <div class="flex items-center gap-2 w-full">
                                    <span class="shrink-0 text-primary font-bold">+{milestone().bonus_score} pts</span>
                                    <span class="flex-1" />
                                    <span class="shrink-0 opacity-60">
                                      {solvedCount()}/{prereqs().length}
                                    </span>
                                  </div>
                                  <div class="w-full h-1 rounded-full bg-layer-content/10 overflow-hidden">
                                    <div
                                      class={clsx(
                                        "h-full rounded-full transition-all",
                                        achieved() ? "bg-success" : "bg-primary"
                                      )}
                                      style={{
                                        width: `${prereqs().length > 0 ? (solvedCount() / prereqs().length) * 100 : 0}%`,
                                      }}
                                    />
                                  </div>
                                  <Show when={admin()}>
                                    <PortMarker nodeKey={node.key} side="in" active={nearPort() === node.key} />
                                  </Show>
                                </div>
                              );
                            }}
                          </Show>
                        </Match>
                      </Switch>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>
        </Match>
      </Switch>
      <MilestoneDetailDialog
        gameId={props.gameId}
        milestone={detailMilestone()}
        prerequisites={prerequisitesByNode().get(`m${detailId()}`) ?? []}
        admin={admin()}
        solvedIds={solvedIds()}
        onClose={() => setDetailId(null)}
        onEdit={(milestone) => {
          setEditing(milestone);
          setFormOpen(true);
        }}
      />
      <MilestoneFormDialog gameId={props.gameId} milestone={editing()} open={formOpen()} onOpenChange={setFormOpen} />
    </div>
  );
}

/** The connection port. The hit zone is a full-height strip on the node
 * border; the marker is an inner square the size of the edge corner squares
 * framed by four corner brackets, and it lights up and grows slightly while
 * a connection drag is near. */
function PortMarker(props: {
  nodeKey: string;
  side: "in" | "out";
  active: boolean;
  onPointerDown?: (e: PointerEvent, key: string) => void;
}) {
  return (
    <div
      data-port-in={props.side === "in" ? props.nodeKey : undefined}
      class="absolute top-0 h-full flex items-center justify-center cursor-crosshair group/port"
      style={{
        width: `${PORT_STRIP_W}px`,
        [props.side === "in" ? "left" : "right"]: `${-PORT_STRIP_W / 2}px`,
      }}
      onPointerDown={(e) => {
        if (props.side === "out") props.onPointerDown?.(e, props.nodeKey);
      }}
    >
      <div class={clsx("relative transition-transform", props.active ? "scale-125" : "group-hover/port:scale-110")}>
        <div
          class={clsx(
            "transition-colors",
            props.active ? "bg-primary" : "bg-layer-content/30 group-hover/port:bg-primary/60"
          )}
          style={{ width: `${PORT_SQUARE}px`, height: `${PORT_SQUARE}px` }}
        />
        <div
          class={clsx(
            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-colors",
            props.active ? "text-primary" : "text-layer-content/30 group-hover/port:text-primary/60"
          )}
          style={{ width: `${PORT_SQUARE * 2}px`, height: `${PORT_SQUARE * 2}px` }}
        >
          <div
            class="absolute left-0 top-0 border-t-2 border-l-2 border-current"
            style={{ width: "7px", height: "7px" }}
          />
          <div
            class="absolute right-0 top-0 border-t-2 border-r-2 border-current"
            style={{ width: "7px", height: "7px" }}
          />
          <div
            class="absolute left-0 bottom-0 border-b-2 border-l-2 border-current"
            style={{ width: "7px", height: "7px" }}
          />
          <div
            class="absolute right-0 bottom-0 border-b-2 border-r-2 border-current"
            style={{ width: "7px", height: "7px" }}
          />
        </div>
      </div>
    </div>
  );
}

/** The node icon. For admins it acts like the account avatar editor: click to
 * pick an image (uploaded immediately), click again to remove the avatar. */
function NodeAvatar(props: {
  nodeKey: string;
  avatar: string | null;
  fallback: string;
  defaultIcon: string;
  admin: boolean;
  uploading: boolean;
  onPick: (key: string) => void;
  onClear: (key: string) => void;
}) {
  const icon = (
    <Show
      when={props.avatar}
      fallback={<span class={clsx("shrink-0 w-5 h-5 transition-opacity", props.defaultIcon)} />}
    >
      <Avatar
        class="w-5 h-5 shrink-0"
        src={mediaPath(props.avatar)}
        fallback={props.fallback}
        loading={props.uploading}
      />
    </Show>
  );
  return (
    <Show when={props.admin} fallback={icon}>
      <button
        type="button"
        class="shrink-0 w-5 h-5 relative rounded-full cursor-pointer group/avatar"
        title={t("general.actions.upload.title")}
        disabled={props.uploading}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (props.avatar) {
            props.onClear(props.nodeKey);
          } else {
            props.onPick(props.nodeKey);
          }
        }}
      >
        <span class="transition-opacity group-hover/avatar:opacity-20">{icon}</span>
        <span class="absolute inset-0 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
          <span
            class={clsx(
              "w-4 h-4",
              props.avatar ? "icon-[fluent--delete-20-regular] text-error" : "icon-[fluent--cloud-arrow-up-20-regular]"
            )}
          />
        </span>
      </button>
    </Show>
  );
}

function MilestoneDetailDialog(props: {
  gameId: number;
  milestone: Milestone | null;
  prerequisites: number[];
  admin: boolean;
  solvedIds: Set<number>;
  onClose: () => void;
  onEdit: (milestone: Milestone) => void;
}) {
  const challenges = useChallenges({ game_id: () => props.gameId });
  const challengeMap = createMemo(() => new Map((challenges.data?.[0] ?? []).map((c) => [c.id, c])));
  const deleteMutation = useDeleteMilestoneMutation({
    onSuccess: () => props.onClose(),
  });

  return (
    <Dialog.Root
      lazyMount
      unmountOnExit
      open={!!props.milestone}
      onOpenChange={(details) => {
        if (!details.open) props.onClose();
      }}
    >
      <Portal>
        <Dialog.Backdrop class="dialog-backdrop fixed backdrop-blur-sm bg-layer/60 top-0 left-0 w-screen h-screen" />
        <Dialog.Positioner class="fixed top-0 left-0 w-screen h-screen flex items-center justify-center">
          <Dialog.Content class="dialog-content card relative max-h-[calc(100vh-2rem)]">
            <OverlayScrollbarsComponent
              options={{
                scrollbars: {
                  theme: `os-theme-${fullTheme()}`,
                  autoHide: "scroll",
                },
              }}
              class="relative w-full max-w-full h-full max-h-[calc(100vh-2rem)] overflow-hidden"
              defer
            >
              <Show when={props.milestone}>
                {(milestone) => (
                  <div class="card-content p-3 lg:p-6 w-96 max-w-[calc(100vw-2rem)] flex flex-col space-y-2">
                    <div class="flex flex-row space-x-4 items-center">
                      <Avatar
                        class="w-12 h-12 shrink-0"
                        src={milestone().avatar ? mediaPath(milestone().avatar) : undefined}
                        fallback={milestone().name}
                      />
                      <div class="flex flex-col items-start justify-center min-w-0">
                        <h2 class="font-bold text-lg truncate max-w-full">{milestone().name}</h2>
                        <p class="font-normal opacity-60">+{milestone().bonus_score} pts</p>
                      </div>
                      <Show
                        when={
                          props.prerequisites.length > 0 && props.prerequisites.every((id) => props.solvedIds.has(id))
                        }
                      >
                        <Tag level="success">
                          <span>{t("challenge.milestone.achieved")}</span>
                        </Tag>
                      </Show>
                    </div>
                    <Divider class="w-full" />
                    <p class="whitespace-pre-wrap opacity-80">{milestone().description}</p>
                    <span class="label">{t("challenge.milestone.prerequisites")}</span>
                    <div class="flex flex-col space-y-1">
                      <For each={props.prerequisites}>
                        {(id) => (
                          <div class="h-8 flex items-center space-x-2 px-2 rounded-md bg-layer-content/5">
                            <span
                              class={clsx(
                                "shrink-0 w-5 h-5",
                                props.solvedIds.has(id)
                                  ? "icon-[fluent--checkmark-circle-20-regular] text-success"
                                  : "icon-[fluent--flag-20-regular] opacity-60"
                              )}
                            />
                            <span class="flex-1 truncate">{challengeMap().get(id)?.name ?? `#${id}`}</span>
                            <span class="shrink-0 opacity-60">{challengeMap().get(id)?.score} pts</span>
                          </div>
                        )}
                      </For>
                    </div>
                    <Show when={props.admin}>
                      <Divider class="w-full" />
                      <div class="flex flex-row space-x-2 justify-end">
                        <Button ghost onClick={() => props.onEdit(milestone())}>
                          <span class="shrink-0 icon-[fluent--edit-20-regular] w-5 h-5" />
                          <span>{t("general.actions.edit.title")}</span>
                        </Button>
                        <Popover
                          ghost
                          btnContent={
                            <>
                              <span class="shrink-0 icon-[fluent--delete-20-regular] w-5 h-5 text-error" />
                              <span class="text-error">{t("general.actions.delete.title")}</span>
                            </>
                          }
                        >
                          <Card contentClass="p-2 flex flex-col space-y-2 max-w-96">
                            <span class="inline-block space-x-2">
                              <span class="shrink-0 icon-[fluent--warning-20-regular] w-5 h-5 text-warning align-middle" />
                              <span>{t("general.actions.delete.message")}</span>
                            </span>
                            <Button
                              level="primary"
                              class="self-end"
                              loading={deleteMutation.isPending}
                              onClick={() =>
                                deleteMutation.mutate({
                                  game_id: props.gameId,
                                  milestone_id: milestone().id,
                                })
                              }
                            >
                              {t("general.actions.yes.title")}
                            </Button>
                          </Card>
                        </Popover>
                      </div>
                    </Show>
                  </div>
                )}
              </Show>
            </OverlayScrollbarsComponent>
            <Dialog.CloseTrigger
              class="btn btn-sm btn-square flex items-center justify-center btn-ghost absolute right-2 top-2"
              title={t("general.actions.close.title")}
            >
              <span class="shrink-0 icon-[fluent--dismiss-20-regular] w-5 h-5" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function MilestoneFormDialog(props: {
  gameId: number;
  milestone: Milestone | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [bonusScore, setBonusScore] = createSignal(100);
  const [nameError, setNameError] = createSignal("");
  const [descriptionError, setDescriptionError] = createSignal("");

  createEffect(() => {
    if (!props.open) return;
    setName(props.milestone?.name ?? "");
    setDescription(props.milestone?.description ?? "");
    setBonusScore(props.milestone?.bonus_score ?? 100);
    setNameError("");
    setDescriptionError("");
  });

  const createMutation = useCreateMilestoneMutation({
    onSuccess: () => props.onOpenChange(false),
  });
  const updateMutation = useUpdateMilestoneMutation({
    onSuccess: () => props.onOpenChange(false),
  });

  async function onSubmit() {
    let valid = true;
    if (!name().trim()) {
      setNameError(t("challenge.milestone.form.name.required"));
      valid = false;
    }
    if (!description().trim()) {
      setDescriptionError(t("challenge.milestone.form.description.required"));
      valid = false;
    }
    if (!valid) return;

    const milestone = {
      id: props.milestone?.id ?? 0,
      created_at: props.milestone?.created_at ?? DateTime.now(),
      updated_at: DateTime.now(),
      game_id: props.gameId,
      name: name().trim(),
      description: description().trim(),
      bonus_score: Math.min(10000, Math.max(0, bonusScore())),
      // the avatar is managed by the node icon on the canvas
      avatar: props.milestone?.avatar ?? null,
      // prerequisites are managed by drag-connecting on the canvas
      prerequisites: props.milestone?.prerequisites ?? [],
    } as Milestone;

    if (props.milestone) {
      await updateMutation.mutateAsync({ game_id: props.gameId, milestone });
    } else {
      await createMutation.mutateAsync({ game_id: props.gameId, milestone });
    }
  }

  return (
    <Dialog.Root lazyMount unmountOnExit open={props.open} onOpenChange={(details) => props.onOpenChange(details.open)}>
      <Portal>
        <Dialog.Backdrop class="dialog-backdrop fixed backdrop-blur-sm bg-layer/60 top-0 left-0 w-screen h-screen" />
        <Dialog.Positioner class="fixed top-0 left-0 w-screen h-screen flex items-center justify-center">
          <Dialog.Content class="dialog-content card relative max-h-[calc(100vh-2rem)]">
            <OverlayScrollbarsComponent
              options={{
                scrollbars: {
                  theme: `os-theme-${fullTheme()}`,
                  autoHide: "scroll",
                },
              }}
              class="relative w-full max-w-full h-full max-h-[calc(100vh-2rem)] overflow-hidden"
              defer
            >
              <div class="card-content p-3 lg:p-6 w-96 max-w-[calc(100vw-2rem)] flex flex-col space-y-2">
                <h2 class="font-bold text-lg">
                  {props.milestone ? t("general.actions.edit.title") : t("general.actions.create.title")}
                </h2>
                <Input
                  icon={<span class="shrink-0 icon-[fluent--trophy-20-regular] w-5 h-5" />}
                  title={t("challenge.milestone.form.name.label")}
                  placeholder={t("challenge.milestone.form.name.placeholder")}
                  name="name"
                  value={name()}
                  error={nameError()}
                  onInput={(e) => {
                    setName(e.currentTarget.value);
                    setNameError("");
                  }}
                  maxLength={127}
                  required
                />
                <div class="flex flex-col space-y-1">
                  <label class="label" for="description">
                    <span class="flex-1 text-start">{t("challenge.milestone.form.description.label")}</span>
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    class={clsx(
                      "input w-full px-4 py-2 rounded-lg min-h-24 border border-transparent",
                      descriptionError() && "border-error! outline-error!"
                    )}
                    placeholder={t("challenge.milestone.form.description.placeholder")}
                    value={description()}
                    onInput={(e) => {
                      setDescription(e.currentTarget.value);
                      setDescriptionError("");
                    }}
                    required
                  />
                  <Show when={descriptionError()}>
                    <span class="text-error text-sm">{descriptionError()}</span>
                  </Show>
                </div>
                <Input
                  icon={<span class="shrink-0 icon-[fluent--number-symbol-20-regular] w-5 h-5" />}
                  title={t("challenge.milestone.form.bonusScore.label")}
                  placeholder={t("challenge.milestone.form.bonusScore.placeholder")}
                  name="bonus_score"
                  type="number"
                  min={0}
                  max={10000}
                  value={bonusScore()}
                  onInput={(e) => setBonusScore(Number(e.currentTarget.value) || 0)}
                  required
                />
                <Button
                  level="primary"
                  class="w-full mt-4!"
                  loading={createMutation.isPending || updateMutation.isPending}
                  onClick={onSubmit}
                >
                  {props.milestone ? t("general.actions.save.title") : t("general.actions.create.title")}
                </Button>
              </div>
            </OverlayScrollbarsComponent>
            <Dialog.CloseTrigger
              class="btn btn-sm btn-square flex items-center justify-center btn-ghost absolute right-2 top-2"
              title={t("general.actions.close.title")}
            >
              <span class="shrink-0 icon-[fluent--dismiss-20-regular] w-5 h-5" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
