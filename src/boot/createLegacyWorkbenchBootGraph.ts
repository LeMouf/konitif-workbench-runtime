import {
  RuntimePlanEngine,
  createLaunchPreflightSummary,
  createProjectLaunchTarget,
  createSelfLaunchTarget,
  getBootOption,
  getRuntimeValue,
  setCapability,
  setRuntimeValue,
  type BootContext,
  type BootGraph,
  type BootMode,
  type BootPhase,
  type BootStep,
  type BootStepResult,
  type LaunchProfile,
  type LaunchProjectKind,
  type LaunchProjectOption,
  type LaunchTarget,
  type RuntimePlan,
  type RuntimePlanStep,
} from '@konitif/workbench';

export const LEGACY_WORKBENCH_BOOT_SNAPSHOT_OPTION = 'legacyWorkbench.snapshot';

export interface LegacyWorkbenchBootSnapshot {
  targetKind: string;
  targetLabel: string;
  profile: string;
  projectRoot?: string | null;
  projectKind?: string | null;
  shellRoute?: string | null;
  workspaceMode?: string | null;
  source?: string | null;
}

export interface LegacyWorkbenchBootGraphOptions {
  stepDelayMs?: number;
  delayMs?: number;
  snapshot?: LegacyWorkbenchBootSnapshot;
  runtimeStepHandlers?: LegacyRuntimePlanStepHandlers;
}

export interface LegacyRuntimePlanStepHandlerInput {
  snapshot: LegacyWorkbenchBootSnapshot;
  plan: RuntimePlan;
  step: RuntimePlanStep;
}

export type LegacyRuntimePlanStepHandler = (
  ctx: BootContext,
  input: LegacyRuntimePlanStepHandlerInput,
) => BootStepResult | void | Promise<BootStepResult | void>;

export interface LegacyRuntimePlanStepLifecycleHandler {
  run?: LegacyRuntimePlanStepHandler;
  rollback?: LegacyRuntimePlanStepHandler;
  teardown?: LegacyRuntimePlanStepHandler;
}

export type LegacyRuntimePlanStepHandlerDefinition =
  | LegacyRuntimePlanStepHandler
  | LegacyRuntimePlanStepLifecycleHandler;

export type LegacyRuntimePlanStepHandlers = Partial<Record<string, LegacyRuntimePlanStepHandlerDefinition>>;

interface LegacyBootStepDefinition {
  id: string;
  label: string;
  phase: BootPhase;
  dependsOn?: string[];
  run(ctx: BootContext): BootStepResult | void | Promise<BootStepResult | void>;
  rollback?(ctx: BootContext): BootStepResult | void | Promise<BootStepResult | void>;
  teardown?(ctx: BootContext): BootStepResult | void | Promise<BootStepResult | void>;
}

const LEGACY_BOOT_PLAN_STEPS: readonly LegacyBootStepDefinition[] = [
  {
    id: 'plan.resolve-launch-target',
    label: 'Resolve launch target',
    phase: 'plan',
    run(ctx) {
      const snapshot = readLegacyWorkbenchBootSnapshot(ctx);
      setRuntimeValue(ctx, 'launch.target', snapshot);

      return {
        metadata: {
          observed: true,
          targetKind: snapshot.targetKind,
          targetLabel: snapshot.targetLabel,
          profile: snapshot.profile,
          projectRoot: snapshot.projectRoot ?? null,
          source: snapshot.source ?? 'legacy-workbench',
        },
      };
    },
  },
  {
    id: 'plan.create-runtime-plan',
    label: 'Create runtime plan',
    phase: 'plan',
    dependsOn: ['plan.resolve-launch-target'],
    run(ctx) {
      const snapshot = readLegacyWorkbenchBootSnapshot(ctx);
      const plan = createLegacyRuntimePlan(snapshot);

      setRuntimeValue(ctx, 'runtime.plan', plan);

      return {
        metadata: {
          runtimePlanId: plan.id,
          profile: plan.profile,
          canExecute: plan.canExecute,
          stepCount: plan.steps.length,
          warningCount: plan.warnings.length,
          targetKind: plan.target.kind,
        },
        warnings: plan.canExecute ? [] : ['Runtime plan is blocked by preflight.'],
      };
    },
  },
];

