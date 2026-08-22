import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListAuditEventsDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 200,
    default: 50,
    description: 'How many of the most recent events to return.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Narrow the log to one device. A device belonging to another business simply matches nothing — the tenant still comes from the token.',
  })
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
