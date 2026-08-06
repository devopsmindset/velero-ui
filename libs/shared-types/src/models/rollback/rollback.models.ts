export enum RollbackStep {
  SCALE_DOWN = 'scale_down',
  WAIT_PODS_TERMINATED = 'wait_pods_terminated',
  DELETE_PVCS = 'delete_pvcs',
  CREATE_RESTORE = 'create_restore',
  WAIT_RESTORE = 'wait_restore',
  SCALE_UP = 'scale_up',
}

export enum RollbackStepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface RollbackProgressEvent {
  step: RollbackStep;
  status: RollbackStepStatus;
  message: string;
  detail?: string;
  error?: string;
  completedAt?: string;
}

export interface RollbackPreviewResponse {
  backupName: string;
  namespace: string;
  deployments: { name: string; replicas: number }[];
  statefulSets: { name: string; replicas: number }[];
  pvcs: { name: string; storageClass: string; capacity: string }[];
  warnings: string[];
}

export interface RollbackCompleteEvent {
  success: boolean;
  restoreName?: string;
  error?: string;
  originalReplicas?: Record<string, number>;
}

export interface RollbackStartPayload {
  backupName: string;
  namespace: string;
}
