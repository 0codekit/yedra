import { expect, test } from 'vitest';
import { Yedra } from './app.js';

test('Server Static Without Fallback', async () => {
  const context = await new Yedra().listen(0, {
    serve: {
      dir: 'test/static',
    },
    quiet: true,
  });
  const response1 = await fetch(`http://localhost:${context.port}/hello.txt`);
  expect(response1.status).toBe(200);
  expect(await response1.text()).toStrictEqual('Hello, world!\n');
  const response2 = await fetch(`http://localhost:${context.port}/abcd`);
  expect(response2.status).toBe(404);
  expect(await response2.json()).toStrictEqual({
    status: 404,
    errorMessage: 'Path `/abcd` not found.',
    code: 'not_found',
  });
  await context.stop();
});

test('Server Static With Headers', async () => {
  const context = await new Yedra().listen(0, {
    serve: {
      dir: 'test/static',
      fallback: 'test/static/main.html',
      headers: {
        'access-control-allow-origin': '*',
      },
    },
    quiet: true,
  });
  const response1 = await fetch(`http://localhost:${context.port}/hello.txt`);
  expect(response1.status).toBe(200);
  expect(response1.headers.get('access-control-allow-origin')).toBe('*');
  await response1.text();
  // fallback responses get the headers too
  const response2 = await fetch(`http://localhost:${context.port}/abcd`);
  expect(response2.status).toBe(200);
  expect(response2.headers.get('access-control-allow-origin')).toBe('*');
  await response2.text();
  await context.stop();
});

test('Server Static With Header Function', async () => {
  const allowed = new Set(['https://app.example.com']);
  const context = await new Yedra().listen(0, {
    serve: {
      dir: 'test/static',
      headers: (req): Record<string, string> => {
        const { origin } = req.headers;
        if (typeof origin === 'string' && allowed.has(origin)) {
          return { 'access-control-allow-origin': origin };
        }
        return {};
      },
    },
    quiet: true,
  });
  const allowedResponse = await fetch(
    `http://localhost:${context.port}/hello.txt`,
    {
      headers: { origin: 'https://app.example.com' },
    },
  );
  expect(allowedResponse.status).toBe(200);
  expect(allowedResponse.headers.get('access-control-allow-origin')).toBe(
    'https://app.example.com',
  );
  await allowedResponse.text();
  const deniedResponse = await fetch(
    `http://localhost:${context.port}/hello.txt`,
    {
      headers: { origin: 'https://evil.example.com' },
    },
  );
  expect(deniedResponse.status).toBe(200);
  expect(deniedResponse.headers.get('access-control-allow-origin')).toBeNull();
  await deniedResponse.text();
  await context.stop();
});

test('Server Static With Fallback', async () => {
  const context = await new Yedra().listen(0, {
    serve: {
      dir: 'test/static',
      fallback: 'test/static/main.html',
    },
    quiet: true,
  });
  const response1 = await fetch(`http://localhost:${context.port}/hello.txt`);
  expect(response1.status).toBe(200);
  expect(await response1.text()).toStrictEqual('Hello, world!\n');
  const response2 = await fetch(`http://localhost:${context.port}/abcd`);
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

test('Server Static Serves Index At Root', async () => {
  const context = await new Yedra().listen(0, {
    serve: {
      dir: 'test/static',
    },
    quiet: true,
  });
  const response = await fetch(`http://localhost:${context.port}/`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/html');
  expect(await response.text()).toContain('Index');
  await context.stop();
});

test('An Immutable Pattern With The Global Flag Still Matches Every File', async () => {
  // `RegExp.test` advances `lastIndex` on a global pattern, so reusing the
  // caller's object matched every other file — and since assets load
  // concurrently, which ones was down to chance
  const context = await new Yedra().listen(0, {
    serve: {
      dir: 'test/static',
      immutable: { pattern: /\.css$/g, maxAge: 60 },
    },
    quiet: true,
  });
  for (let i = 0; i < 3; ++i) {
    const response = await fetch(`http://localhost:${context.port}/large.css`);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, immutable',
    );
    await response.text();
  }
  const other = await fetch(`http://localhost:${context.port}/hello.txt`);
  expect(other.headers.get('cache-control')).toBe(
    'public, max-age=0, must-revalidate',
  );
  await other.text();
  await context.stop();
});
