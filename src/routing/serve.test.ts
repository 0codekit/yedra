import { expect, test } from 'bun:test';
import { Yedra } from './app';

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
