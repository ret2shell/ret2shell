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

const REGION_GAP = 96;
// nodes snap to this virtual grid while dragging; the canvas dot grid uses
// the same step, and gap centers between columns form the vertical grid
// lines that edge bends align to
const GRID_Y = 24;

function heightOf(key: string) {
  return key.startsWith("c") ? CHALLENGE_H : MILESTONE_H;
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

/** Lays out the full graph from scratch. Connected components (independent
 * multi-way trees) are stacked into separate vertical regions. Within a tree,
 * a node with predecessors hugs them (column = deepest predecessor + 1); a
 * node without predecessors but with successors hugs the nearest successor
 * (column = nearest successor - 1). When an edge spans over intermediate
 * columns, the covered slots in those columns are left empty and following
 * nodes shift down, so long edges never cross a node. Isolated nodes share a
 * trailing single-column region. */
function fullLayout(keys: string[], edges: Edge[]) {
  const keySet = new Set(keys);
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  const adjacent = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(value);
  };
  for (const edge of edges) {
    if (!keySet.has(edge.from) || !keySet.has(edge.to)) continue;
    push(preds, edge.to, edge.from);
    push(succs, edge.from, edge.to);
    push(adjacent, edge.from, edge.to);
    push(adjacent, edge.to, edge.from);
  }

  // connected components over the undirected view of the graph
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
      for (const next of adjacent.get(current) ?? []) {
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
    const am = a.some((k) => !k.startsWith("c")) ? 0 : 1;
    const bm = b.some((k) => !k.startsWith("c")) ? 0 : 1;
    return am - bm || a[0].localeCompare(b[0]);
  });

  const result: Record<string, NodePos> = {};
  let regionY = PAD;
  // lowest occupied bottom per column across all regions placed so far
  const columnBottom = new Map<number, number>();

  for (const tree of trees) {
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
    // final columns via fixpoint iteration: a node with predecessors hugs the
    // deepest one (column = deepest predecessor + 1); a source node without
    // predecessors hugs its nearest successor (column = nearest successor - 1)
    const columnOfNode = new Map<string, number>(tree.map((key) => [key, minLayer.get(key) ?? 0]));
    for (let i = 0; i < tree.length; i++) {
      let changed = false;
      for (const key of tree) {
        const keyPreds = preds.get(key) ?? [];
        const keySuccs = succs.get(key) ?? [];
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

    // place columns left to right; sources of spanning edges are always
    // placed before the intermediate columns they cross
    const byColumn = new Map<number, string[]>();
    for (const key of tree) {
      const column = columnOfNode.get(key) ?? 0;
      if (!byColumn.has(column)) byColumn.set(column, []);
      byColumn.get(column)?.push(key);
    }
    // pass A (left to right): anchor every node to the lower-median center
    // of its predecessors
    const outerBottom = new Map(columnBottom);
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
        const centers = (preds.get(key) ?? [])
          .filter((p) => result[p])
          .map((p) => result[p].y + heightOf(p) / 2)
          .sort((a, b) => a - b);
        if (centers.length > 0) anchor.set(key, centers[Math.floor((centers.length - 1) / 2)]);
      }
      const firstSucc = (key: string) => (succs.get(key) ?? []).sort()[0] ?? "";
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
        for (const succ of succs.get(key) ?? []) {
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

    // pass B (right to left, runs once): pull every node toward the
    // lower-median center of its successors; successor attraction wins over
    // the predecessor anchor when they conflict. a move is skipped when it
    // would overlap another node, a spanning edge, or the previous region
    for (const column of [...byColumn.keys()].sort((a, b) => b - a)) {
      for (const key of byColumn.get(column)!) {
        const centers = (succs.get(key) ?? []).map((s) => result[s].y + heightOf(s) / 2).sort((a, b) => a - b);
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
      if (!edge.from.startsWith("c")) continue;
      if (!map.has(edge.to)) map.set(edge.to, []);
      map.get(edge.to)?.push(Number(edge.from.slice(1)));
    }
    return map;
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
    content: "#888888",
    muted: "#888888",
    primary: "#888888",
    success: "#888888",
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
    const z = Math.min(1, Math.max(0.25, Math.min(rect.width / bw, rect.height / bh)));
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
    const nz = Math.min(2, Math.max(0.25, z * factor));
    const wx = (mx - pan().x) / z;
    const wy = (my - pan().y) / z;
    setZoom(nz);
    setPan({ x: mx - wx * nz, y: my - wy * nz });
  }

  function edgeGeometry(edge: Edge, pos: Record<string, NodePos> = positions()) {
    const from = nodeMap().get(edge.from);
    const to = nodeMap().get(edge.to);
    if (!from || !to || !pos[from.key] || !pos[to.key]) return null;
    return {
      x1: pos[from.key].x + NODE_W,
      y1: pos[from.key].y + from.h / 2,
      x2: pos[to.key].x,
      y2: pos[to.key].y + to.h / 2,
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
    const threshold = 8 / zoom();
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
    const margin = 8;
    for (let iter = 0; iter < 16; iter++) {
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
    if (changed) setPositions(adjusted);
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

    const step = 24 * z;
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
    // gap before the target; the trunk carries the unsolved color on top
    // unless every predecessor is solved
    const byTarget = new Map<string, Edge[]>();
    for (const edge of edgeList) {
      if (!byTarget.has(edge.to)) byTarget.set(edge.to, []);
      byTarget.get(edge.to)?.push(edge);
    }
    const isSolved = (edge: Edge) => edge.from.startsWith("c") && solved.has(Number(edge.from.slice(1)));
    const styleOf = (isSelected: boolean, solvedFlag: boolean) => {
      if (isSelected) return { color: c.primary, alpha: 1, width: 3 };
      if (solvedFlag) return { color: c.success, alpha: 0.6, width: 2 };
      return { color: c.muted, alpha: 1, width: 2 };
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
      const isSelected = edgeKey(edge) === selected;
      const style = styleOf(isSelected, isSolved(edge));
      ctx.beginPath();
      ctx.moveTo(g.x1 * z + p.x, g.y1 * z + p.y);
      for (const seg of segments) {
        ctx.lineTo(seg.bx * z + p.x, seg.by * z + p.y);
      }
      ctx.strokeStyle = style.color;
      ctx.globalAlpha = style.alpha;
      ctx.lineWidth = style.width;
      ctx.stroke();
      // small squares at the right-angle corners (the junction square at the
      // target side is owned by the trunk)
      ctx.fillStyle = style.color;
      const corners = bundled ? elbow.corners.slice(0, -1) : elbow.corners;
      for (const corner of corners) {
        const cx = corner.x * z + p.x;
        const cy = corner.y * z + p.y;
        const size = isSelected ? 4 : 3;
        ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
      }
      ctx.globalAlpha = 1;
    };

    // solved edges first, unsolved on top
    for (const edge of edgeList.filter((e) => isSolved(e))) drawMember(edge);
    for (const edge of edgeList.filter((e) => !isSolved(e))) drawMember(edge);

    // shared trunks
    for (const members of byTarget.values()) {
      if (members.length < 2) continue;
      const g = edgeGeometry(members[0]);
      if (!g) continue;
      const anySelected = members.some((e) => edgeKey(e) === selected);
      const style = styleOf(anySelected, members.every(isSolved));
      const mx = (g.x2 - GAP_X / 2) * z + p.x;
      const y2 = g.y2 * z + p.y;
      ctx.beginPath();
      ctx.moveTo(mx, y2);
      ctx.lineTo(g.x2 * z + p.x, y2);
      ctx.strokeStyle = style.color;
      ctx.globalAlpha = style.alpha;
      ctx.lineWidth = style.width;
      ctx.stroke();
      ctx.fillStyle = style.color;
      const size = anySelected ? 4.5 : 3.5;
      ctx.fillRect(mx - size, y2 - size, size * 2, size * 2);
      ctx.globalAlpha = 1;
    }

    if (conn) {
      const from = nodeMap().get(conn.from);
      const pos = positions()[conn.from];
      if (from && pos) {
        const x1 = (pos.x + NODE_W) * z + p.x;
        const y1 = (pos.y + from.h / 2) * z + p.y;
        const elbow = elbowSegments({ x1: pos.x + NODE_W, y1: pos.y + from.h / 2, x2: conn.x, y2: conn.y });
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        for (const seg of elbow.segments) {
          ctx.lineTo(seg.bx * z + p.x, seg.by * z + p.y);
        }
        ctx.strokeStyle = c.primary;
        ctx.lineWidth = 2;
        ctx.stroke();
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
      const nz = Math.min(2, Math.max(0.25, z * Math.exp(-e.deltaY * 0.0015)));
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
      if (!admin()) return;
      if (e.key === "Escape") {
        setSelectedEdge(null);
        setConnecting(null);
        return;
      }
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
    setColors({
      content: probeColor("text-layer-content", "#888888"),
      muted: mixColors(
        probeColor("text-layer-content", "#888888"),
        probeColor("bg-layer", "#111111", "backgroundColor"),
        0.25
      ),
      primary: probeColor("text-primary", "#3b82f6"),
      success: probeColor("text-success", "#22c55e"),
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
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) setPan({ x: startPan.x + dx, y: startPan.y + dy });
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      if (!moved && admin()) {
        const hit = hitTestEdge(toWorld(ev.clientX, ev.clientY));
        setSelectedEdge(hit);
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
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
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
        if (node.kind === "milestone") {
          setDetailId(node.id);
        } else {
          navigate(`/games/${props.gameId}/challenges?challenge=${node.id}`);
        }
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
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setConnecting(null);
      const target = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest("[data-port-in]")
        ?.getAttribute("data-port-in");
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
    if (key.startsWith("c")) {
      await challengeAvatarMutation.mutateAsync({
        game_id: props.gameId,
        challenge_id: Number(key.slice(1)),
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
                          <div
                            title={node.name}
                            class={clsx(
                              "absolute flex items-center gap-2 px-3 rounded-lg border-2 backdrop-blur-sm cursor-pointer transition-colors pointer-events-auto",
                              "bg-layer/80",
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
                              <div
                                data-port-in={node.key}
                                class="absolute w-3 h-3 rounded-full bg-layer-content/30 hover:bg-primary! cursor-crosshair"
                                style={{ left: "-6px", top: "50%", transform: "translateY(-50%)" }}
                              />
                              <div
                                data-port-out={node.key}
                                class="absolute w-3 h-3 rounded-full bg-layer-content/30 hover:bg-primary! cursor-crosshair"
                                style={{ right: "-6px", top: "50%", transform: "translateY(-50%)" }}
                                onPointerDown={(e) => onPortPointerDown(e, node.key)}
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
                                <div
                                  title={milestone().name}
                                  class={clsx(
                                    "absolute flex flex-col justify-center gap-1 px-3 rounded-lg border-2 backdrop-blur-sm cursor-pointer transition-colors pointer-events-auto",
                                    "bg-layer/80 hover:border-primary/60",
                                    achieved() ? "border-success/60" : "border-layer-content/10"
                                  )}
                                  style={{
                                    left: `${pos().x}px`,
                                    top: `${pos().y}px`,
                                    width: `${NODE_W}px`,
                                    height: `${MILESTONE_H}px`,
                                  }}
                                  onPointerDown={(e) => onNodePointerDown(e, node)}
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
                                    <div
                                      data-port-in={node.key}
                                      class="absolute w-3 h-3 rounded-full bg-layer-content/30 hover:bg-primary! cursor-crosshair"
                                      style={{ left: "-6px", top: "50%", transform: "translateY(-50%)" }}
                                    />
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
