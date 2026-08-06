import { Inject, Injectable } from '@nestjs/common';
import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  PatchStrategy,
  setHeaderOptions,
  V1Deployment,
  V1DeploymentList,
  V1PersistentVolumeClaim,
  V1PersistentVolumeClaimList,
  V1PodList,
  V1StatefulSet,
  V1StatefulSetList,
} from '@kubernetes/client-node';
import { K8S_CONNECTION } from '@velero-ui-api/shared/utils/k8s.utils';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '@velero-ui-api/shared/modules/logger/logger.service';
import { K8sCustomObjectService } from '@velero-ui-api/modules/k8s-custom-object/k8s-custom-object.service';
import { createK8sCustomObject } from '@velero-ui-api/modules/k8s-custom-object/k8s-custom-object.utils';
import { Resources, V1Backup, V1Restore } from '@velero-ui/velero';
import { firstValueFrom } from 'rxjs';
import {
  RollbackCompleteEvent,
  RollbackPreviewResponse,
  RollbackProgressEvent,
  RollbackStep,
  RollbackStepStatus,
} from '@velero-ui/shared-types';

@Injectable()
export class RollbackService {
  private appsV1Api: AppsV1Api;
  private coreV1Api: CoreV1Api;

  constructor(
    @Inject(K8S_CONNECTION) private readonly k8s: KubeConfig,
    private readonly k8sCustomObjectService: K8sCustomObjectService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger
  ) {
    this.appsV1Api = this.k8s.makeApiClient(AppsV1Api);
    this.coreV1Api = this.k8s.makeApiClient(CoreV1Api);
  }

  private buildLabelSelector(backup: V1Backup): string | undefined {
    const selector = backup.spec?.labelSelector as any;
    if (!selector?.matchLabels) return undefined;
    return Object.entries(selector.matchLabels)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
  }

  private matchesLabelSelector(
    resourceLabels: Record<string, string> | undefined,
    backup: V1Backup
  ): boolean {
    const selector = backup.spec?.labelSelector as any;
    if (!selector?.matchLabels) return true;
    if (!resourceLabels) return false;
    return Object.entries(selector.matchLabels).every(
      ([k, v]) => resourceLabels[k] === v
    );
  }

  public async preview(backupName: string): Promise<RollbackPreviewResponse> {
    const backup = await firstValueFrom(
      this.k8sCustomObjectService.getByName<V1Backup>(
        Resources.BACKUP.plural,
        backupName
      )
    );

    const namespace =
      backup.spec?.includedNamespaces?.[0] || backup.metadata?.namespace;
    const labelSelector = this.buildLabelSelector(backup);
    const warnings: string[] = [];

    let deployments: { name: string; replicas: number }[] = [];
    let statefulSets: { name: string; replicas: number }[] = [];
    let pvcs: { name: string; storageClass: string; capacity: string }[] = [];

    try {
      const deploymentList: V1DeploymentList =
        await this.appsV1Api.listNamespacedDeployment({ namespace });
      deployments = deploymentList.items.map((d: V1Deployment) => ({
        name: d.metadata.name,
        replicas: d.spec.replicas || 0,
      }));
    } catch (e) {
      warnings.push(`Unable to list deployments in namespace ${namespace}`);
    }

    try {
      const statefulSetList: V1StatefulSetList =
        await this.appsV1Api.listNamespacedStatefulSet({ namespace });
      statefulSets = statefulSetList.items.map((s: V1StatefulSet) => ({
        name: s.metadata.name,
        replicas: s.spec.replicas || 0,
      }));
    } catch (e) {
      warnings.push(`Unable to list statefulsets in namespace ${namespace}`);
    }

    try {
      const pvcList: V1PersistentVolumeClaimList =
        await this.coreV1Api.listNamespacedPersistentVolumeClaim({
          namespace,
          labelSelector,
        });
      pvcs = pvcList.items.map((p: V1PersistentVolumeClaim) => ({
        name: p.metadata.name,
        storageClass: p.spec.storageClassName || 'default',
        capacity:
          p.status?.capacity?.storage || p.spec.resources?.requests?.storage || 'unknown',
      }));
    } catch (e) {
      warnings.push(`Unable to list PVCs in namespace ${namespace}`);
    }

    if (labelSelector) {
      warnings.push(
        `Only PVCs matching label selector "${labelSelector}" will be affected`
      );
    }

    return { backupName, namespace, deployments, statefulSets, pvcs, warnings };
  }

