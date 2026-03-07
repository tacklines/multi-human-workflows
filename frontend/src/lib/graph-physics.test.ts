import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { simulateForces } from "./graph-physics.js";
import type { GraphNode, GraphLink } from "./graph-constants.js";

// ─── Helpers ───

function makeNode(x = 0, y = 0, z = 0, pinned = false): GraphNode {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial(),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.5, 8),
    new THREE.MeshBasicMaterial(),
  );
  return {
    task: {} as never,
    position: new THREE.Vector3(x, y, z),
    velocity: new THREE.Vector3(0, 0, 0),
    mesh,
    ring,
    pinned,
    visible: true,
    selected: false,
    dimmed: false,
  };
}

function makeLink(source: GraphNode, target: GraphNode): GraphLink {
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    source.position,
    target.position,
  ]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial());

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(1, 2, 6),
    new THREE.MeshBasicMaterial(),
  );

  const pCount = 3;
  const pPos = new Float32Array(pCount * 3);
  const pProgress = new Float32Array(pCount);
  for (let i = 0; i < pCount; i++) pProgress[i] = i / pCount;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial());

  return {
    source,
    target,
    line,
    arrow,
    particles,
    particleProgress: pProgress,
    visible: true,
  };
}

function runSteps(
  nodes: GraphNode[],
  links: GraphLink[],
  steps: number,
  dt = 1 / 60,
  is2D = false,
) {
  for (let i = 0; i < steps; i++) {
    simulateForces(nodes, links, dt, is2D);
  }
}

// ─── Tests ───

describe("simulateForces — repulsion", () => {
  it("nodes placed very close together diverge after simulation steps", () => {
    // Nodes at exactly the same point produce a zero-length diff vector which
    // THREE.Vector3.normalize() leaves as zero — no force can be applied.
    // Use a small but non-zero separation so repulsion has a direction to act on.
    const a = makeNode(0.001, 0, 0);
    const b = makeNode(-0.001, 0, 0);

    runSteps([a, b], [], 5);

    const dist = a.position.distanceTo(b.position);
    expect(dist).toBeGreaterThan(0.002); // must have moved apart
  });

  it("nodes placed close together move apart", () => {
    const a = makeNode(-1, 0, 0);
    const b = makeNode(1, 0, 0);
    const initialDist = a.position.distanceTo(b.position);

    runSteps([a, b], [], 10);

    const finalDist = a.position.distanceTo(b.position);
    expect(finalDist).toBeGreaterThan(initialDist);
  });
});

describe("simulateForces — link attraction", () => {
  it("linked nodes that are far apart move closer", () => {
    const a = makeNode(-200, 0, 0);
    const b = makeNode(200, 0, 0);
    const link = makeLink(a, b);
    const initialDist = a.position.distanceTo(b.position);

    runSteps([a, b], [link], 20);

    const finalDist = a.position.distanceTo(b.position);
    expect(finalDist).toBeLessThan(initialDist);
  });
});

describe("simulateForces — center gravity", () => {
  it("isolated node far from origin moves closer to origin", () => {
    const a = makeNode(1000, 0, 0);
    const initialDist = a.position.length();

    runSteps([a], [], 30);

    const finalDist = a.position.length();
    expect(finalDist).toBeLessThan(initialDist);
  });
});

describe("simulateForces — 2D mode", () => {
  it("constrains Z to zero after many steps", () => {
    const a = makeNode(0, 0, 50);
    const b = makeNode(10, 0, -50);

    runSteps([a, b], [], 120, 1 / 60, true);

    expect(Math.abs(a.position.z)).toBeLessThan(0.01);
    expect(Math.abs(b.position.z)).toBeLessThan(0.01);
  });

  it("does not constrain Z in 3D mode", () => {
    const a = makeNode(0, 0, 50);
    const b = makeNode(10, 0, -50);

    // Just a few steps — nodes still have Z displacement
    runSteps([a, b], [], 5, 1 / 60, false);

    // At least one node should still have non-trivial Z
    const maxZ = Math.max(Math.abs(a.position.z), Math.abs(b.position.z));
    expect(maxZ).toBeGreaterThan(0.1);
  });
});

describe("simulateForces — pinned nodes", () => {
  it("pinned nodes do not move", () => {
    const a = makeNode(0, 0, 0, true /* pinned */);
    const b = makeNode(5, 0, 0);

    const aInitialX = a.position.x;
    const aInitialY = a.position.y;
    const aInitialZ = a.position.z;

    runSteps([a, b], [], 20);

    expect(a.position.x).toBe(aInitialX);
    expect(a.position.y).toBe(aInitialY);
    expect(a.position.z).toBe(aInitialZ);
  });

  it("unpinned node is affected by simulation even when partner is pinned", () => {
    const a = makeNode(0, 0, 0, true /* pinned */);
    const b = makeNode(5, 0, 0);
    const bInitial = b.position.clone();

    runSteps([a, b], [], 20);

    expect(b.position.distanceTo(bInitial)).toBeGreaterThan(0);
  });
});

describe("simulateForces — convergence", () => {
  it("velocities decay toward zero over many steps with no external disturbance", () => {
    const a = makeNode(-10, 0, 0);
    const b = makeNode(10, 0, 0);
    const link = makeLink(a, b);

    // Run for a long time to allow convergence
    runSteps([a, b], [link], 300);

    const speedA = a.velocity.length();
    const speedB = b.velocity.length();
    expect(speedA).toBeLessThan(1);
    expect(speedB).toBeLessThan(1);
  });
});
