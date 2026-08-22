import { ApiProperty } from '@nestjs/swagger';
import type { BusinessDetail, BusinessSummary } from '../businesses.service';

class BusinessBranchDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Tawi la Kariakoo' })
  name!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;
}

export class BusinessSummaryDto implements BusinessSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Duka la Mfano' })
  name!: string;

  @ApiProperty({ example: 'Africa/Dar_es_Salaam' })
  timezone!: string;

  @ApiProperty({ example: 'TZS' })
  currency!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time', description: 'Set by the backend server clock.' })
  createdAt!: Date;

  @ApiProperty({ example: 2 })
  branchCount!: number;

  @ApiProperty({ example: 5 })
  userCount!: number;
}

export class BusinessDetailDto extends BusinessSummaryDto implements BusinessDetail {
  @ApiProperty({ type: [BusinessBranchDto] })
  branches!: { id: string; name: string; isActive: boolean }[];
}
