# Rollback Flow — Velero UI

## Overview

The rollback feature allows restoring a complete namespace from a Velero backup through the UI.
The process replaces existing PVCs with their backed-up versions, effectively rolling back persistent data to a previous point in time.

**Architecture:** The entire execution is WebSocket-based (Socket.IO). The frontend emits events, the backend orchestrates the Kubernetes operations, and progress is streamed back in real-time.

---

## 1. Initiation (Frontend → Backend)

1. The user selects a backup and clicks "Rollback" in the UI.
2. The composable `useRollbackProgress.ts` registers listeners on the socket for `rollback:progress` and `rollback:complete`.
3. Emits WebSocket event `rollback:start` with `{ backupName, namespace }`.
4. The gateway `rollback.gateway.ts` receives the message, verifies JWT authentication via WebSocket and checks CASL authorization (requires `Create` and `Delete` permissions on `restores`).
5. Calls `rollbackService.execute(backupName, namespace, onProgress)` where `onProgress` is a callback that emits `rollback:progress` to the client socket.

### Relevant files

- `apps/velero-ui/src/composables/rollback/useRollbackProgress.ts`
- `apps/velero-ui-api/src/app/modules/rollback/rollback.gateway.ts`

---

## 2. Execution (`rollback.service.ts → execute()`)

### Initialization

Two control variables are initialized:

- `originalReplicas: Record<string, number>` — empty map to store original replica counts
- `scaledDown = false` — flag to track whether any workload was scaled down

The backup is fetched from Velero via `k8sCustomObjectService.getByName()` and the `labelSelector` is extracted from the backup's `spec.labelSelector.matchLabels` (if present).

---

### Step 1 — Scale Down Deployments and StatefulSets

- Lists all Deployments in the namespace (`appsV1Api.listNamespacedDeployment`).
- For each deployment:
  - Stores the original replica count in `originalReplicas["deployment/{name}"]`.
  - Scales to 0 via `patchNamespacedDeploymentScale` with `MergePatch` strategy.
  - Emits progress to the client.
- Lists all StatefulSets in the namespace (`appsV1Api.listNamespacedStatefulSet`).
- For each statefulset:
  - Stores the original replica count in `originalReplicas["statefulset/{name}"]`.
  - Scales to 0 via `patchNamespacedStatefulSetScale` with `MergePatch` strategy.
  - Emits progress to the client.
- Sets `scaledDown = true`.

---

### Step 2 — Wait for Pods to Terminate

- Polling: maximum **30 attempts**, every **4 seconds** (total timeout: ~2 minutes).
- Each iteration:
  - Lists pods in the namespace (`coreV1Api.listNamespacedPod`).
  - Filters pods in `Running` or `Pending` phase.
  - If 0 remain → returns (success).
  - If pods remain → emits progress with count and waits 4 seconds.
- If all 30 attempts are exhausted → throws `Error("Timeout waiting for pods to terminate in namespace {namespace}")`.

---

### Step 3 — Delete PVCs

- Lists PVCs in the namespace, filtered by the backup's `labelSelector` (if any).
- For each PVC:
  - Deletes via `coreV1Api.deleteNamespacedPersistentVolumeClaim`.
  - Emits progress with the deleted PVC name.
- Emits final progress with total count.

---

### Step 4 — Create Velero Restore

- Generates a restore name: `rollback-{backupName}-{timestamp_base36}`.
- Creates the `Restore` Custom Resource in the Velero namespace with:
  - `spec.backupName`: the selected backup
  - `spec.includedNamespaces`: `[namespace]`
  - `spec.restorePVs`: `true`
  - Label: `velero-ui/rollback: "true"`
- Creation is done via `k8sCustomObjectService.create()`.

---

### Step 5 — Wait for Restore Completion

- Polling: maximum **60 attempts**, every **5 seconds** (total timeout: ~5 minutes).
- Each iteration:
  - Reads the Restore status via `k8sCustomObjectService.getByName()`.
  - If `status.phase === "Completed"` → returns (success).
  - If `status.phase === "Failed"` or `"PartiallyFailed"` → throws `Error("Restore {name} finished with phase: {phase}")`.
  - Otherwise → emits progress and waits 5 seconds.
- If all 60 attempts are exhausted → throws `Error("Timeout waiting for restore {name} to complete")`.

---

### Step 6 — Scale Up Workloads

- Iterates over `originalReplicas`:
  - Parses the key (`"deployment/name"` or `"statefulset/name"`).
  - Scales to the original replica count via `patchNamespacedDeploymentScale` or `patchNamespacedStatefulSetScale`.
  - Emits progress for each scaled workload.

---

## 3. Successful Result

Emits `rollback:complete` to the client with:

```json
{
  "success": true,
  "restoreName": "rollback-{backupName}-{timestamp}",
  "originalReplicas": { "deployment/my-app": 1, "statefulset/my-db": 3 }
}
```

---

## 4. Error Handling (catch block)

If **any step** throws an exception:

1. Logs the error on the server.
2. If `scaledDown === true` and `originalReplicas` is not empty:
   - Attempts to run `scaleUpWorkloads()` to restore the original replica counts.
   - If recovery also fails → emits a `FAILED` event with "Recovery failed — manual intervention required".
3. Emits `rollback:complete` with:

