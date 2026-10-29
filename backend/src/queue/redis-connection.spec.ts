import { redisConnection } from './redis-connection';

describe('redisConnection', () => {
  it('parses a local URL (the docker-compose default)', () => {
    expect(redisConnection('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
      username: undefined,
      password: undefined,
      db: undefined,
    });
  });

  it('defaults the port and reads credentials and db', () => {
    expect(redisConnection('redis://user:p%40ss@red.example.com/2')).toEqual({
      host: 'red.example.com',
      port: 6379,
      username: 'user',
      password: 'p@ss',
      db: 2,
    });
  });

  it('turns TLS on for rediss://', () => {
    expect(
      redisConnection('rediss://:secret@red.example.com:6380'),
    ).toMatchObject({
      host: 'red.example.com',
      port: 6380,
      password: 'secret',
      tls: {},
    });
  });

  it('does not enable TLS for plain redis://', () => {
    expect(redisConnection('redis://localhost:6379')).not.toHaveProperty('tls');
  });
});
