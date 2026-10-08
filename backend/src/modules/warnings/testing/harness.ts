import { CHANNELS, type Channel } from '@shared/contracts/enums';
import type { AuditLog } from '@shared/audit/AuditLog';
import type { EventBus } from '@shared/events/EventBus';
import { SequentialIdGenerator, type IdGenerator } from '@shared/ids/IdGenerator';
import { FakeAuditLog } from '@shared/testing/FakeAuditLog';
import { FakeEventBus } from '@shared/testing/FakeEventBus';
import { FixedClock, type Clock } from '@shared/time/Clock';
import { AlertDeliveryManager } from '../application/AlertDeliveryManager';
import { ChannelSelector } from '../application/ChannelSelector';
import { EscalationRequestHandler } from '../application/EscalationRequestHandler';
import {
  DEFAULT_RETRY_POLICY,
  RetryPolicy,
  type RetryPolicyOptions,
} from '../application/RetryPolicy';
import type { NotificationService } from '../application/ports';
import { WarningController } from '../application/WarningController';
import type { Recipient } from '../domain/Recipient';
import type { Warning } from '../domain/Warning';
import { aWarning, NOW } from './builders';
import {
  InMemoryAlertNotificationRepository,
  InMemoryCitizenDirectory,
  InMemoryWarningRepository,
  ScriptedGateway,
} from './inMemory';

export interface HarnessOptions {
  recipients?: Recipient[];
  concurrency?: number;
  retry?: Partial<RetryPolicyOptions>;
  /** Awaited inside every send, so a test can hold sends open. */
  gate?: () => Promise<void>;
}

/** The shared ports the foundation hands every module (a test brings its own, or takes fakes). */
export interface SharedPorts {
  clock: Clock;
  ids: IdGenerator;
  events: EventBus;
  audit: AuditLog;
}

/**
 * The UC-1 wiring `composition.ts` does, over in-memory ports and scripted gateways, on top of shared
 * ports a test chooses. API tests use this with the ports of `createModuleHarness`, so the router, the
 * controller and the assertions all see the same clock, events and audit trail.
 */
export function wireWarnings(shared: SharedPorts, options: HarnessOptions = {}) {
  const warnings = new InMemoryWarningRepository();
  const notifications = new InMemoryAlertNotificationRepository();
  const directory = new InMemoryCitizenDirectory(options.recipients);
  const gateways = Object.fromEntries(
    CHANNELS.map((channel) => [channel, new ScriptedGateway(channel, options.gate)]),
  ) as Record<Channel, ScriptedGateway>;
  const retryPolicy = new RetryPolicy({ ...DEFAULT_RETRY_POLICY, ...options.retry });
  const selector = new ChannelSelector();
  const delivery = new AlertDeliveryManager({
    services: gateways as Record<Channel, NotificationService>,
    retryPolicy,
    clock: shared.clock,
    concurrency: options.concurrency,
  });
  const controller = new WarningController({
    warnings,
    notifications,
    directory,
    delivery,
    selector,
    events: shared.events,
    audit: shared.audit,
    clock: shared.clock,
    ids: shared.ids,
    maxRetries: retryPolicy.maxRetries,
  });
  const handler = new EscalationRequestHandler({
    warnings,
    events: shared.events,
    audit: shared.audit,
    clock: shared.clock,
    ids: shared.ids,
  });

  /** Puts a warning in the store, the way the seed or the escalation handler would. */
  async function add(warning: Warning = aWarning()): Promise<Warning> {
    await warnings.insert(warning);
    return warning;
  }

  return {
    warnings,
    notifications,
    directory,
    gateways,
    retryPolicy,
    selector,
    delivery,
    controller,
    handler,
    add,
  };
}

/**
 * The whole UC-1 application over in-memory ports, a fixed clock and scripted gateways: without
 * MongoDB or Express. Tests start every scenario from here.
 */
export function createWarningsHarness(options: HarnessOptions = {}) {
  const clock = new FixedClock(NOW);
  const ids = new SequentialIdGenerator('id');
  const events = new FakeEventBus();
  const audit = new FakeAuditLog();
  return { clock, ids, events, audit, ...wireWarnings({ clock, ids, events, audit }, options) };
}

export type WarningsHarness = ReturnType<typeof createWarningsHarness>;
