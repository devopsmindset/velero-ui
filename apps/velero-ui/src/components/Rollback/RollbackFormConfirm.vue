<template>
  <div class="space-y-4 mb-4">
    <div
      class="flex p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-gray-700 dark:text-red-400"
      role="alert"
    >
      <FontAwesomeIcon
        :icon="faTriangleExclamation"
        class="flex-shrink-0 inline !w-4 !h-4 me-3 mt-[2px]"
      />
      <div>
        <span class="font-medium">{{ t('rollback.confirm.warning') }}</span>
      </div>
    </div>

    <div class="mb-4">
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {{ t('rollback.confirm.typeNamespace') }}
      </p>
      <div class="mb-2">
        <span class="text-sm font-mono font-bold text-gray-900 dark:text-white">
          {{ namespace }}
        </span>
      </div>
      <input
        v-model="confirmInput"
        type="text"
        class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-orange-500 dark:focus:border-orange-500"
        :placeholder="namespace"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { useFormStore } from '@velero-ui-app/stores/form.store';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const formStore = useFormStore();
const { formContent } = storeToRefs(formStore);

const namespace = formContent.value[0]?.namespace || '';
const confirmInput = ref('');

const validate = () => confirmInput.value === namespace;
const getForm = () => ({ confirmed: true });

defineExpose({ validate, getForm });
</script>
