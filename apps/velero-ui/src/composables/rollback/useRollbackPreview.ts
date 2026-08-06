import { inject } from 'vue';
import type { AxiosInstance } from 'axios';
import { useQuery } from '@tanstack/vue-query';
import type { RollbackPreviewResponse } from '@velero-ui/shared-types';

export const useRollbackPreview = (backupName: string) => {
  const axiosInstance: AxiosInstance = inject('axios') as AxiosInstance;

  return useQuery<RollbackPreviewResponse>({
    queryKey: ['rollback-preview', backupName],
    queryFn: async () =>
      (await axiosInstance.get(`/rollbacks/preview/${backupName}`)).data,
    enabled: !!backupName,
  });
};
