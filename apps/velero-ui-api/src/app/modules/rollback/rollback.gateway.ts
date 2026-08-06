import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WsException,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtAuthGuard } from '@velero-ui-api/shared/guards/ws-jwt-auth.guard';
import {
  AppAbility,
  CaslAbilityFactory,
} from '@velero-ui-api/shared/modules/casl/casl-ability.factory';
import { RollbackService } from './rollback.service';
import { Action, RollbackProgressEvent } from '@velero-ui/shared-types';
import { Resources } from '@velero-ui/velero';
import { AppLogger } from '@velero-ui-api/shared/modules/logger/logger.service';

@WebSocketGateway({ cors: true })
export class RollbackGateway {
  constructor(
    private readonly rollbackService: RollbackService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly logger: AppLogger
  ) {}

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('rollback:start')
  public async onRollbackStart(
    @ConnectedSocket() client: Socket,
    @MessageBody('backupName') backupName: string,
    @MessageBody('namespace') namespace: string
  ): Promise<void> {
    const ability: AppAbility = this.caslAbilityFactory.createForUser(
      client.data.user
    );

    if (
      !ability.can(Action.Create, Resources.RESTORE.plural) ||
      !ability.can(Action.Delete, Resources.RESTORE.plural)
    ) {
      throw new WsException('Access denied by policy');
    }

    this.logger.log(
      `Rollback started for backup ${backupName} in namespace ${namespace}`,
      RollbackGateway.name
    );

    const result = await this.rollbackService.execute(
      backupName,
      namespace,
      (event: RollbackProgressEvent) => client.emit('rollback:progress', event)
    );

    client.emit('rollback:complete', result);
  }
}