  public async execute(
    backupName: string,
    namespace: string,
    onProgress: (event: RollbackProgressEvent) => void
  ): Promise<RollbackCompleteEvent> {
    const originalReplicas: Record<string, number> = {};
    let scaledDown = false;

    try {
      const backup = await firstValueFrom(
        this.k8sCustomObjectService.getByName<V1Backup>(
          Resources.BACKUP.plural,
          backupName
        )
      );

      const labelSelector = this.buildLabelSelector(backup);

      // Step 1: Scale down deployments
      onProgress({
        step: RollbackStep.SCALE_DOWN,
        status: RollbackStepStatus.IN_PROGRESS,
        message: 'Scaling down deployments and statefulsets',
      });

      const deploymentList = await this.appsV1Api.listNamespacedDeployment({
        namespace,
      });
      for (const deployment of deploymentList.items) {
        const name = deployment.metadata.name;
        originalReplicas[`deployment/${name}`] = deployment.spec.replicas || 0;
        await this.appsV1Api.patchNamespacedDeploymentScale(
          { name, namespace, body: { spec: { replicas: 0 } } },
          setHeaderOptions('Content-Type', PatchStrategy.MergePatch)
        );
        onProgress({
          step: RollbackStep.SCALE_DOWN,
          status: RollbackStepStatus.IN_PROGRESS,
          message: 'Scaling down deployments and statefulsets',
          detail: `Scaled down deployment/${name} to 0`,
        });
      }

      const statefulSetList = await this.appsV1Api.listNamespacedStatefulSet({
        namespace,
      });
      for (const sts of statefulSetList.items) {
        const name = sts.metadata.name;
        originalReplicas[`statefulset/${name}`] = sts.spec.replicas || 0;
        await this.appsV1Api.patchNamespacedStatefulSetScale(
          { name, namespace, body: { spec: { replicas: 0 } } },
          setHeaderOptions('Content-Type', PatchStrategy.MergePatch)
        );
        onProgress({
          step: RollbackStep.SCALE_DOWN,
          status: RollbackStepStatus.IN_PROGRESS,
          message: 'Scaling down deployments and statefulsets',
          detail: `Scaled down statefulset/${name} to 0`,
        });
      }

      scaledDown = true;

      onProgress({
        step: RollbackStep.SCALE_DOWN,
        status: RollbackStepStatus.COMPLETED,
        message: 'All workloads scaled down',
      });

      // Step 2: Wait for pods to terminate
      onProgress({
        step: RollbackStep.WAIT_PODS_TERMINATED,
        status: RollbackStepStatus.IN_PROGRESS,
        message: 'Waiting for pods to terminate',
      });

      await this.waitForPodsTerminated(namespace, onProgress);

      onProgress({
        step: RollbackStep.WAIT_PODS_TERMINATED,
        status: RollbackStepStatus.COMPLETED,
        message: 'All pods terminated',
      });

      // Step 3: Delete PVCs (only those matching backup label selector)
      onProgress({
        step: RollbackStep.DELETE_PVCS,
        status: RollbackStepStatus.IN_PROGRESS,
        message: 'Deleting existing PVCs',
      });

      const pvcList =
        await this.coreV1Api.listNamespacedPersistentVolumeClaim({
          namespace,
          labelSelector,
        });
      for (const pvc of pvcList.items) {
        const name = pvc.metadata.name;
        await this.coreV1Api.deleteNamespacedPersistentVolumeClaim({
          name,
          namespace,
        });
        onProgress({
          step: RollbackStep.DELETE_PVCS,
          status: RollbackStepStatus.IN_PROGRESS,
          message: 'Deleting existing PVCs',
          detail: `Deleted PVC ${name}`,
        });
      }

      onProgress({
        step: RollbackStep.DELETE_PVCS,
        status: RollbackStepStatus.COMPLETED,
        message: `${pvcList.items.length} PVC(s) deleted`,
      });

      // Step 4: Create Velero Restore
      onProgress({
        step: RollbackStep.CREATE_RESTORE,
        status: RollbackStepStatus.IN_PROGRESS,
        message: 'Creating Velero Restore',
      });

      const timestamp = Date.now().toString(36);
      const restoreObjectName = `rollback-${backupName}-${timestamp}`;

      const restoreBody = createK8sCustomObject(
        restoreObjectName,
        this.configService.get('velero.namespace'),
        Resources.RESTORE,
        { 'velero-ui/rollback': 'true' },
        {
          backupName,
          includedNamespaces: [namespace],
          restorePVs: true,
        }
      );

      const restore = (await firstValueFrom(
        this.k8sCustomObjectService.create(Resources.RESTORE.plural, restoreBody)
      )) as V1Restore;

      const restoreName = restore.metadata?.name;

      onProgress({
        step: RollbackStep.CREATE_RESTORE,
        status: RollbackStepStatus.COMPLETED,
        message: `Restore ${restoreName} created`,
      });

      // Step 5: Wait for restore completion
      onProgress({
        step: RollbackStep.WAIT_RESTORE,
        status: RollbackStepStatus.IN_PROGRESS,
        message: 'Waiting for restore to complete',
      });

      await this.waitForRestoreCompletion(restoreName, onProgress);

      onProgress({
        step: RollbackStep.WAIT_RESTORE,
        status: RollbackStepStatus.COMPLETED,
        message: 'Restore completed successfully',
      });

      // Step 6: Scale up
      onProgress({
        step: RollbackStep.SCALE_UP,
        status: RollbackStepStatus.IN_PROGRESS,
        message: 'Scaling up workloads',
      });

      await this.scaleUpWorkloads(namespace, originalReplicas, onProgress);

      onProgress({
        step: RollbackStep.SCALE_UP,
        status: RollbackStepStatus.COMPLETED,
        message: 'All workloads scaled up',
      });

      return { success: true, restoreName, originalReplicas };
    } catch (error) {
      this.logger.error(
        `Rollback failed: ${error.message}`,
        RollbackService.name
      );

      // Auto-recovery: attempt to scale workloads back up
      if (scaledDown && Object.keys(originalReplicas).length > 0) {
        onProgress({
          step: RollbackStep.SCALE_UP,
          status: RollbackStepStatus.IN_PROGRESS,
          message: 'Rollback failed — attempting to restore original replicas',
        });

        try {
          await this.scaleUpWorkloads(namespace, originalReplicas, onProgress);
          onProgress({
            step: RollbackStep.SCALE_UP,
            status: RollbackStepStatus.COMPLETED,
            message: 'Recovery: workloads scaled back up',
          });
        } catch (recoveryError) {
          this.logger.error(
            `Recovery scale-up also failed: ${recoveryError.message}`,
            RollbackService.name
          );
          onProgress({
            step: RollbackStep.SCALE_UP,
            status: RollbackStepStatus.FAILED,
            message: 'Recovery failed — manual intervention required',
            error: recoveryError.message,
          });
        }
      }

      return {
        success: false,
        error: error.message,
        originalReplicas,
      };
    }
  }

