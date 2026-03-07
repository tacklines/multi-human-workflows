import * as THREE from "three";
import type {
  TaskStatus,
  TaskPriority,
  TaskView,
} from "../state/task-types.js";

// ─── Card dimensions in world units ───

export const CARD_W = 32;
export const CARD_H = 18;

// ─── Opacity for dimmed nodes ───

export const DIM_OPACITY = 0.12;

// ─── Color maps ───

export const STATUS_COLORS: Record<TaskStatus, number> = {
  open: 0x64748b,
  in_progress: 0x3b82f6,
  done: 0x22c55e,
  closed: 0x475569,
};

export const STATUS_HEX: Record<TaskStatus, string> = {
  open: "#64748b",
  in_progress: "#3b82f6",
  done: "#22c55e",
  closed: "#475569",
};

export const PRIORITY_HEX: Record<TaskPriority, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#64748b",
  low: "#60a5fa",
};

// ─── Data structures ───

export interface GraphNode {
  task: TaskView;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  pinned: boolean;
  visible: boolean;
  selected: boolean;
  dimmed: boolean;
}

export interface GraphLink {
  source: GraphNode;
  target: GraphNode;
  line: THREE.Line;
  arrow: THREE.Mesh;
  particles: THREE.Points;
  particleProgress: Float32Array;
  visible: boolean;
}
