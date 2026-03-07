import * as THREE from "three";
import type { TaskView } from "../state/task-types.js";
import {
  STATUS_LABELS,
  TASK_TYPE_LABELS,
  PRIORITY_LABELS,
} from "../state/task-types.js";
import { CARD_W, CARD_H, PRIORITY_HEX } from "./graph-constants.js";

// ─── Canvas utilities ───

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = test;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  } else if (lines.length === maxLines) {
    // Truncate last line with ellipsis
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxWidth && last.length > 0) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = last + "…";
  }

  return lines;
}

// ─── Card mesh renderer ───

export function renderCardToTexture(
  task: TaskView,
  statusColor: THREE.Color,
): { mesh: THREE.Mesh; texture: THREE.CanvasTexture } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const W = 768;
  const H = 432;
  canvas.width = W;
  canvas.height = H;
  const pad = 30;
  const radius = 24;
  const barW = 12;

  const sr = Math.round(statusColor.r * 255);
  const sg = Math.round(statusColor.g * 255);
  const sb = Math.round(statusColor.b * 255);

  // Clear and draw background card
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "rgba(12, 12, 20, 0.95)";
  roundRect(ctx, 0, 0, W, H, radius);
  ctx.fill();

  // Status accent bar (left strip, clipped to card shape)
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, 0, W, H, radius);
  ctx.clip();
  ctx.fillStyle = `rgb(${sr}, ${sg}, ${sb})`;
  ctx.fillRect(0, 0, barW, H);
  // Glow on the bar
  const barGlow = ctx.createLinearGradient(barW, 0, barW + 30, 0);
  barGlow.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, 0.15)`);
  barGlow.addColorStop(1, "transparent");
  ctx.fillStyle = barGlow;
  ctx.fillRect(barW, 0, 30, H);
  ctx.restore();

  // Border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, W - 2, H - 2, radius);
  ctx.stroke();

  const textX = barW + pad;

  // Type badge
  const typeLabel = TASK_TYPE_LABELS[task.task_type]?.toUpperCase() ?? "TASK";
  ctx.font = "bold 26px monospace";
  const typeMet = ctx.measureText(typeLabel);
  const badgePad = 8;
  const badgeW = typeMet.width + badgePad * 2;
  const badgeH = 36;
  const badgeY = pad;
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  roundRect(ctx, textX, badgeY, badgeW, badgeH, 5);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.fillText(typeLabel, textX + badgePad, badgeY + 27);

  // Ticket ID (right of type badge)
  ctx.font = "bold 28px monospace";
  ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, 0.8)`;
  ctx.fillText(task.ticket_id, textX + badgeW + 16, badgeY + 27);

  // Title (up to 3 lines)
  ctx.font = '600 36px -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  const maxTitleW = W - textX - pad;
  const titleLines = wrapText(ctx, task.title, maxTitleW, 3);
  let titleY = badgeY + badgeH + 44;
  for (const line of titleLines) {
    ctx.fillText(line, textX, titleY);
    titleY += 44;
  }

  // Status label (bottom)
  const statusLabel = STATUS_LABELS[task.status] ?? task.status;
  ctx.font = '500 26px -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, 0.7)`;
  ctx.fillText(statusLabel, textX, H - pad - 6);

  // Commit indicator (bottom center)
  if (task.commit_hashes?.length > 0) {
    const commitLabel = `${task.commit_hashes.length} commit${task.commit_hashes.length > 1 ? "s" : ""}`;
    ctx.font = "500 22px monospace";
    ctx.fillStyle = "rgba(34, 197, 94, 0.6)";
    ctx.textAlign = "center";
    ctx.fillText(commitLabel, W / 2, H - pad - 6);
    ctx.textAlign = "left";
  } else if (task.no_code_change) {
    ctx.font = "500 22px monospace";
    ctx.fillStyle = "rgba(168, 85, 247, 0.5)";
    ctx.textAlign = "center";
    ctx.fillText("NO CODE", W / 2, H - pad - 6);
    ctx.textAlign = "left";
  }

  // Priority label (bottom right)
  const prioLabel = PRIORITY_LABELS[task.priority] ?? task.priority;
  const prioHex = PRIORITY_HEX[task.priority] ?? "#64748b";
  ctx.font = '500 26px -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = prioHex;
  ctx.textAlign = "right";
  ctx.fillText(prioLabel, W - pad, H - pad - 4);
  ctx.textAlign = "left";

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, texture };
}
