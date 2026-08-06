import { IsNotEmpty, IsString } from 'class-validator';

export class RollbackPreviewParamsDto {
  @IsString()
  @IsNotEmpty()
  backupName: string;
}