  private async scaleUpWorkloads(
    namespace: string,
    originalReplicas: Record<string, number>,
    onProgress: (event: RollbackProgressEvent) => void
  ): Promise<void> {
    for (const [key, replicas] of Object.entries(originalReplicas)) {
      const [kind, name] = key.split('/');
      if (kind === 'deployment') {
        await this.appsV1Api.patchNamespacedDeploymentScale(
          { name, namespace, body: { spec: { replicas } } },
          setHeaderOptions('Content-Type', PatchStrategy.MergePatch)
        );
      } else if (kind === 'statefulset') {
        await this.appsV1Api.patchNamespacedStatefulSetScale(
          { name, namespace, body: { spec: { replicas } } },
          setHeaderOptions('Content-Type', PatchStrategy.MergePatch)
        );
      }
      onProgress({
        step: RollbackStep.SCALE_UP,
        status: RollbackStepStatus.IN_PROGRESS,
        message: 'Scaling up workloads',
        detail: `Scaled up ${key} to ${replicas}`,
      });
    }
  }

  private async waitForPodsTerminated(
    namespace: string,
    onProgress: (event: RollbackProgressEvent) => void
  ): Promise<void> {
    const maxRetries = 30;
    const delayMs = 4000;

    for (let i = 0; i < maxRetries; i++) {
      const podList: V1PodList = await this.coreV1Api.listNamespacedPod({
        namespace,
      });
      const runningPods = podList.items.filter(
        (p) => p.status?.phase === 'Running' || p.status?.phase === 'Pending'
      );

      if (runningPods.length === 0) {
        return;
      }

      onProgress({
        step: RollbackStep.WAIT_PODS_TERMINATED,
        status: RollbackStepStatus.IN_PROGRESS,
        message: 'Waiting for pods to terminate',
        detail: `${runningPods.length} pod(s) still running (attempt ${i + 1}/${maxRetries})`,
      });

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(
      `Timeout waiting for pods to terminate in namespace ${namespace}`
    );
  }

  private async waitForRestoreCompletion(
    restoreName: string,
    onProgress: (event: RollbackProgressEvent) => void
  ): Promise<void> {
    const maxRetries = 60;
    const delayMs = 5000;

    for (let i = 0; i < maxRetries; i++) {
      const restore = await firstValueFrom(
        this.k8sCustomObjectService.getByName<V1Restore>(
          Resources.RESTORE.plural,
          restoreName
        )
      );

      const phase = (restore as any).status?.phase;

      if (phase === 'Completed') {
        return;
      }

      if (phase === 'Failed' || phase === 'PartiallyFailed') {
        throw new Error(`Restore ${restoreName} finished with phase: ${phase}`);
      }

      onProgress({
        step: RollbackStep.WAIT_RESTORE,
        status: RollbackStepStatus.IN_PROGRESS,
        message: 'Waiting for restore to complete',
        detail: `Restore phase: ${phase || 'InProgress'} (attempt ${i + 1}/${maxRetries})`,
      });

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(
      `Timeout waiting for restore ${restoreName} to complete`
    );
  }
}
