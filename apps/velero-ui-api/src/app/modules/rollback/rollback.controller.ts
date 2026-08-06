import { Controller, Get, Param } from '@nestjs/common';
import { RollbackService } from './rollback.service';
import { CheckPolicies } from '@velero-ui-api/shared/decorators/check-policies.decorator';
import { AppAbility } from '@velero-ui-api/shared/modules/casl/casl-ability.factory';
import { Action, RollbackPreviewResponse } from '@velero-ui/shared-types';
import { Resources } from '@velero-ui/velero';

@Controller('rollbacks')
export class RollbackController {
  constructor(private readonly rollbackService: RollbackService) {}

  @Get('/preview/:backupName')
  @CheckPolicies(
    (ability: AppAbility) =>
      ability.can(Action.Create, Resources.RESTORE.plural) &&
      ability.can(Action.Delete, Resources.RESTORE.plural)
  )
  public preview(
    @Param('backupName') backupName: string
  ): Promise<RollbackPreviewResponse> {
    return this.rollbackService.preview(backupName);
  }
}
