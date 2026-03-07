import * as THREE from "three";
import type { GraphNode, GraphLink } from "./graph-constants.js";
import { CARD_W } from "./graph-constants.js";

// ─── Physics constants ───

const DAMPING = 0.9;
const REPULSION = 8000;
const ATTRACTION = 0.008;
const LINK_DIST = 55;
const GRAVITY = 0.004;

/**
 * Advance the force-directed simulation by one timestep.
 *
 * Contract: mutates node.position and node.velocity in place.
 * The caller is responsible for syncing mesh positions after this call.
 */
export function simulateForces(
  nodes: GraphNode[],
  links: GraphLink[],
  dt: number,
  is2D: boolean,
): void {
  const visibleNodes = nodes.filter((n) => n.visible && !n.pinned);
  const allVisible = nodes.filter((n) => n.visible);

  // Repulsion between all visible node pairs
  for (let i = 0; i < allVisible.length; i++) {
    for (let j = i + 1; j < allVisible.length; j++) {
      const a = allVisible[i];
      const b = allVisible[j];
      const diff = new THREE.Vector3().subVectors(a.position, b.position);
      const dist = diff.length() || 1;
      const force = REPULSION / (dist * dist);
      diff.normalize().multiplyScalar(force);
      if (!a.pinned) a.velocity.add(diff);
      if (!b.pinned) b.velocity.sub(diff);
    }
  }

  // Link spring attraction
  for (const link of links) {
    if (!link.visible) continue;
    const diff = new THREE.Vector3().subVectors(
      link.target.position,
      link.source.position,
    );
    const dist = diff.length();
    const force = (dist - LINK_DIST) * ATTRACTION;
    diff.normalize().multiplyScalar(force);
    if (!link.source.pinned) link.source.velocity.add(diff);
    if (!link.target.pinned) link.target.velocity.sub(diff);
  }

  // Center gravity toward origin
  for (const node of visibleNodes) {
    const toCenter = new THREE.Vector3()
      .sub(node.position)
      .multiplyScalar(GRAVITY);
    node.velocity.add(toCenter);
  }

  // Integrate velocities into positions
  for (const node of visibleNodes) {
    node.velocity.multiplyScalar(DAMPING);
    if (is2D) {
      node.velocity.z = 0;
      node.position.z *= 0.9; // Collapse Z toward 0
    }
    node.position.addScaledVector(node.velocity, dt * 60);
  }
}

/**
 * Update Three.js link geometry (line endpoints, arrow, particles) after physics.
 *
 * Call this after simulateForces and after syncing mesh positions.
 */
export function updateLinkGeometry(links: GraphLink[], dt: number): void {
  for (const link of links) {
    if (!link.visible) continue;

    const positions = link.line.geometry.attributes
      .position as THREE.BufferAttribute;
    positions.setXYZ(
      0,
      link.source.position.x,
      link.source.position.y,
      link.source.position.z,
    );
    positions.setXYZ(
      1,
      link.target.position.x,
      link.target.position.y,
      link.target.position.z,
    );
    positions.needsUpdate = true;

    // Arrow near the target card edge
    const dir = new THREE.Vector3().subVectors(
      link.target.position,
      link.source.position,
    );
    const len = dir.length();
    dir.normalize();
    const arrowPos = new THREE.Vector3()
      .copy(link.source.position)
      .addScaledVector(dir, len - CARD_W * 0.55);
    link.arrow.position.copy(arrowPos);
    link.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    // Particles flowing along the link
    const pPos = link.particles.geometry.attributes
      .position as THREE.BufferAttribute;
    for (let i = 0; i < link.particleProgress.length; i++) {
      link.particleProgress[i] = (link.particleProgress[i] + dt * 0.25) % 1;
      const t = link.particleProgress[i];
      pPos.setXYZ(
        i,
        link.source.position.x +
          (link.target.position.x - link.source.position.x) * t,
        link.source.position.y +
          (link.target.position.y - link.source.position.y) * t,
        link.source.position.z +
          (link.target.position.z - link.source.position.z) * t,
      );
    }
    pPos.needsUpdate = true;
  }
}
