import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'shoprex:isPublic';

/** Marks a route as reachable without a bearer token. Use sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
