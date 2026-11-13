import { ConfigService } from '@nestjs/config';
import { DevCallsEnabledGuard } from './dev-calls.controller';

it('hides dev calls in production unless enabled through config', () => {
  const config = new ConfigService({
    NODE_ENV: 'production',
    ENABLE_DEV_CALLS: 'false',
  });
  const guard = new DevCallsEnabledGuard(config);
  expect(() => guard.canActivate()).toThrow();
  config.set('ENABLE_DEV_CALLS', 'true');
  expect(guard.canActivate()).toBe(true);
});