const LEGACY_BOOT_HYDRATE_SHELL_STEP: LegacyBootStepDefinition = {
  id: 'hydrate.capture-workspace-shell',
  label: 'Capture workspace shell context',
  phase: 'hydrate',
  run(ctx) {
    const snapshot = readLegacyWorkbenchBootSnapshot(ctx);
    setRuntimeValue(ctx, 'workspace.shell', {
      shellRoute: snapshot.shellRoute ?? 'workspace',
      workspaceMode: snapshot.workspaceMode ?? 'studio',
    });

    return {
      metadata: {
        shellRoute: snapshot.shellRoute ?? 'workspace',
        workspaceMode: snapshot.workspaceMode ?? 'studio',
        persistence: 'external',
      },
    };
  },
};

const LEGACY_BOOT_RUN_STEPS: readonly LegacyBootStepDefinition[] = [
  {
    id: 'run.expose-legacy-runtime',
    label: 'Expose legacy runtime projection',
    phase: 'run',
    run(ctx) {
      const plan = getRuntimeValue<RuntimePlan>(ctx, 'runtime.plan');
      setRuntimeValue(ctx, 'legacy.runtime.ready', true);
      setCapability(ctx, 'legacy.workbench-store.delegated', true);

      return {
        metadata: {
          observable: true,
          delegatedTo: 'createWorkbenchStore',
          nextMigrationTarget: 'store factory ownership',
          runtimePlanId: plan.id,
          runtimeStepCount: plan.steps.length,
        },
      };
    },
  },
];

export function createLegacyWorkbenchBootGraph(
  options: LegacyWorkbenchBootGraphOptions = {},
): BootGraph {
  const delayMs = options.stepDelayMs ?? options.delayMs ?? 70;
  const graphPlan = createLegacyRuntimePlan(
    sanitizeLegacyWorkbenchBootSnapshot(options.snapshot ?? createFallbackLegacyWorkbenchBootSnapshot()),
    'legacy-boot-graph',
  );
  const runtimePlanSteps = createRuntimePlanBootStepDefinitions(
    graphPlan.steps,
    sanitizeLegacyWorkbenchBootSnapshot(options.snapshot ?? createFallbackLegacyWorkbenchBootSnapshot()),
    options.runtimeStepHandlers ?? {},
  );
  const hydrateShellStep = {
    ...LEGACY_BOOT_HYDRATE_SHELL_STEP,
    dependsOn: [resolveLastStepId(runtimePlanSteps.initialize, 'plan.create-runtime-plan')],
  };
  const firstRunStep = runtimePlanSteps.run[0];

  if (firstRunStep && !firstRunStep.dependsOn?.length) {
    firstRunStep.dependsOn = [resolveLastStepId(runtimePlanSteps.hydrate, hydrateShellStep.id)];
  }

  const runSteps = LEGACY_BOOT_RUN_STEPS.map((step) => ({
    ...step,
    dependsOn: [resolveLastStepId([...runtimePlanSteps.hydrate, ...runtimePlanSteps.run], hydrateShellStep.id)],
  }));
  const definitions = [
    ...LEGACY_BOOT_PLAN_STEPS,
    ...runtimePlanSteps.initialize,
    hydrateShellStep,
    ...runtimePlanSteps.hydrate,
    ...runtimePlanSteps.run,
    ...runSteps,
  ];

  return {
    steps: definitions.map((definition) => createLegacyBootStep(definition, delayMs)),
  };
}

export function createLegacyWorkbenchBootContextOptions(
  snapshot: LegacyWorkbenchBootSnapshot,
): Iterable<readonly [string, unknown]> {
  return [[LEGACY_WORKBENCH_BOOT_SNAPSHOT_OPTION, sanitizeLegacyWorkbenchBootSnapshot(snapshot)]];
}

export function resolveLegacyWorkbenchBootMode(snapshot: LegacyWorkbenchBootSnapshot): BootMode {
  return snapshot.targetKind === 'self' ? 'readonly' : 'normal';
}

function createLegacyBootStep(definition: LegacyBootStepDefinition, delayMs: number): BootStep {
  return {
    id: definition.id,
    label: definition.label,
    phase: definition.phase,
    criticality: 'critical',
    dependsOn: definition.dependsOn?.map((stepId) => ({ stepId })),
    async run(ctx): Promise<BootStepResult | void> {
      await delay(delayMs);
      return definition.run(ctx);
    },
    async rollback(ctx): Promise<BootStepResult | void> {
      if (!definition.rollback) {
        return undefined;
      }

      await delay(Math.max(0, Math.min(delayMs, 40)));
      return definition.rollback(ctx);
    },
    async teardown(ctx): Promise<BootStepResult | void> {
      if (!definition.teardown) {
        return undefined;
      }

      await delay(Math.max(0, Math.min(delayMs, 40)));
      return definition.teardown(ctx);
    },
  };
}

