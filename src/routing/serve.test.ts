import { expect, test } from 'vitest';
import { Yedra } from './app.js';

test('Server Static Without Fallback', async () => {
  const context = await new Yedra().listen(27537, {
    serve: {
      dir: 'test/static',
    },
    quiet: true,
  });
  const response1 = await fetch('http://localhost:27537/hello.txt');
  expect(response1.status).toBe(200);
  expect(await response1.text()).toStrictEqual('Hello, world!\n');
  const response2 = await fetch('http://localhost:27537/abcd');
  expect(response2.status).toBe(404);
  expect(await response2.json()).toStrictEqual({
    status: 404,
    errorMessage: 'Path `/abcd` not found.',
    code: 'not_found',
  });
  await context.stop();
});

test('Server Static With Headers', async () => {
  const context = await new Yedra().listen(27539, {
    serve: {
      dir: 'test/static',
      fallback: 'test/static/main.html',
      headers: {
        'access-control-allow-origin': '*',
      },
    },
    quiet: true,
  });
  const response1 = await fetch('http://localhost:27539/hello.txt');
  expect(response1.status).toBe(200);
  expect(response1.headers.get('access-control-allow-origin')).toBe('*');
  await response1.text();
  // fallback responses get the headers too
  const response2 = await fetch('http://localhost:27539/abcd');
  expect(response2.status).toBe(200);
  expect(response2.headers.get('access-control-allow-origin')).toBe('*');
  await response2.text();
  await context.stop();
});

test('Server Static With Header Function', async () => {
  const allowed = new Set(['https://app.example.com']);
  const context = await new Yedra().listen(27540, {
    serve: {
      dir: 'test/static',
      headers: (req) => {
        const origin = req.headers.origin;
        if (typeof origin === 'string' && allowed.has(origin)) {
          return { 'access-control-allow-origin': origin };
        }
        return {};
      },
    },
    quiet: true,
  });
  const allowedResponse = await fetch('http://localhost:27540/hello.txt', {
    headers: { origin: 'https://app.example.com' },
  });
  expect(allowedResponse.status).toBe(200);
  expect(allowedResponse.headers.get('access-control-allow-origin')).toBe(
    'https://app.example.com',
  );
  await allowedResponse.text();
  const deniedResponse = await fetch('http://localhost:27540/hello.txt', {
    headers: { origin: 'https://evil.example.com' },
  });
  expect(deniedResponse.status).toBe(200);
  expect(deniedResponse.headers.get('access-control-allow-origin')).toBeNull();
  await deniedResponse.text();
  await context.stop();
});

test('Server Static With Fallback', async () => {
  const context = await new Yedra().listen(27538, {
    serve: {
      dir: 'test/static',
      fallback: 'test/static/main.html',
    },
    quiet: true,
  });
  const response1 = await fetch('http://localhost:27538/hello.txt');
  expect(response1.status).toBe(200);
  expect(await response1.text()).toStrictEqual('Hello, world!\n');
  const response2 = await fetch('http://localhost:27538/abcd');
  expect(response2.status).toBe(200);
  expect(await response2.text()).toStrictEqual(`<!DOCTYPE html>
<html>
  <body>
    This is the default file.
  </body>
</html>
`);
  await context.stop();
});
