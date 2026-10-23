import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CallContext } from './call-context.types';

/** Use in tool endpoints: `@CurrentCall() call: CallContext` */
export const CurrentCall = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CallContext =>
    ctx.switchToHttp().getRequest().callContext,
);
