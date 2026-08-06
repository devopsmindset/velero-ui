<template>
  <div class="space-y-4 mb-4">
    <div
      class="flex p-4 mb-4 text-sm text-orange-800 rounded-lg bg-orange-50 dark:bg-gray-700 dark:text-orange-400"
      role="alert"
    >
      <FontAwesomeIcon
        :icon="faTriangleExclamation"
        class="flex-shrink-0 inline !w-4 !h-4 me-3 mt-[2px]"
      />
      <div>
        <span class="font-medium">{{ t('rollback.preview.warning') }}</span>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
    </div>

    <div v-else-if="isError" class="text-red-500 text-center py-4">
      {{ t('rollback.preview.errorLoading') }}
    </div>

    <template v-else-if="data">
      <div class="mb-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t('rollback.preview.description') }}
        </p>
        <p class="text-sm font-medium text-gray-900 dark:text-white mt-1">
          Namespace: <span class="text-orange-600">{{ data.namespace }}</span>
        </p>
      </div>

      <!-- Deployments -->
      <div v-if="data.deployments.length > 0" class="mb-4">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
          {{ t('rollback.preview.deployments') }}
        </h4>
        <div class="relative overflow-x-auto rounded-lg">
          <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th class="px-4 py-2">Name</th>
                <th class="px-4 py-2">Replicas</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in data.deployments" :key="d.name" class="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
                <td class="px-4 py-2 font-medium text-gray-900 dark:text-white">{{ d.name }}</td>
                <td class="px-4 py-2">{{ d.replicas }} → 0</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- StatefulSets -->
      <div v-if="data.statefulSets.length > 0" class="mb-4">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
          {{ t('rollback.preview.statefulSets') }}
        </h4>
        <div class="relative overflow-x-auto rounded-lg">
          <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th class="px-4 py-2">Name</th>
                <th class="px-4 py-2">Replicas</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in data.statefulSets" :key="s.name" class="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
                <td class="px-4 py-2 font-medium text-gray-900 dark:text-white">{{ s.name }}</td>
                <td class="px-4 py-2">{{ s.replicas }} → 0</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- PVCs -->
      <div v-if="data.pvcs.length > 0" class="mb-4">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
          {{ t('rollback.preview.pvcs') }}
        </h4>
        <div class="relative overflow-x-auto rounded-lg">
          <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th class="px-4 py-2">Name</th>
                <th class="px-4 py-2">Storage Class</th>
                <th class="px-4 py-2">Capacity</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in data.pvcs" :key="p.name" class="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
                <td class="px-4 py-2 font-medium text-gray-900 dark:text-white">{{ p.name }}</td>
                <td class="px-4 py-2">{{ p.storageClass }}</td>
                <td class="px-4 py-2">{{ p.capacity }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Warnings -->
      <div v-if="data.warnings.length > 0" class="mt-4">
        <div
          v-for="(warning, idx) in data.warnings"
          :key="idx"
          class="flex p-3 mb-2 text-sm text-yellow-800 rounded-lg bg-yellow-50 dark:bg-gray-700 dark:text-yellow-300"
        >
          <FontAwesomeIcon :icon="faTriangleExclamation" class="!w-4 !h-4 me-2 mt-[2px]" />
          {{ warning }}
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { useRollbackPreview } from '@velero-ui-app/composables/rollback/useRollbackPreview';
import { useI18n } from 'vue-i18n';
import { inject } from 'vue';

const { t } = useI18n();

const props = defineProps({
  backupName: { type: String, required: true },
});

const { data, isLoading, isError } = useRollbackPreview(props.backupName);

const validate = () => !!data.value && !isError.value;
const getForm = () => ({
  namespace: data.value?.namespace,
  deployments: data.value?.deployments,
  statefulSets: data.value?.statefulSets,
  pvcs: data.value?.pvcs,
});

defineExpose({ validate, getForm });
</script>