function readLegacyWorkbenchBootSnapshot(ctx: BootContext): LegacyWorkbenchBootSnapshot {
  return sanitizeLegacyWorkbenchBootSnapshot(
    getBootOption<LegacyWorkbenchBootSnapshot>(ctx, LEGACY_WORKBENCH_BOOT_SNAPSHOT_OPTION),
  );
}

function sanitizeLegacyWorkbenchBootSnapshot(
  snapshot: LegacyWorkbenchBootSnapshot,
): LegacyWorkbenchBootSnapshot {
  return {
    targetKind: snapshot.targetKind || 'unknown',
    targetLabel: snapshot.targetLabel || 'Unknown target',
    profile: snapshot.profile || 'unknown',
    projectRoot: snapshot.projectRoot || null,
    projectKind: snapshot.projectKind || null,
    shellRoute: snapshot.shellRoute || null,
    workspaceMode: snapshot.workspaceMode || null,
    source: snapshot.source || null,
  };
}

function createFallbackLegacyWorkbenchBootSnapshot(): LegacyWorkbenchBootSnapshot {
  return {
    targetKind: 'unknown',
    targetLabel: 'Unknown target',
    profile: 'project-workbench',
    projectRoot: 'legacy-workbench',
    projectKind: 'repository',
    source: 'legacy-workbench',
  };
}

function createLegacyRuntimePlan(
  snapshot: LegacyWorkbenchBootSnapshot,
  now = new Date().toISOString(),
): RuntimePlan {
  const target = createLaunchTargetFromLegacySnapshot(snapshot);

  return new RuntimePlanEngine().createPlan({
    target,
    preflight: createLaunchPreflightSummary(target),
    now,
  });
}

function createLaunchTargetFromLegacySnapshot(snapshot: LegacyWorkbenchBootSnapshot): LaunchTarget {
  if (snapshot.targetKind === 'self') {
    return createSelfLaunchTarget();
  }

  const projectRoot = snapshot.projectRoot || snapshot.targetLabel || 'legacy-workbench';
  const project: LaunchProjectOption = {
    id: createLegacyProjectId(projectRoot),
    kind: resolveLegacyProjectKind(snapshot.projectKind),
    label: snapshot.targetLabel || createProjectLabel(projectRoot),
    root: projectRoot,
    description: snapshot.source ? `Legacy boot source: ${snapshot.source}` : null,
  };

  return createProjectLaunchTarget(project, resolveLegacyLaunchProfile(snapshot.profile));
}

function createRuntimePlanBootStepDefinitions(
  steps: readonly RuntimePlanStep[],
  snapshot: LegacyWorkbenchBootSnapshot,
  handlers: LegacyRuntimePlanStepHandlers,
): Record<'initialize' | 'hydrate' | 'run', LegacyBootStepDefinition[]> {
  const grouped: Record<'initialize' | 'hydrate' | 'run', LegacyBootStepDefinition[]> = {
    initialize: [],
    hydrate: [],
    run: [],
  };
  const dependenciesByPhase: Record<'initialize' | 'hydrate' | 'run', string> = {
    initialize: 'plan.create-runtime-plan',
    hydrate: 'hydrate.capture-workspace-shell',
    run: '',
  };

  for (const step of steps) {
    const phase = resolveRuntimePlanBootPhase(step.kind);
    const definition = createRuntimePlanBootStepDefinition(step, phase, dependenciesByPhase[phase], snapshot, handlers);

    grouped[phase].push(definition);
    dependenciesByPhase[phase] = definition.id;
  }

  return grouped;
}

