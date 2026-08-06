import { Module } from '@nestjs/common';
import { RollbackController } from './rollback.controller';
import { RollbackService } from './rollback.service';
import { RollbackGateway } from './rollback.gateway';
import { CaslModule } from '@velero-ui-api/shared/modules/casl/casl.module';
import { K8sCustomObjectModule } from '@velero-ui-api/modules/k8s-custom-object/k8s-custom-object.module';
import { LoggerModule } from '@velero-ui-api/shared/modules/logger/logger.module';
import { AuthModule } from '@velero-ui-api/modules/auth/auth.module';

@Module({
  imports: [AuthModule, CaslModule, K8sCustomObjectModule, LoggerModule],
  controllers: [RollbackController],
  providers: [RollbackService, RollbackGateway],
})
export class RollbackModule {}
