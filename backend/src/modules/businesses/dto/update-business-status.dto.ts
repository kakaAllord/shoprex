import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * A platform administrator suspending or restoring a shop account.
 *
 * Deliberately one field. Renaming a shop, moving its timezone, or changing
 * its currency are the owner's business, not the platform's, and a route that
 * could do all four would be a route that could quietly do the other three.
 */
export class UpdateBusinessStatusDto {
  @ApiProperty({
    example: false,
    description:
      'False suspends the shop: nobody in it can sign in, no phone can enroll, and every session token already in circulation stops working on its very next request. True restores it — nothing was deleted, so the shop resumes with its products, stock, and history intact.',
  })
  @IsBoolean()
  isActive!: boolean;
}
