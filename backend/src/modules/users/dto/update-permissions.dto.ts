import { ApiProperty } from '@nestjs/swagger';
import { UserPermission } from '@prisma/client';
import { IsArray, IsEnum } from 'class-validator';

export class UpdatePermissionsDto {
  @ApiProperty({
    enum: UserPermission,
    isArray: true,
    example: [UserPermission.SELL, UserPermission.VIEW_STOCK],
    description:
      'The complete new permission set. This replaces the old one rather than merging, so a permission left out is a permission taken away. An empty array removes them all.',
  })
  @IsArray()
  @IsEnum(UserPermission, { each: true })
  permissions!: UserPermission[];
}
