import type {
  BootGraph,
  BootPhase,
  BootStep,
  BootStepCriticality,
  BootStepResult,
} from '@konitif/workbench';

export interface DemoWorkbenchBootGraphOptions {
  stepDelayMs?: number;
  delayMs?: number;
  failStepId?: string;
  failCritical?: boolean;
}

export type CreateDemoWorkbenchBootGraphOptions = DemoWorkbenchBootGraphOptions;

interface DemoBootStepDefinition {
  id: string;
  label: string;
  phase: BootPhase;
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
}

const DEMO_BOOT_STEPS: readonly DemoBootStepDefinition[] = [
  {
    id: 'plan.validate-runtime-plan',
    label: 'Validate runtime plan',
    phase: 'plan',
  },
  {
    id: 'plan.validate-boot-graph',
    label: 'Validate boot graph',
    phase: 'plan',
    dependsOn: ['plan.validate-runtime-plan'],
  },
  {
    id: 'initialize.persistence',
    label: 'Initialize persistence',
    phase: 'initialize',
    dependsOn: ['plan.validate-boot-graph'],
  },
  {
    id: 'initialize.workspace',
    label: 'Initialize workspace',
    phase: 'initialize',
    dependsOn: ['initialize.persistence'],
  },
  {
    id: 'initialize.shell',
    label: 'Initialize shell',
    phase: 'initialize',
    dependsOn: ['initialize.workspace'],
  },
  {
    id: 'initialize.layout-interactions',
    label: 'Initialize layout interactions',
    phase: 'initialize',
    dependsOn: ['initialize.shell'],
  },
  {
    id: 'initialize.observability',
    label: 'Initialize observability',
    phase: 'initialize',
    dependsOn: ['initialize.layout-interactions'],
  },
  {
    id: 'hydrate.workspace',
    label: 'Hydrate workspace',
    phase: 'hydrate',
    dependsOn: ['initialize.workspace', 'initialize.observability'],
  },
  {
    id: 'hydrate.shell',
    label: 'Hydrate shell',
    phase: 'hydrate',
    dependsOn: ['hydrate.workspace', 'initialize.shell'],
  },
  {
    id: 'hydrate.layout',
    label: 'Hydrate layout',
    phase: 'hydrate',
    dependsOn: ['hydrate.shell', 'initialize.layout-interactions'],
  },
  {
    id: 'hydrate.sessions',
    label: 'Hydrate sessions',
    phase: 'hydrate',
    dependsOn: ['hydrate.layout'],
  },
  {
    id: 'hydrate.projections',
    label: 'Hydrate projections',
    phase: 'hydrate',
    dependsOn: ['hydrate.sessions', 'initialize.observability'],
  },
  {
    id: 'run.history',
    label: 'Attach history',
    phase: 'run',
    dependsOn: ['hydrate.shell'],
  },
  {
    id: 'run.sync',
    label: 'Attach sync',
    phase: 'run',
    dependsOn: ['hydrate.projections'],
  },
  {
    id: 'run.persistence-subscriptions',
    label: 'Attach persistence subscriptions',
    phase: 'run',
    dependsOn: ['run.history', 'initialize.persistence'],
  },
  {
    id: 'run.runtime-inspector',
    label: 'Register runtime inspector',
    phase: 'run',
    dependsOn: ['run.sync', 'initialize.observability'],
  },
  {
    id: 'run.expose-store',
    label: 'Expose workbench store',
    phase: 'run',
    dependsOn: ['run.persistence-subscriptions', 'run.runtime-inspector'],
  },
];

export function createDemoWorkbenchBootGraph(
  options: DemoWorkbenchBootGraphOptions = {},
): BootGraph {
  const delayMs = options.stepDelayMs ?? options.delayMs ?? 120;
  const optionalFailureDependents =
    options.failStepId && options.failCritical === false
      ? collectTransitiveDependents(options.failStepId)
      : new Set<string>();

  return {
    steps: DEMO_BOOT_STEPS.map((definition): BootStep =>
      createDemoBootStep(definition, {
        delayMs,
        failStepId: options.failStepId,
        failCritical: options.failCritical ?? true,
        optionalFailureDependents,
      }),
    ),
  };
}

function createDemoBootStep(
  definition: DemoBootStepDefinition,
  options: {
    delayMs: number;
    failStepId?: string;
    failCritical: boolean;
    optionalFailureDependents: ReadonlySet<string>;
  },
): BootStep {
  const shouldFail = definition.id === options.failStepId;
  const criticality: BootStepCriticality =
    shouldFail && !options.failCritical
      ? 'optional'
      : options.optionalFailureDependents.has(definition.id)
        ? 'optional'
        : 'critical';

  return {
    id: definition.id,
    label: definition.label,
    phase: definition.phase,
    criticality,
    dependsOn: definition.dependsOn?.map((stepId) => ({ stepId })),
    async run(): Promise<BootStepResult> {
      await delay(options.delayMs);

      if (shouldFail) {
        throw new Error(`Simulated boot failure at ${definition.id}.`);
      }

      return {
        metadata: {
          simulated: true,
          phase: definition.phase,
          ...(definition.metadata ?? {}),
        },
      };
    },
    async rollback(): Promise<BootStepResult> {
      await delay(Math.max(0, Math.min(options.delayMs, 40)));

      return {
        metadata: {
          rollback: true,
          simulated: true,
          phase: definition.phase,
        },
      };
    },
  };
}

function collectTransitiveDependents(rootStepId: string): Set<string> {
  const dependents = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;

    for (const definition of DEMO_BOOT_STEPS) {
      if (definition.id === rootStepId || dependents.has(definition.id)) {
        continue;
      }

      const dependencies = definition.dependsOn ?? [];
      const dependsOnFailedRoot = dependencies.includes(rootStepId);
      const dependsOnFailedDependent = dependencies.some((stepId) => dependents.has(stepId));

      if (dependsOnFailedRoot || dependsOnFailedDependent) {
        dependents.add(definition.id);
        changed = true;
      }
    }
  }

  return dependents;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
