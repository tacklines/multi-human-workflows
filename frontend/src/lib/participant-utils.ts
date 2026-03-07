import { t } from "./i18n.js";

export interface ParticipantLike {
  id: string;
  display_name?: string | null;
}

/**
 * Return a display name for the participant with the given id.
 * Falls back to the first 8 characters of the id when no participant is found.
 * When id is null/undefined, returns the i18n "unassigned" string.
 */
export function getParticipantName(
  id: string | null | undefined,
  participants: ParticipantLike[],
  fallbackKey = "taskDetail.sidebar.unassigned",
): string {
  if (!id) return t(fallbackKey);
  const p = participants.find((p) => p.id === id);
  return p?.display_name ?? id.slice(0, 8);
}

/**
 * Maps workspace/agent status strings to Shoelace badge variant names.
 * Includes the `destroyed` key which some older copies omit.
 */
export const WS_STATUS_VARIANT: Record<string, string> = {
  running: "success",
  creating: "warning",
  pending: "warning",
  failed: "danger",
  stopped: "neutral",
  stopping: "neutral",
  destroyed: "neutral",
};