function createRuntimePlanBootStepDefinition(
  step: RuntimePlanStep,
  phase: 'initialize' | 'hydrate' | 'run',
  dependencyId: string,
  snapshot: LegacyWorkbenchBootSnapshot,
  handlers: LegacyRuntimePlanStepHandlers,
): LegacyBootStepDefinition {
  return {
    id: `runtime-plan.${step.id}`,
    label: step.label,
    phase,
    dependsOn: dependencyId ? [dependencyId] : undefined,
    async run(ctx) {
      const plan = getRuntimeValue<RuntimePlan>(ctx, 'runtime.plan');
      const runtimeStep = plan.steps.find((entry) => entry.id === step.id) ?? step;
      const handler = resolveLegacyRuntimePlanStepHandler(handlers[runtimeStep.id], 'run');

      if (runtimeStep.status === 'blocked') {
        throw new Error(runtimeStep.reason ?? `Runtime plan step "${runtimeStep.id}" is blocked.`);
      }

      const handlerResult = await handler?.(ctx, { snapshot, plan, step: runtimeStep });
      setRuntimeValue(ctx, `runtime.plan.step.${runtimeStep.id}`, 'success');

      return {
        metadata: {
          runtimePlanId: plan.id,
          planStepId: runtimeStep.id,
          kind: runtimeStep.kind,
          critical: runtimeStep.critical,
          profile: plan.profile,
          status: runtimeStep.status,
          ...(handlerResult?.metadata ?? {}),
        },
        warnings: [
          ...(runtimeStep.status === 'skipped' && runtimeStep.reason ? [runtimeStep.reason] : []),
          ...(handlerResult?.warnings ?? []),
        ],
      };
    },
    async rollback(ctx) {
      const plan = getRuntimeValue<RuntimePlan>(ctx, 'runtime.plan');
      const runtimeStep = plan.steps.find((entry) => entry.id === step.id) ?? step;
      const handler = resolveLegacyRuntimePlanStepHandler(handlers[runtimeStep.id], 'rollback');
      const handlerResult = await handler?.(ctx, { snapshot, plan, step: runtimeStep });

      return {
        metadata: {
          rollback: true,
          runtimePlanId: plan.id,
          planStepId: runtimeStep.id,
          ...(handlerResult?.metadata ?? {}),
        },
        warnings: handlerResult?.warnings ?? [],
      };
    },
    async teardown(ctx) {
      const plan = getRuntimeValue<RuntimePlan>(ctx, 'runtime.plan');
      const runtimeStep = plan.steps.find((entry) => entry.id === step.id) ?? step;
      const handler = resolveLegacyRuntimePlanStepHandler(handlers[runtimeStep.id], 'teardown');
      const handlerResult = await handler?.(ctx, { snapshot, plan, step: runtimeStep });

      return {
        metadata: {
          teardown: true,
          runtimePlanId: plan.id,
          planStepId: runtimeStep.id,
          ...(handlerResult?.metadata ?? {}),
        },
        warnings: handlerResult?.warnings ?? [],
      };
    },
  };
}

function resolveLegacyRuntimePlanStepHandler(
  handler: LegacyRuntimePlanStepHandlerDefinition | undefined,
  lifecycle: keyof LegacyRuntimePlanStepLifecycleHandler,
): LegacyRuntimePlanStepHandler | undefined {
  if (typeof handler === 'function') {
    return lifecycle === 'run' ? handler : undefined;
  }

  return handler?.[lifecycle];
}

function resolveRuntimePlanBootPhase(kind: RuntimePlanStep['kind']): 'initialize' | 'hydrate' | 'run' {
  if (kind === 'activate-watcher' || kind === 'launch-worker') {
    return 'run';
  }

  if (kind === 'start-service' || kind === 'initialize-manager' || kind === 'register-tool') {
    return 'hydrate';
  }

  return 'initialize';
}

function resolveLastStepId(steps: readonly LegacyBootStepDefinition[], fallback: string): string {
  return steps[steps.length - 1]?.id ?? fallback;
}

function resolveLegacyLaunchProfile(profile: string | null | undefined): LaunchProfile {
  if (
    profile === 'core-only' ||
    profile === 'project-workbench' ||
    profile === 'repo-inspect-only' ||
    profile === 'app-safe-mode' ||
    profile === 'app-full-runtime' ||
    profile === 'sandbox-runtime' ||
    profile === 'recovery-mode'
  ) {
    return profile;
  }

  return 'project-workbench';
}

function resolveLegacyProjectKind(kind: string | null | undefined): LaunchProjectKind {
  return kind === 'app' ? 'app' : 'repository';
}

function createLegacyProjectId(root: string): string {
  const normalizedRoot = root.replace(/[^a-z0-9]+/gi, '.').replace(/^\.+|\.+$/g, '').toLowerCase();

  return `legacy.${normalizedRoot || 'workbench'}`;
}

function createProjectLabel(root: string): string {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '');

  return normalizedRoot.split('/').filter(Boolean).pop() ?? 'Legacy project';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
