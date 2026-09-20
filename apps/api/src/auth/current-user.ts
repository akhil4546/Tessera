import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export type RequestUser = {
  id: string;
  handle: string;
  sessionId: string;
};

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
  if (!req.user) {
    throw new Error('CurrentUser used without AuthGuard');
  }
  return req.user;
});

export const OptionalUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    return req.user;
  },
);
