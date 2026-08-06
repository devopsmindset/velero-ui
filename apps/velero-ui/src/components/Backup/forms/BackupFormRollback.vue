<template>
  <div class="flex p-4 md:p-5 justify-center flex-col sm:mx-10">
    <!-- Wizard phase: preview + confirm -->
    <Form
      v-if="!isExecuting"
      :is-loading="false"
      :step-components="[
        {
          name: t('rollback.step.preview'),
          component: shallowRef(RollbackFormPreviewWithProps),
        },
        {
          name: t('rollback.step.confirm'),
          component: shallowRef(RollbackFormConfirm),
        },
      ]"
      @on-submit="onSubmit()"
    />

    <!-- Progress phase -->
    <RollbackProgress
      v-else
      :backup-name="backup.metadata.name"
      :namespace="namespace"
    />
  </div>
</template>

<script lang="ts" setup>
import { defineComponent, h, onBeforeUnmount, type PropType, ref, shallowRef } from 'vue';
import { useFormStore } from '@velero-ui-app/stores/form.store';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import type { V1Backup } from '@velero-ui/velero';
import Form from '@velero-ui-app/components/Form.vue';
import RollbackFormPreview from '@velero-ui-app/components/Rollback/RollbackFormPreview.vue';
import RollbackFormConfirm from '@velero-ui-app/components/Rollback/RollbackFormConfirm.vue';
import RollbackProgress from '@velero-ui-app/components/Rollback/RollbackProgress.vue';

const { t } = useI18n();

const props = defineProps({
  backup: { type: Object as PropType<V1Backup>, required: true },
});

const emit = defineEmits(['onClose']);

const formStore = useFormStore();
const { formContent } = storeToRefs(formStore);
const isExecuting = ref(false);
const namespace = ref('');

const RollbackFormPreviewWithProps = defineComponent({
  setup(_, { expose }) {
    const previewRef = ref(null);
    expose({
      validate: () => previewRef.value?.validate(),
      getForm: () => previewRef.value?.getForm(),
    });
    return () =>
      h(RollbackFormPreview, {
        backupName: props.backup.metadata.name,
        ref: previewRef,
      });
  },
});

onBeforeUnmount(() => formStore.reset());

const onSubmit = () => {
  namespace.value = formContent.value[0]?.namespace || '';
  isExecuting.value = true;
};
</script>
