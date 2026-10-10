import type { Board, Need } from './types';

/** fulfilledQty is committed on owner confirmation in the existing API, not on arrival. */
export function resourcePipeline(need: Need, board: Board) {
  const deliveries = board.dispatches.filter((d) => d.requirementId === need.requirementId);
  const delivered = deliveries
    .filter((d) => d.status === 'DEPLOYED')
    .reduce((n, d) => n + d.quantity, 0);
  const inTransit = deliveries
    .filter((d) => d.status === 'DISPATCHED' || d.status === 'DISTRIBUTION_PENDING')
    .reduce((n, d) => n + d.quantity, 0);
  const awaitingOwner = Math.max(0, need.pendingQty);
  const committed = Math.max(need.fulfilledQty, delivered + inTransit);
  return {
    required: need.requiredQty,
    delivered,
    inTransit,
    awaitingOwner,
    unallocated: Math.max(0, need.requiredQty - committed - awaitingOwner),
    unmet: Math.max(0, need.requiredQty - delivered),
  };
}

export function districtMetrics(board: Board) {
  const pipelines = board.needs.map((need) => resourcePipeline(need, board));
  return {
    critical: board.areas.filter((a) => a.priority === 1).length,
    high: board.areas.filter((a) => a.priority === 2).length,
    shortages: pipelines.filter((p) => p.unallocated > 0).length,
    pending: board.requests.filter((r) => r.status === 'PENDING').length,
    active: board.dispatches.filter(
      (d) => d.status === 'DISPATCHED' || d.status === 'DISTRIBUTION_PENDING',
    ).length,
    deployed: board.dispatches.filter((d) => d.status === 'DEPLOYED').length,
    // Equal weighting avoids adding packs, teams and shelter places together.
    fulfillment: pipelines.length
      ? Math.round(
          (pipelines.reduce((n, p) => n + Math.min(1, p.delivered / Math.max(1, p.required)), 0) /
            pipelines.length) *
            100,
        )
      : 0,
  };
}
