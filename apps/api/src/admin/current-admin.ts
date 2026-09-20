import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AdminRole } from '@tessera/types';

export type RequestAdmin = {
  id: string;
  email: string;
  role: AdminRole;
  sessionId: string;
};

export const CurrentAdmin = createParamDecorator((data: unknown, ctx: ExecutionContext): RequestAdmin => {
  const req = ctx.switchToHttp().getRequest<{ admin?: RequestAdmin }>();
  if (!req.admin) {
    throw new Error('CurrentAdmin used without AdminGuard');
  }
  return req.admin;
});
