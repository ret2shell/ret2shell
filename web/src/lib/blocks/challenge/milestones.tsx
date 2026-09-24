import { handleHttpError, inflyClient, toastSuccess } from "@api";
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
import type { Challenge } from "@models/challenge";
import type { Milestone } from "@models/milestone";
import { useNavigate } from "@solidjs/router";
import { isAdminOfGame } from "@storage/game";
import { fullTheme, t, themeStore } from "@storage/theme";
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
// node centers snap to the world grid (multiples of GRID_Y); the column
// pitch and the first column center are grid multiples, so auto layout,
// drag snapping and the dot grid all agree
const GRID_Y = 24;
const COLUMN_START = GRID_Y * 5;
const COLUMN_PITCH = GRID_Y * 15;
const GAP_X = COLUMN_PITCH - NODE_W;
const GAP_Y = GRID_Y;
const PAD = GRID_Y;

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

/** Reads a resolved theme color by mounting a hidden probe element with the
 * given Tailwind class. The class must be emitted somewhere in the app for
 * this to work — when no element ever uses it, the computed style stays
 * empty and `fallback` wins silently. */
function probeColor(cls: string, fallback: string, property: "color" | "backgroundColor" = "color") {
  const el = document.createElement("span");
  el.className = cls;
  el.style.display = "none";
  document.body.appendChild(el);
  const color = getComputedStyle(el)[property] || fallback;
  el.remove();
  return color;
}

const REGION_GAP = 96;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
// fitting the view never zooms in beyond 100%
const MAX_FIT_ZOOM = 1;
// multiplicative step of the toolbar zoom in/out buttons
const ZOOM_STEP = 1.2;
const WHEEL_ZOOM_SPEED = 0.0015;
// pointer moves below this distance count as clicks instead of drags
const DRAG_THRESHOLD_PX = 4;
// how far from an edge a click still selects it
const EDGE_HIT_TOLERANCE_PX = 8;
// stroke width of all edges, in world px
const EDGE_WIDTH = 8;
// unsolved track colors follow the theme so the tracks hug the background:
// light theme uses #dddddd/#aaaaaa, dark theme uses #444444/#777777
// the >>>>> texture: every period, two 45-degree parallelograms (one per
// half of the band) join into a ">" filled with the texture color while the
// rest of the band keeps the base color
const EDGE_TEXTURE_PERIOD = 20;
const EDGE_TEXTURE_W = 8;
// the chevron texture flows toward the target at this speed, in world px/s
const EDGE_FLOW_SPEED = 30;
// the chevron texture is a translucent white or black overlay of the track
// base: light themes darken the track slightly, dark themes lighten it, and
// solved tracks always lighten
const EDGE_TEXTURE_DARKEN = 0.18;
const EDGE_TEXTURE_LIGHTEN = 0.35;
// solved tracks and in-progress connections lighten via a white overlay
const EDGE_TEXTURE_SOLVE_COLOR = "#ffffff";
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
const FALLBACK_PRIMARY_COLOR = "#3b82f6";
const FALLBACK_SUCCESS_COLOR = "#22c55e";
const FALLBACK_DIVIDER_COLOR = "rgba(136, 136, 136, 0.1)";
const FALLBACK_WARNING_COLOR = "#f59e0b";
// upper bound of the milestone bonus score, mirrored from the backend model
const MAX_BONUS_SCORE = 10000;

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Node keys are `<kind-prefix><id>` strings; `c` challenges, `m` milestones. */
function nodeKindOf(key: string): NodeKind {
  return key.startsWith("c") ? "challenge" : "milestone";
}

function nodeIdOf(key: string): number {
  return Number(key.slice(1));
}

// node positions are stored as CENTER coordinates; centers snap to the
// world grid so every node sits exactly on the dot grid
function columnX(column: number) {
  return COLUMN_START + column * COLUMN_PITCH;
}

function columnOf(x: number) {
  return Math.round((x - COLUMN_START) / COLUMN_PITCH);
}

function snapX(x: number) {
  return columnX(columnOf(x));
}

/** Snaps any world coordinate to the nearest grid line. */
function snapGrid(v: number) {
  return Math.round(v / GRID_Y) * GRID_Y;
}

