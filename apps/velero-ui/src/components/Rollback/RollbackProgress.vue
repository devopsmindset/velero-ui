<template>
  <div class="space-y-4 p-4">
    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-6">
      {{ t('rollback.progress.title') }}
    </h3>

    <ol class="relative border-s border-gray-200 dark:border-gray-700 ms-3">
      <li
        v-for="step in allSteps"
        :key="step.key"
        class="mb-8 ms-6"
      >
        <span
          class="absolute flex items-center justify-center w-8 h-8 rounded-full -start-4 ring-4 ring-white dark:ring-gray-900"
          :class="stepIconClass(step.key)"
        >
          <FontAwesomeIcon
            v-if="getStepStatus(step.key) === RollbackStepStatus.COMPLETED"
            :icon="faCheck"
            class="!w-4 !h-4 text-white"
          />
          <FontAwesomeIcon
            v-else-if="getStepStatus(step.key) === RollbackStepStatus.FAILED"
            :icon="faXmark"
            class="!w-4 !h-4 text-white"
          />
          <div
            v-else-if="getStepStatus(step.key) === RollbackStepStatus.IN_PROGRESS"
            class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"
          ></div>
          <FontAwesomeIcon
            v-else
            :icon="faClock"
            class="!w-4 !h-4 text-gray-400"
          />
        </span>

        <h4 class="font-medium text-gray-900 dark:text-white">
          {{ step.label }}
        </h4>
        <p
          v-if="getStepDetail(step.key)"
          class="text-sm text-gray-500 dark:text-gray-400 mt-1"
        >
          {{ getStepDetail(step.key) }}
        </p>
        <p
          v-if="getStepError(step.key)"
          class="text-sm text-red-600 dark:text-red-400 mt-1"
        >
          {{ getStepError(step.key) }}
        </p>
      </li>
    </ol>

    <!-- Result -->
    <div v-if="isComplete && result">
      <div
        v-if="result.success"
        class="flex p-4 text-sm text-green-800 rounded-lg bg-green-50 dark:bg-gray-700 dark:text-green-400"
      >
        <FontAwesomeIcon :icon="faCheck" class="!w-4 !h-4 me-2 mt-[2px]" />
        <div>
          <span class="font-medium">{{ t('rollback.complete.success') }}</span>
          <span v-if="result.restoreName" class="block mt-1 text-xs">
            Restore: {{ result.restoreName }}
          </span>
        </div>
      </div>
      <div
        v-else
        class="flex p-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-gray-700 dark:text-red-400"
      >
        <FontAwesomeIcon :icon="faXmark" class="!w-4 !h-4 me-2 mt-[2px]" />
        <div>
          <span class="font-medium">{{ t('rollback.complete.failed') }}</span>
          <span v-if="result.error" class="block mt-1 text-xs">{{ result.error }}</span>
          <span v-if="result.originalReplicas" class="block mt-2 text-xs">
            Original replicas: {{ JSON.stringify(result.originalReplicas) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import {
  faCheck,
  faClock,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useRollbackProgress } from '@velero-ui-app/composables/rollback/useRollbackProgress';
import { RollbackStep, RollbackStepStatus } from '@velero-ui/shared-types';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  backupName: { type: String, required: true },
  namespace: { type: String, required: true },
});

const { start, steps, isComplete, result } = useRollbackProgress();

const allSteps = [
  { key: RollbackStep.SCALE_DOWN, label: t('rollback.progress.scaleDown') },
  { key: RollbackStep.WAIT_PODS_TERMINATED, label: t('rollback.progress.waitPods') },
  { key: RollbackStep.DELETE_PVCS, label: t('rollback.progress.deletePvcs') },
  { key: RollbackStep.CREATE_RESTORE, label: t('rollback.progress.createRestore') },
  { key: RollbackStep.WAIT_RESTORE, label: t('rollback.progress.waitRestore') },
  { key: RollbackStep.SCALE_UP, label: t('rollback.progress.scaleUp') },
];

const getStepStatus = (step: RollbackStep): RollbackStepStatus => {
  const events = steps.value.filter((e) => e.step === step);
  if (events.length === 0) return RollbackStepStatus.PENDING;
  return events[events.length - 1].status;
};

const getStepDetail = (step: RollbackStep): string | undefined => {
  const events = steps.value.filter((e) => e.step === step);
  if (events.length === 0) return undefined;
  return events[events.length - 1].detail;
};

const getStepError = (step: RollbackStep): string | undefined => {
  const events = steps.value.filter((e) => e.step === step);
  if (events.length === 0) return undefined;
  return events[events.length - 1].error;
};

const stepIconClass = (step: RollbackStep) => {
  const status = getStepStatus(step);
  switch (status) {
    case RollbackStepStatus.COMPLETED:
      return 'bg-green-500';
    case RollbackStepStatus.IN_PROGRESS:
      return 'bg-blue-500';
    case RollbackStepStatus.FAILED:
      return 'bg-red-500';
    default:
      return 'bg-gray-200 dark:bg-gray-600';
  }
};

onMounted(() => {
  start(props.backupName, props.namespace);
});
</script>
