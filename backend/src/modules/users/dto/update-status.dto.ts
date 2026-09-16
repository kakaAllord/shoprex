import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Switching a person off, or back on.
 *
 * **Not a delete.** Every sale they rang up, every delivery they received, and
 * every audit line naming them stays exactly as it is — the same bargain
 * `Business.isActive` and `Product.isActive` already make. Somebody who leaves
 * and comes back a season later is switched on again, not recreated, and their
 * history is still theirs.
 */
export class UpdateUserStatusDto {
  @ApiProperty({
    example: false,
    description:
      'False switches the person off: they cannot sign in, they disappear from the shop phone’s sign-in list, and any session they already hold stops working on its very next request.',
  })
  @IsBoolean()
  isActive!: boolean;
}
