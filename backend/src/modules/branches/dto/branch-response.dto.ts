import { ApiProperty } from '@nestjs/swagger';
import type { BranchView } from '../branches.service';

export class BranchViewDto implements BranchView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'The owning tenant. Always taken from the verified token on write, never from the request body.',
  })
  businessId!: string;

  @ApiProperty({ example: 'Tawi la Kariakoo' })
  name!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time', description: 'Set by the backend server clock.' })
  createdAt!: Date;
}
