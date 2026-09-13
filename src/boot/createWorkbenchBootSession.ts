import {
  createBootContext,
  createBootEventBus,
  createBootExecutor,
  createBootProjection,
  type BootContext,
  type BootEvent,
  type BootEventBus,
  type BootExecutionState,
  type BootExecutor,
  type BootGraph,
  type BootMode,
  type BootProjection,
} from '@konitif/workbench';
import {
  createDemoWorkbenchBootGraph,
  type DemoWorkbenchBootGraphOptions,
} from './createDemoWorkbenchBootGraph';

export interface CreateWorkbenchBootSessionOptions {
  mode?: BootMode;
  graph?: BootGraph;
  demoGraph?: DemoWorkbenchBootGraphOptions;
  context?: BootContext;
  eventBus?: BootEventBus;
  createExecutionId?: () => string;
  now?: () => number;
  eventHistoryLimit?: number;
}

export interface WorkbenchBootSession {
  graph: BootGraph;
  context: BootContext;
  executor: BootExecutor;
  getProjection(): BootProjection;
  getEventHistory(): BootEvent[];
  subscribe(listener: (projection: BootProjection) => void): () => void;
  start(): Promise<BootExecutionState>;
  teardown(): Promise<BootExecutionState>;
}

export function createWorkbenchBootSession(
  options: CreateWorkbenchBootSessionOptions = {},
): WorkbenchBootSession {
  const graph = options.graph ?? createDemoWorkbenchBootGraph(options.demoGraph);
  const context = options.context ?? createBootContext({ mode: options.mode ?? 'normal' });
  const eventBus = options.eventBus ?? createBootEventBus();
  const executor = createBootExecutor({
    eventBus,
    now: options.now,
    createExecutionId: options.createExecutionId,
  });
  const eventHistoryLimit = Math.max(1, options.eventHistoryLimit ?? 20);
  const subscribers = new Set<(projection: BootProjection) => void>();
  let lastEvent: BootEvent | undefined;
  let eventHistory: BootEvent[] = [];
  let projection = createBootProjection(
    createIdleBootExecutionState(graph),
    context.mode,
    undefined,
    eventHistory,
  );

  eventBus.subscribe((event) => {
    lastEvent = event;
    eventHistory = [...eventHistory, event].slice(-eventHistoryLimit);
    const state = 'state' in event ? event.state : executor.getState();
    projection = createBootProjection(state, context.mode, lastEvent, eventHistory);
    notifySubscribers(subscribers, projection);
  });

  return {
    graph,
    context,
    executor,
    getProjection() {
      return projection;
    },
    getEventHistory() {
      return [...eventHistory];
    },
    subscribe(listener) {
      subscribers.add(listener);
      listener(projection);

      return () => {
        subscribers.delete(listener);
      };
    },
    async start() {
      const state = await executor.run(graph, context);
      projection = createBootProjection(state, context.mode, lastEvent, eventHistory);
      notifySubscribers(subscribers, projection);
      return state;
    },
    async teardown() {
      const state = await executor.teardown(context);
      projection = createBootProjection(state, context.mode, lastEvent, eventHistory);
      notifySubscribers(subscribers, projection);
      return state;
    },
  };
}

function createIdleBootExecutionState(graph: BootGraph): BootExecutionState {
  const state: BootExecutionState = {
    executionId: 'boot-idle',
    phase: 'plan',
    steps: {},
    nodes: {},
    failed: false,
    errors: [],
  };

  for (const step of graph.steps) {
    if (state.steps[step.id]) {
      continue;
    }

    const stepState = {
      id: step.id,
      label: step.label,
      phase: step.phase,
      status: 'pending' as const,
      criticality: step.criticality ?? 'critical',
      dependencies: step.dependsOn?.map((dependency) => ({ ...dependency })) ?? [],
    };

    state.steps[step.id] = stepState;
    state.nodes[step.id] = {
      state: stepState,
      attempts: 0,
      warnings: [],
      metadata: {},
    };
  }

  return state;
}

function notifySubscribers(
  subscribers: ReadonlySet<(projection: BootProjection) => void>,
  projection: BootProjection,
): void {
  for (const subscriber of subscribers) {
    subscriber(projection);
  }
}