```json
{
  "success": false,
  "error": "error message",
  "originalReplicas": { "deployment/my-app": 1 }
}
```

---

## 5. Communication Protocol

### Events

| Direction         | Event               | Payload                   |
|-------------------|---------------------|---------------------------|
| Client → Server   | `rollback:start`    | `{ backupName, namespace }` |
| Server → Client   | `rollback:progress` | `RollbackProgressEvent`   |
| Server → Client   | `rollback:complete` | `RollbackCompleteEvent`   |

### RollbackProgressEvent

```typescript
{
  step: RollbackStep;          // scale_down | wait_pods_terminated | delete_pvcs | create_restore | wait_restore | scale_up
  status: RollbackStepStatus;  // pending | in_progress | completed | failed
  message: string;             // human-readable description
  detail?: string;             // specific sub-step detail
  error?: string;              // only on failure
}
```

### RollbackCompleteEvent

```typescript
{
  success: boolean;
  restoreName?: string;
  error?: string;
  originalReplicas?: Record<string, number>;
}
```

---

## 6. Timeouts

| Wait step            | Max retries | Delay   | Total timeout |
|----------------------|-------------|---------|---------------|
| Pods terminated      | 30          | 4,000ms | ~2 minutes    |
| Restore completion   | 60          | 5,000ms | ~5 minutes    |

These values are hardcoded in `rollback.service.ts`.

---

## 7. Known Gaps and Improvement Areas

### Gap 1 — Partial scale-down without recovery

If some deployments are scaled to 0 but a subsequent one fails, `scaledDown` is still `false` (it is only set after ALL workloads are scaled down). Those already-scaled deployments remain at 0 replicas with no recovery attempt.

**Proposed fix:** Set `scaledDown = true` as soon as the first workload is scaled down.

### Gap 2 — PVC deletion is irreversible in the error path

If PVCs are deleted (step 3) but the restore fails or times out (steps 4-5), the recovery only scales workloads back up. The PVCs remain deleted — data loss.

**Proposed fix:** Create safety VolumeSnapshots before deleting PVCs. On failure, recreate PVCs from the snapshots. On success, delete the safety snapshots.

### Gap 3 — Orphaned Restore CR

A failed or timed-out Restore custom resource is left in the cluster without cleanup.

### Gap 4 — Hardcoded timeouts

2 minutes for pod termination and 5 minutes for restore completion may be insufficient for large workloads. No configuration mechanism exists.

### Gap 5 — No individual K8s API call timeout

If a K8s API call hangs, the entire operation blocks indefinitely with no feedback.

### Gap 6 — No cancel/abort mechanism

Once the user starts the rollback, there is no way to cancel it from the frontend.

### Gap 7 — No WebSocket disconnection handling

If the WebSocket connection drops mid-rollback, the backend continues executing but the user receives no further events. No reconnection logic exists.

### Gap 8 — No tests

Zero unit or integration tests exist for the rollback feature.

### Gap 9 — Gateway does not catch errors from execute()

The `onRollbackStart` method does not wrap the `execute()` call in a try/catch. An error before the inner try/catch would cause an unhandled promise rejection.

### Gap 10 — Raw JSON in error display

`RollbackProgress.vue` shows `JSON.stringify(result.originalReplicas)` to the user, which is unhelpful for manual recovery.

---

## 8. Relevant Source Files

| File | Description |
|------|-------------|
| `apps/velero-ui-api/src/app/modules/rollback/rollback.service.ts` | Core orchestration logic |
| `apps/velero-ui-api/src/app/modules/rollback/rollback.gateway.ts` | WebSocket entry point |
| `apps/velero-ui-api/src/app/modules/rollback/rollback.controller.ts` | REST preview endpoint |
| `apps/velero-ui-api/src/app/modules/rollback/rollback.module.ts` | Module definition |
| `apps/velero-ui-api/src/app/shared/dto/rollback.dto.ts` | DTO validation |
| `libs/shared-types/src/models/rollback/rollback.models.ts` | Shared type definitions |
| `apps/velero-ui/src/components/Backup/forms/BackupFormRollback.vue` | Wizard container |
| `apps/velero-ui/src/components/Rollback/RollbackFormPreview.vue` | Preview step |
| `apps/velero-ui/src/components/Rollback/RollbackFormConfirm.vue` | Confirmation step |
| `apps/velero-ui/src/components/Rollback/RollbackProgress.vue` | Progress display |
| `apps/velero-ui/src/composables/rollback/useRollbackPreview.ts` | Preview composable |
| `apps/velero-ui/src/composables/rollback/useRollbackProgress.ts` | Progress composable |

---

## 9. Helm Release Compatibility

Rollback is compatible with plain Helm releases (no Flux HelmRelease). Verified behavior:

- **Deployment:** Not deleted during rollback, only scaled. Velero skips existing resources. Helm annotations preserved.
- **PVC:** Deleted and restored from backup. Restored PVC retains original Helm annotations (`meta.helm.sh/release-name`). Velero adds its own labels but Helm treats them as user additions (no conflict on three-way merge).
- **Helm release secret:** Not touched during rollback. `helm status` continues to show `deployed`.

If the release were managed by a **Flux HelmRelease**, the reconciliation controller would fight the rollback. In that case, `flux suspend helmrelease` would need to be called before starting.
