import { ApiProperty } from '@nestjs/swagger';
import type { ShoprexErrorResponse } from '../filters/all-exceptions.filter';

/**
 * The documented form of the one error envelope every Shoprex client parses.
 * It `implements ShoprexErrorResponse` deliberately: if the filter's shape ever
 * changes, TypeScript fails here rather than letting the published contract
 * drift away from what the API actually sends.
 */
export class ErrorResponseDto implements ShoprexErrorResponse {
  @ApiProperty({ example: 404, description: 'Repeats the HTTP status code.' })
  statusCode!: number;

  @ApiProperty({
    example: 'NOT_FOUND',
    description: 'Stable machine-readable name of the HTTP status.',
  })
  error!: string;

  @ApiProperty({
    example: 'Branch not found',
    description:
      'One message, or an array of them when request validation rejected several fields at once.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  @ApiProperty({ example: '/api/v1/branches/9f1c…' })
  path!: string;

  @ApiProperty({ example: '2026-08-22T18:52:23.241Z', format: 'date-time' })
  timestamp!: string;
}