/** Snaps a center position up to the next grid line. */
function alignCeil(y: number) {
  return Math.ceil(y / GRID_Y) * GRID_Y;
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
    // depth-first traversal: pop from the tail of the stack
    const stack = [key];
    visited.add(key);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of graph.adjacent.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
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
  regionY: number,
  heights: Map<string, number>
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
        .map((p) => result[p].y)
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
    // blocked intervals of this column are fixed while the column is placed
    // (spanning sources push into later columns only), so sort them once
    const intervals = (blocked.get(column) ?? []).sort((a, b) => a.top - b.top);
    for (const [i, key] of sortedMembers.entries()) {
      const h = heights.get(key)!;
      // align by y-center with the anchor predecessor; the first node of a
      // column in this region may rise above regionY for the alignment, as
      // long as it stays clear of the previous region's nodes in this column;
      // every center snaps up to the grid so stacking stays aligned
      let yPos = firstInRegion
        ? Math.max(
            anchor.has(key) ? (anchor.get(key) ?? 0) : y,
            (columnBottom.get(column) ?? Number.NEGATIVE_INFINITY) + GAP_Y + h / 2
          )
        : Math.max(y, anchor.get(key) ?? Number.NEGATIVE_INFINITY);
      firstInRegion = false;
      yPos = alignCeil(yPos);
      let moved = true;
      while (moved) {
        moved = false;
        for (const interval of intervals) {
          if (yPos < interval.bottom && yPos + h / 2 > interval.top) {
            yPos = alignCeil(interval.bottom + GAP_Y + h / 2);
            moved = true;
          }
        }
      }
      result[key] = { x: columnX(column), y: yPos };
      columnBottom.set(column, yPos + h / 2);
      const center = yPos;
      for (const succ of graph.succs.get(key) ?? []) {
        const succColumn = columnOfNode.get(succ) ?? 0;
        for (let crossed = column + 1; crossed < succColumn; crossed++) {
          if (!blocked.has(crossed)) blocked.set(crossed, []);
          blocked.get(crossed)?.push({
            top: center - h / 2 - GAP_Y / 2,
            bottom: center + h / 2 + GAP_Y / 2,
          });
        }
      }
      y = alignCeil(yPos + h / 2 + GAP_Y + (heights.get(sortedMembers[i + 1] ?? key) ?? 0) / 2);
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
  blocked: Map<number, { top: number; bottom: number }[]>,
  heights: Map<string, number>
) {
  for (const column of [...byColumn.keys()].sort((a, b) => b - a)) {
    for (const key of byColumn.get(column)!) {
      const centers = (graph.succs.get(key) ?? []).map((s) => result[s].y).sort((a, b) => a - b);
      if (centers.length === 0) continue;
      const h = heights.get(key)!;
      const newCenter = centers[Math.floor((centers.length - 1) / 2)];
      if (Math.abs(newCenter - result[key].y) < 1) continue;
      const guard = outerBottom.get(column);
      if (guard !== undefined && newCenter - h / 2 < guard + GAP_Y) continue;
      const overlapsNode = tree.some(
        (other) =>
          other !== key &&
          (columnOfNode.get(other) ?? 0) === column &&
          newCenter - h / 2 < result[other].y + (heights.get(other) ?? 0) / 2 &&
          newCenter + h / 2 > result[other].y - (heights.get(other) ?? 0) / 2
      );
      if (overlapsNode) continue;
      const overlapsEdge = (blocked.get(column) ?? []).some(
        (interval) => newCenter - h / 2 < interval.bottom && newCenter + h / 2 > interval.top
      );
      if (overlapsEdge) continue;
      result[key] = { ...result[key], y: newCenter };
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
function fullLayout(nodes: GNode[], edges: Edge[]) {
  const heights = new Map(nodes.map((n) => [n.key, n.h]));
  const keys = nodes.map((n) => n.key);
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
    const blocked = placeByPredecessors(byColumn, graph, columnOfNode, result, columnBottom, regionY, heights);
    pullTowardSuccessors(byColumn, tree, graph, columnOfNode, result, outerBottom, blocked, heights);

    let bottom = regionY;
    for (const key of tree) {
      bottom = Math.max(bottom, result[key].y + (heights.get(key) ?? 0) / 2);
      const column = columnOfNode.get(key) ?? 0;
      columnBottom.set(
        column,
        Math.max(columnBottom.get(column) ?? Number.NEGATIVE_INFINITY, result[key].y + (heights.get(key) ?? 0) / 2)
      );
    }
    regionY = alignCeil(bottom + REGION_GAP);
  }

  // isolated nodes share one trailing single-column region
  for (const [i, key] of singles.sort().entries()) {
    result[key] = { x: columnX(0), y: regionY };
    regionY = alignCeil(regionY + (heights.get(key) ?? 0) / 2 + GAP_Y + (heights.get(singles[i + 1] ?? key) ?? 0) / 2);
  }
  return result;
}

/** Places nodes missing from `existing` relative to their already positioned
 * neighbors, leaving every existing (possibly user-dragged) node untouched.
 * The y position prefers the median predecessor's row when it does not
 * overlap existing nodes in the same column. */
function incrementalLayout(nodes: GNode[], edges: Edge[], existing: Record<string, NodePos>) {
  const result = { ...existing };
  const heights = new Map(nodes.map((n) => [n.key, n.h]));
  const keySet = new Set(nodes.map((n) => n.key));
  const missing = nodes
    .map((n) => n.key)
    .filter((key) => !existing[key])
    .sort();
  for (const key of missing) {
    const placedPreds = edges.filter((e) => e.to === key && keySet.has(e.from) && result[e.from]).map((e) => e.from);
    const succColumns = edges
      .filter((e) => e.from === key && keySet.has(e.to) && result[e.to])
      .map((e) => columnOf(result[e.to].x));
    let column = 0;
    if (placedPreds.length > 0) column = Math.max(...placedPreds.map((p) => columnOf(result[p].x))) + 1;
    else if (succColumns.length > 0) column = Math.max(0, Math.min(...succColumns) - 1);

    const h = heights.get(key)!;
    const occupants = Object.entries(result)
      .filter(([other]) => other !== key && columnOf(result[other].x) === column)
      .map(([other, pos]) => ({
        top: pos.y - (heights.get(other) ?? 0) / 2,
        bottom: pos.y + (heights.get(other) ?? 0) / 2,
      }));
    let bottom = PAD;
    for (const occ of occupants) bottom = Math.max(bottom, occ.bottom + GAP_Y);

    const predCenters = placedPreds.map((p) => result[p].y).sort((a, b) => a - b);
    let y = alignCeil(bottom + GAP_Y + h / 2);
    if (predCenters.length > 0) {
      const candidate = alignCeil(predCenters[Math.floor((predCenters.length - 1) / 2)]);
      if (
        candidate >= PAD &&
        occupants.every((occ) => candidate + h / 2 <= occ.top || candidate >= occ.bottom + GAP_Y)
      ) {
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
function autoLayout(nodes: GNode[], edges: Edge[], existing: Record<string, NodePos>) {
  if (Object.keys(existing).length === 0) return fullLayout(nodes, edges);
  return incrementalLayout(nodes, edges, existing);
}

type TrackState = "solved" | "mixed" | "unsolved";

type TrackSegment = { ax: number; ay: number; bx: number; by: number };

type TrackDraw = {
  state: TrackState;
  alpha: number;
  selected: boolean;
  segments: TrackSegment[];
  style: { base: string; overlayColor: string; overlayAlpha: number };
};

type AncestorChain = { nodes: Set<string>; edges: Set<string>; selected: string };

/** Endpoints of an edge in world coords, or null when either side has no
 * position yet. */
function edgeGeometry(edge: Edge, nodeMap: Map<string, GNode>, positions: Record<string, NodePos>) {
  const from = nodeMap.get(edge.from);
  const to = nodeMap.get(edge.to);
  if (!from || !to || !positions[edge.from] || !positions[edge.to]) return null;
  return {
    x1: positions[edge.from].x + NODE_W / 2,
    y1: positions[edge.from].y,
    x2: positions[edge.to].x - NODE_W / 2,
    y2: positions[edge.to].y,
  };
}

/** Resolves the edge set into drawable tracks: tracks sharing a target merge
 * into one corridor (the shared vertical overlap plus the final hop), tracks
 * sharing a source merge into one shared prefix, and a group with mixed
 * solve states turns warning. Pure data — the canvas paints the result, so
 * this runs on graph/selection/theme changes only, not per frame. */
function buildTracks(
  edgeList: Edge[],
  ctx: {
    nodeMap: Map<string, GNode>;
    positions: Record<string, NodePos>;
    solved: Set<number>;
    chain: AncestorChain | null;
    selectedEdge: string | null;
    colors: { success: string; warning: string; edgeBase: string; edgeOverlay: { color: string; alpha: number } };
  }
): TrackDraw[] {
  const { nodeMap, positions, solved, chain, selectedEdge: selected, colors: c } = ctx;
  // edges sharing a successor converge into a single trunk in the column
  // gap before the target
  const byTarget = new Map<string, Edge[]>();
  for (const edge of edgeList) {
    if (!byTarget.has(edge.to)) byTarget.set(edge.to, []);
    byTarget.get(edge.to)?.push(edge);
  }
  // edge sources are always challenges, so the solve state reads directly
  // off the source id
  const isSolved = (edge: Edge) => solved.has(nodeIdOf(edge.from));
  const stateOf = (members: Edge[]): TrackState => {
    const solvedCount = members.filter((edge) => isSolved(edge)).length;
    if (solvedCount === 0) return "unsolved";
    return solvedCount === members.length ? "solved" : "mixed";
  };
  const trackStyleOf = (state: TrackState) => {
    if (state === "solved") {
      return { base: c.success, overlayColor: EDGE_TEXTURE_SOLVE_COLOR, overlayAlpha: EDGE_TEXTURE_LIGHTEN };
    }
    if (state === "mixed") {
      return { base: c.warning, overlayColor: c.edgeOverlay.color, overlayAlpha: c.edgeOverlay.alpha };
    }
    return { base: c.edgeBase, overlayColor: c.edgeOverlay.color, overlayAlpha: c.edgeOverlay.alpha };
  };
  // while a node is selected, tracks outside the ancestor chain fade out;
  // merged tracks light up when any of their edges belongs to the chain
  const alphaOf = (keys: string[]) => (chain ? (keys.some((k) => chain.edges.has(k)) ? 1 : DIM_ALPHA) : 1);
  const selectedOf = (keys: string[]) => keys.some((k) => k === selected);

  const bySource = new Map<string, Edge[]>();
  for (const edge of edgeList) {
    const list = bySource.get(edge.from) ?? [];
    list.push(edge);
    bySource.set(edge.from, list);
  }

  const tracks: TrackDraw[] = [];
  // the vertical overlap shared by every member of a target group; only
  // this interval is colored by the group, exclusive approaches keep their
  // own solve state
  const sharedVertical = new Map<string, { start: number; end: number } | null>();
  const mergedDrawn = new Set<string>();
  for (const [target, members] of byTarget) {
    if (members.length < 2) continue;
    let start = Number.NEGATIVE_INFINITY;
    let end = Number.POSITIVE_INFINITY;
    for (const member of members) {
      const gm = edgeGeometry(member, nodeMap, positions);
      if (!gm) continue;
      start = Math.max(start, Math.min(gm.y1, gm.y2));
      end = Math.min(end, Math.max(gm.y1, gm.y2));
    }
    sharedVertical.set(target, end > start ? { start, end } : null);
  }
  for (const edge of edgeList) {
    const g = edgeGeometry(edge, nodeMap, positions);
    if (!g) continue;
    const mx = g.x2 - GAP_X / 2;
    const own = isSolved(edge);
    const ownState: TrackState = own ? "solved" : "unsolved";
    const straight = Math.abs(g.y2 - g.y1) < 1;
    const sourceSiblings = bySource.get(edge.from) ?? [];
    const targetGroup = byTarget.get(edge.to) ?? [edge];
    const sourceKeys = sourceSiblings.map(edgeKey);
    const targetKeys = targetGroup.map(edgeKey);

    // pieces in path order; consecutive pieces sharing a state join into
    // one continuous path so the round line join keeps the elbows smooth
    const pieces: { state: TrackState; keys: string[]; segments: TrackSegment[] }[] = [];

    // shared prefix with same-source siblings, in the group's color
    const sourceShared = sourceSiblings.length > 1;
    const minMx = Math.min(
      ...sourceSiblings
        .map((sibling) => edgeGeometry(sibling, nodeMap, positions)?.x2)
        .filter((x2): x2 is number => x2 !== undefined)
        .map((x2) => x2 - GAP_X / 2),
      mx
    );
    if (sourceShared && minMx > g.x1 + 1) {
      pieces.push({
        state: stateOf(sourceSiblings),
        keys: sourceKeys,
        segments: [{ ax: g.x1, ay: g.y1, bx: minMx, by: g.y1 }],
      });
    }

    // the own horizontal after the shared prefix, up to the corridor; the
    // corridor vertical splits at the group's shared overlap: exclusive
    // approaches keep the own state, the shared overlap takes the group
    // state; for an unshared target the own final hop closes the path
    const ownSegments: TrackSegment[] = [];
    const prefixEnd = sourceShared ? minMx : g.x1;
    if (mx - prefixEnd > 1) {
      ownSegments.push({ ax: prefixEnd, ay: g.y1, bx: mx, by: g.y1 });
    }
    if (!straight) {
      const shared = targetGroup.length > 1 ? sharedVertical.get(edge.to) : undefined;
      if (shared) {
        if (g.y1 < shared.start - 1) {
          ownSegments.push({ ax: mx, ay: g.y1, bx: mx, by: shared.start });
        } else if (g.y1 > shared.end + 1) {
          ownSegments.push({ ax: mx, ay: g.y1, bx: mx, by: shared.end });
        }
      } else {
        ownSegments.push({ ax: mx, ay: g.y1, bx: mx, by: g.y2 });
      }
    }
    if (targetGroup.length === 1) {
      ownSegments.push({ ax: mx, ay: g.y2, bx: g.x2, by: g.y2 });
    }
    if (ownSegments.length > 0) {
      pieces.push({ state: ownState, keys: [edgeKey(edge)], segments: ownSegments });
    }

    // the shared vertical overlap and the final hop are drawn once per
    // group, in the group's color
    const shared = targetGroup.length > 1 ? sharedVertical.get(edge.to) : undefined;
    if (!straight && shared && !mergedDrawn.has(`shared:${edge.to}`)) {
      mergedDrawn.add(`shared:${edge.to}`);
      const towardTarget = g.y2 >= shared.end;
      const [from, to] = towardTarget ? [shared.start, shared.end] : [shared.end, shared.start];
      pieces.push({
        state: stateOf(targetGroup),
        keys: targetKeys,
        segments: [{ ax: mx, ay: from, bx: mx, by: to }],
      });
    }
    if (targetGroup.length > 1 && !mergedDrawn.has(`trunk:${edge.to}`)) {
      mergedDrawn.add(`trunk:${edge.to}`);
      pieces.push({
        state: stateOf(targetGroup),
        keys: targetKeys,
        segments: [{ ax: mx, ay: g.y2, bx: g.x2, by: g.y2 }],
      });
    }

    // merge consecutive same-state pieces into continuous paths
    let run: (typeof pieces)[number] | null = null;
    for (const piece of pieces) {
      if (run && run.state === piece.state && run.keys.join("|") === piece.keys.join("|")) {
        run.segments.push(...piece.segments);
      } else {
        if (run) {
          tracks.push({
            state: run.state,
            alpha: alphaOf(run.keys),
            selected: selectedOf(run.keys),
            segments: run.segments,
            style: trackStyleOf(run.state),
          });
        }
        run = { ...piece, segments: [...piece.segments] };
      }
    }
    if (run) {
      tracks.push({
        state: run.state,
        alpha: alphaOf(run.keys),
        selected: selectedOf(run.keys),
        segments: run.segments,
        style: trackStyleOf(run.state),
      });
    }
  }
  return tracks;
}

// pre-rendered single-dot tile for the background grid; one pattern fill
// replaces thousands of arc() calls per frame. The tile is rebuilt when the
// on-screen grid pitch (zoom) or the dot color changes.
let gridTile: HTMLCanvasElement | undefined;
let gridTileStep = 0;
let gridTileColor = "";

export default function Milestones(props: { gameId: number }) {
  const navigate = useNavigate();
  const game = useGame({ id: () => props.gameId });
  const challenges = useChallenges({ game_id: () => props.gameId });
  const milestones = useMilestones({ game_id: () => props.gameId });
  const solves = useSelfSolves({ game_id: () => props.gameId });

  const admin = createMemo(() => isAdminOfGame(game.data));
  const solvedIds = createMemo(() => new Set((solves.data ?? []).map((s) => s.challenge_id)));
  const challengeMap = createMemo(() => new Map((challenges.data?.[0] ?? []).map((c) => [c.id, c])));
  const milestoneMap = createMemo(() => new Map((milestones.data ?? []).map((m) => [m.id, m])));

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
  // an edge is valid when both endpoints are on the canvas
  const isValidEdge = (edge: Edge) => nodeSet().has(edge.from) && nodeSet().has(edge.to);
  const validEdges = createMemo(() => edges().filter(isValidEdge));

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
    return pack(validEdges()) !== pack(baseline().filter(isValidEdge));
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
    on(nodes, (ns) => {
      if (!challenges.data || !milestones.data) return;
      const current = untrack(() => baseEdges().filter(isValidEdge));
      setPositions((prev) => {
        if (ns.every((node) => prev[node.key])) return prev;
        return autoLayout(ns, current, prev);
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

  const detailMilestone = createMemo(() => {
    const id = detailId();
    return id === null ? null : (milestoneMap().get(id) ?? null);
  });

  // while a node is selected, everything outside its ancestor chain fades out
  const dimmedClass = (key: string) => {
    const chain = ancestorChain();
    return chain && !chain.nodes.has(key) && key !== chain.selected ? "opacity-40" : "";
  };

  // solved: success border; locked while any predecessor is unsolved;
  // unlocked (primary border) otherwise, including no predecessors
  const challengeBorderClass = (node: GNode) => {
    if (solvedIds().has(node.id)) return "border-success hover:border-success";
    const prereqs = prerequisitesByNode().get(node.key) ?? [];
    const locked = prereqs.some((id) => !solvedIds().has(id));
    return locked ? "border-layer-content/20" : "border-primary/50 hover:border-primary";
  };

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
    primary: FALLBACK_PRIMARY_COLOR,
    success: FALLBACK_SUCCESS_COLOR,
    warning: FALLBACK_WARNING_COLOR,
    divider: FALLBACK_DIVIDER_COLOR,
    edgeBase: "#dddddd",
    // the texture overlay that darkens (light theme) or lightens (dark
    // theme) the track base into the chevron texture
    edgeOverlay: { color: "#000000", alpha: EDGE_TEXTURE_DARKEN },
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
      minX = Math.min(minX, p.x - NODE_W / 2);
      minY = Math.min(minY, p.y - node.h / 2);
      maxX = Math.max(maxX, p.x + NODE_W / 2);
      maxY = Math.max(maxY, p.y + node.h / 2);
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

  function pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const lenSq = (bx - ax) * (bx - ax) + (by - ay) * (by - ay) || 1;
    const u = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lenSq));
    return Math.hypot(px - (ax + u * (bx - ax)), py - (ay + u * (by - ay)));
  }

  /** Rectilinear (right-angle) elbow segments of an edge in world coords.
   * The vertical segment runs at the center of the column gap right before
   * the target column; since node centers snap to the column grid, this
   * always lands midway between the two columns. */
  function elbowSegments(g: { x1: number; y1: number; x2: number; y2: number }) {
    const mx = g.x2 - GAP_X / 2;
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

  function hitTestEdge(world: { x: number; y: number }): string | null {
    const threshold = EDGE_HIT_TOLERANCE_PX / zoom();
    for (const edge of validEdges()) {
      const g = edgeGeometry(edge, nodeMap(), positions());
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
  // flow phase of the chevron texture, advanced by the rAF loop
  let flowPhase = 0;
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
        const g = edgeGeometry(edge, nm, adjusted);
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
            if (np.x + NODE_W / 2 <= minX + 2 || np.x - NODE_W / 2 >= maxX - 2) continue;
            if (segY <= np.y - node.h / 2 - margin || segY >= np.y + node.h / 2 + margin) continue;
            // center the line in the gap between this node and the one above
            const column = columnOf(np.x);
            const above = [...nm.values()]
              .filter((other) => other.key !== node.key && columnOf(adjusted[other.key]?.x ?? 0) === column)
              .map((other) => ({ bottom: (adjusted[other.key]?.y ?? 0) + other.h / 2 }))
              .filter((entry) => entry.bottom <= np.y - node.h / 2 + margin)
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
          const half = node.h / 2;
          if (node.key !== draggingKey && np.y - half < prevBottom + GAP_Y) {
            np.y = prevBottom + GAP_Y + half;
            moved = true;
            changed = true;
          }
          prevBottom = Math.max(prevBottom, np.y + half);
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

  // the drawable tracks (merged corridors and prefixes), rebuilt only when
  // the graph, the selection or the theme changes — not per animation frame
  const tracks = createMemo(() =>
    buildTracks(validEdges(), {
      nodeMap: nodeMap(),
      positions: positions(),
      solved: solvedIds(),
      chain: ancestorChain(),
      selectedEdge: selectedEdge(),
      colors: colors(),
    })
  );

  function draw() {
    // read every reactive source before the guards, otherwise the effect
    // tracks nothing when the canvas has not mounted yet and never redraws
    const { w, h } = size();
    const z = zoom();
    const p = pan();
    const c = colors();
    const trackList = tracks();
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
      const stepDev = Math.max(1, Math.round(step * dpr));
      if (!gridTile || gridTileStep !== stepDev || gridTileColor !== c.content) {
        gridTile = document.createElement("canvas");
        gridTile.width = gridTile.height = stepDev;
        const tile = gridTile.getContext("2d");
        if (tile) {
          tile.fillStyle = c.content;
          tile.globalAlpha = 0.08;
          // a quarter dot at the corner: the wrapped tiles combine into the
          // same full dot the per-dot loop used to draw
          tile.beginPath();
          tile.arc(0, 0, dpr, 0, Math.PI * 2);
          tile.fill();
        }
        gridTileStep = stepDev;
        gridTileColor = c.content;
      }
      const pattern = ctx.createPattern(gridTile, "repeat");
      if (pattern) {
        ctx.save();
        // paint in device pixels: the pattern tiles axis-aligned and the
        // anchor keeps the dots on the world grid under the current pan
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const ox = (((p.x * dpr) % stepDev) + stepDev) % stepDev;
        const oy = (((p.y * dpr) % stepDev) + stepDev) % stepDev;
        ctx.translate(ox, oy);
        ctx.fillStyle = pattern;
        ctx.fillRect(-stepDev, -stepDev, w * dpr + 2 * stepDev, h * dpr + 2 * stepDev);
        ctx.restore();
      }
    }

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
      // rounded elbows: the joins soften the 90-degree turns
      ctx.lineJoin = "round";
      // round caps make the seams between consecutive pieces invisible
      ctx.lineCap = "round";
      ctx.stroke();
    };

    // the >>>>> texture: alternate coloring inside the band. Every period,
    // two 45-degree parallelograms (one per half of the band thickness) join
    // into a ">" filled with the texture color; the remaining band keeps the
    // base color. Everything stays within the track bounds.
    const drawChevrons = (
      segments: { ax: number; ay: number; bx: number; by: number }[],
      color: string,
      alpha: number,
      phase = 0
    ) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      const half = EDGE_WIDTH / 2;
      // 45-degree slant: advancing across half the band offsets half as far
      // along it
      const slant = half;
      for (const seg of segments) {
        const dx = seg.bx - seg.ax;
        const dy = seg.by - seg.ay;
        const len = Math.hypot(dx, dy);
        if (len < EDGE_TEXTURE_PERIOD) continue;
        const dirX = dx / len;
        const dirY = dy / len;
        const perpX = -dirY;
        const perpY = dirX;
        // point in world coords from local (u = along, v = across the band)
        const pt = (u: number, v: number): [number, number] => [
          (seg.ax + dirX * u + perpX * v) * z + p.x,
          (seg.ay + dirY * u + perpY * v) * z + p.y,
        ];
        // the flow phase slides the whole pattern forward; it is periodic,
        // so wrapping the phase back to zero is seamless
        for (let u0 = phase; u0 + EDGE_TEXTURE_W + slant <= len; u0 += EDGE_TEXTURE_PERIOD) {
          const [x1, y1] = pt(u0, -half);
          const [x2, y2] = pt(u0 + EDGE_TEXTURE_W, -half);
          const [x3, y3] = pt(u0 + EDGE_TEXTURE_W + slant, 0);
          const [x4, y4] = pt(u0 + EDGE_TEXTURE_W, half);
          const [x5, y5] = pt(u0, half);
          const [x6, y6] = pt(u0 + slant, 0);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x3, y3);
          ctx.lineTo(x4, y4);
          ctx.lineTo(x5, y5);
          ctx.lineTo(x6, y6);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    // solved tracks first, mixed and unsolved on top; within each group the
    // outline, base and texture layers are drawn in separate passes so that
    // joined tracks never cut their outlines through another track's base
    // stroke
    const ordered = [
      ...trackList.filter((t) => t.state === "solved"),
      ...trackList.filter((t) => t.state !== "solved"),
    ];
    for (const t of ordered) {
      strokeTrack(t.segments, t.selected ? c.primary : c.divider, t.alpha, EDGE_WIDTH + EDGE_BORDER_EXTRA);
    }
    for (const t of ordered) {
      strokeTrack(t.segments, t.style.base, t.alpha, EDGE_WIDTH);
    }
    for (const t of ordered) {
      drawChevrons(t.segments, t.style.overlayColor, t.style.overlayAlpha * t.alpha, flowPhase);
    }

    if (conn) {
      const from = nodeMap().get(conn.from);
      const pos = positions()[conn.from];
      if (from && pos) {
        const elbow = elbowSegments({ x1: pos.x + NODE_W / 2, y1: pos.y, x2: conn.x, y2: conn.y });
        strokeTrack(elbow.segments, c.divider, 1, EDGE_WIDTH + EDGE_BORDER_EXTRA);
        strokeTrack(elbow.segments, c.primary, 1, EDGE_WIDTH);
        drawChevrons(elbow.segments, EDGE_TEXTURE_SOLVE_COLOR, EDGE_TEXTURE_LIGHTEN);
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

  // the chevron texture flows toward the targets: a requestAnimationFrame
  // loop advances the texture phase and redraws; rAF pauses automatically
  // when the tab is hidden
  onMount(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      flowPhase = (flowPhase + ((now - last) / 1000) * EDGE_FLOW_SPEED) % EDGE_TEXTURE_PERIOD;
      last = now;
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onCleanup(() => cancelAnimationFrame(raf));
  });

  createEffect(() => {
    fullTheme();
    const content = probeColor("text-layer-content", FALLBACK_TEXT_COLOR);
    const dark = themeStore.colorScheme === "dark";
    setColors({
      content,
      primary: probeColor("text-primary", FALLBACK_PRIMARY_COLOR),
      success: probeColor("text-success", FALLBACK_SUCCESS_COLOR),
      warning: probeColor("text-warning", FALLBACK_WARNING_COLOR),
      // tracks are outlined in the divider color, matching <Divider />
      divider: probeColor("bg-layer-content/10", FALLBACK_DIVIDER_COLOR, "backgroundColor"),
      edgeBase: dark ? "#444444" : "#dddddd",
      edgeOverlay: dark
        ? { color: "#ffffff", alpha: EDGE_TEXTURE_LIGHTEN }
        : { color: "#000000", alpha: EDGE_TEXTURE_DARKEN },
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
        [node.key]: { x: snapX(startPos.x + dx / zoom()), y: snapGrid(startPos.y + dy / zoom()) },
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
    setConnecting({ from, x: snapGrid(world.x), y: snapGrid(world.y) });
    const onMove = (ev: PointerEvent) => {
      const w = toWorld(ev.clientX, ev.clientY);
      setConnecting({ from, x: snapGrid(w.x), y: snapGrid(w.y) });
      // snap feedback: highlight the nearest in-port within reach
      let nearest: string | null = null;
      let nearestDist = PORT_SNAP_RADIUS;
      for (const node of nodes()) {
        if (node.key === from) continue;
        const p = positions()[node.key];
        if (!p) continue;
        // the in-port sits on the target's left edge, at its center height
        const dist = Math.hypot(w.x - (p.x - NODE_W / 2), w.y - p.y);
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
      addToast({ level: "info", description: t("challenge.milestone.editor.duplicate"), duration: 5000 });
      return;
    }
    if (createsCycle(from, to)) {
      addToast({ level: "warning", description: t("challenge.milestone.editor.cycle"), duration: 5000 });
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
    setEdges(baseline().filter(isValidEdge));
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
      const milestone = milestoneMap().get(nodeIdOf(key));
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
      handleHttpError(err, t("general.actions.upload.status.fail"));
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
      toastSuccess(t("challenge.milestone.editor.saved", { count }));
      setBaseline(validEdges());
      setSelectedEdge(null);
    } catch (err) {
      handleHttpError(err, t("general.actions.save.status.fail"));
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
        <Button ghost square title={t("challenge.milestone.editor.zoomOut")} onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <span class="shrink-0 icon-[fluent--zoom-out-20-regular] w-5 h-5" />
        </Button>
        <Button ghost square title={t("challenge.milestone.editor.zoomIn")} onClick={() => zoomBy(ZOOM_STEP)}>
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
                              "absolute flex items-center gap-2 px-3 rounded-lg border-2 backdrop-blur-sm cursor-pointer transition-colors pointer-events-auto",
                              "bg-layer/80",
                              dimmedClass(node.key),
                              node.key === selectedNode() && "ring-2 ring-primary/70",
                              challengeBorderClass(node)
                            )}
                            style={{
                              left: `${pos().x - NODE_W / 2}px`,
                              top: `${pos().y - node.h / 2}px`,
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
                          <Show when={milestoneMap().get(node.id)}>
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
                                    "absolute flex flex-col justify-center gap-1 px-3 rounded-lg border-2 backdrop-blur-sm cursor-pointer transition-colors pointer-events-auto",
                                    "bg-layer/80 hover:border-primary/60",
                                    dimmedClass(node.key),
                                    node.key === selectedNode() && "ring-2 ring-primary/70",
                                    achieved() ? "border-success/60" : "border-layer-content/10"
                                  )}
                                  style={{
                                    left: `${pos().x - NODE_W / 2}px`,
                                    top: `${pos().y - node.h / 2}px`,
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
        challengeMap={challengeMap()}
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
  challengeMap: Map<number, Challenge>;
  onClose: () => void;
  onEdit: (milestone: Milestone) => void;
}) {
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
                            <span class="flex-1 truncate">{props.challengeMap.get(id)?.name ?? `#${id}`}</span>
                            <span class="shrink-0 opacity-60">{props.challengeMap.get(id)?.score} pts</span>
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

    const milestone: Milestone = {
      id: props.milestone?.id ?? 0,
      created_at: props.milestone?.created_at ?? DateTime.now(),
      updated_at: DateTime.now(),
      game_id: props.gameId,
      name: name().trim(),
      description: description().trim(),
      bonus_score: Math.min(MAX_BONUS_SCORE, Math.max(0, bonusScore())),
      // the avatar is managed by the node icon on the canvas
      avatar: props.milestone?.avatar ?? null,
      // prerequisites are managed by drag-connecting on the canvas
      prerequisites: props.milestone?.prerequisites ?? [],
    };

    try {
      if (props.milestone) {
        await updateMutation.mutateAsync({ game_id: props.gameId, milestone });
      } else {
        await createMutation.mutateAsync({ game_id: props.gameId, milestone });
      }
    } catch {
      // the mutation hooks already toast failures
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
                  max={MAX_BONUS_SCORE}
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
