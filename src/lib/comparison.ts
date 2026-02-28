import type { LoadedFile, DomainEvent, BoundaryAssumption } from '../schema/types.js';

export type OverlapKind = 'same-name' | 'same-aggregate' | 'assumption-conflict';

export interface Overlap {
  kind: OverlapKind;
  label: string;
  roles: string[];
  details: string;
}

/** Find events that share the same name across different roles */
function findNameOverlaps(files: LoadedFile[]): Overlap[] {
  const byName = new Map<string, { role: string; event: DomainEvent }[]>();
  for (const f of files) {
    for (const e of f.data.domain_events) {
      const list = byName.get(e.name) ?? [];
      list.push({ role: f.role, event: e });
      byName.set(e.name, list);
    }
  }
  const overlaps: Overlap[] = [];
  for (const [name, entries] of byName) {
    if (entries.length > 1) {
      const roles = [...new Set(entries.map((e) => e.role))];
      if (roles.length > 1) {
        overlaps.push({
          kind: 'same-name',
          label: name,
          roles,
          details: `Event "${name}" appears in roles: ${roles.join(', ')}`,
        });
      }
    }
  }
  return overlaps;
}

/** Find aggregates that appear in multiple roles */
function findAggregateOverlaps(files: LoadedFile[]): Overlap[] {
  const byAgg = new Map<string, Set<string>>();
  for (const f of files) {
    for (const e of f.data.domain_events) {
      const set = byAgg.get(e.aggregate) ?? new Set();
      set.add(f.role);
      byAgg.set(e.aggregate, set);
    }
  }
  const overlaps: Overlap[] = [];
  for (const [agg, roles] of byAgg) {
    if (roles.size > 1) {
      const roleList = [...roles];
      overlaps.push({
        kind: 'same-aggregate',
        label: agg,
        roles: roleList,
        details: `Aggregate "${agg}" claimed by roles: ${roleList.join(', ')}`,
      });
    }
  }
  return overlaps;
}

/** Find boundary assumptions that may conflict across roles */
function findAssumptionConflicts(files: LoadedFile[]): Overlap[] {
  const overlaps: Overlap[] = [];
  const allAssumptions: { role: string; assumption: BoundaryAssumption }[] = [];
  for (const f of files) {
    for (const a of f.data.boundary_assumptions) {
      allAssumptions.push({ role: f.role, assumption: a });
    }
  }

  // Check for ownership conflicts on the same events
  for (let i = 0; i < allAssumptions.length; i++) {
    for (let j = i + 1; j < allAssumptions.length; j++) {
      const a = allAssumptions[i];
      const b = allAssumptions[j];
      if (a.role === b.role) continue;

      const sharedEvents = a.assumption.affects_events.filter((e) =>
        b.assumption.affects_events.includes(e)
      );

      if (sharedEvents.length > 0 && a.assumption.type === b.assumption.type) {
        overlaps.push({
          kind: 'assumption-conflict',
          label: `${a.assumption.id} vs ${b.assumption.id}`,
          roles: [a.role, b.role],
          details: `Both assume about ${sharedEvents.join(', ')}: "${a.assumption.statement}" vs "${b.assumption.statement}"`,
        });
      }
    }
  }
  return overlaps;
}

export function compareFiles(files: LoadedFile[]): Overlap[] {
  if (files.length < 2) return [];
  return [
    ...findNameOverlaps(files),
    ...findAggregateOverlaps(files),
    ...findAssumptionConflicts(files),
  ];
}
