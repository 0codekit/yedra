import { Socket } from 'node:net';
import { expect, test } from 'vitest';
import { object, string } from '../lib.js';
import { remoteAddress } from '../util/address.js';
import { Yedra } from './app.js';
import { Get } from './rest.js';
import { Ws } from './websocket.js';

/** The two spellings a connection over loopback can arrive with. */
const LOOPBACK = ['127.0.0.1', '::1'];

/** A socket that reports `address` as its peer, without connecting anywhere. */
const withRemote = (address: string | undefined): Socket =>
  Object.create(Socket.prototype, {
    remoteAddress: { value: address },
  }) as Socket;

test('Endpoint Sees The Address The Request Came From', async () => {
  const context = await new Yedra()
    .use(
      '/whoami',
      new Get({
        category: 'Test',
        summary: 'Reports the caller address.',
        params: {},
        query: {},
        headers: {},
        res: object({ address: string() }),
        do(req) {
          return { body: { address: req.socketAddress ?? 'unknown' } };
        },
      }),
    )
    .listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/whoami`);
  expect(LOOPBACK).toContain(
    ((await response.json()) as { address: string }).address,
  );
  await context.stop();
});

test('The Address Is Not Taken From X-Forwarded-For', async () => {
  const context = await new Yedra()
    .use(
      '/whoami',
      new Get({
        category: 'Test',
        summary: 'Reports the caller address.',
        params: {},
        query: {},
        headers: {},
        res: object({ address: string(), forwarded: string() }),
        do(req) {
          return {
            body: {
              address: req.socketAddress ?? 'unknown',
              // The header is still there for an app that trusts its proxy.
              forwarded: req.rawHeaders['x-forwarded-for'] ?? 'none',
            },
          };
        },
      }),
    )
    .listen(0, { quiet: true });
  const response = await fetch(`http://localhost:${context.port}/whoami`, {
    headers: { 'x-forwarded-for': '203.0.113.7' },
  });
  const body = (await response.json()) as {
    address: string;
    forwarded: string;
  };
  expect(body.address).not.toBe('203.0.113.7');
  expect(LOOPBACK).toContain(body.address);
  expect(body.forwarded).toBe('203.0.113.7');
  await context.stop();
});

test('WebSocket Endpoint Sees The Address The Connection Came From', async () => {
  const context = await new Yedra()
    .use(
      '/ws',
      new Ws({
        category: 'Test',
        summary: 'Reports the caller address.',
        params: {},
        query: {},
        headers: {},
        do(socket, req) {
          socket.send(req.socketAddress ?? 'unknown');
        },
      }),
    )
    .listen(0, { quiet: true });
  const ws = new WebSocket(`http://localhost:${context.port}/ws`);
  const message = await new Promise<Buffer>((resolve) => {
    ws.onmessage = (event) => resolve(event.data as Buffer);
  });
  expect(LOOPBACK).toContain(message.toString('utf-8'));
  ws.close();
  await context.stop();
});

test('An IPv4 Peer On A Dual-Stack Listener Is Not Reported As IPv6', () => {
  // What Node reports for an IPv4 client on a listener bound to `::`. It is the
  // same address as `203.0.113.7`, and an application comparing the two — an
  // allowlist, a rate-limiter key — has to see it as such.
  expect(remoteAddress(withRemote('::ffff:203.0.113.7'))).toBe('203.0.113.7');
  expect(remoteAddress(withRemote('::ffff:127.0.0.1'))).toBe('127.0.0.1');
  // A genuine IPv6 address is passed through, mapped-looking prefixes included.
  expect(remoteAddress(withRemote('2001:db8::1'))).toBe('2001:db8::1');
  expect(remoteAddress(withRemote('::ffff:203.0.113'))).toBe(
    '::ffff:203.0.113',
  );
  expect(remoteAddress(withRemote('203.0.113.7'))).toBe('203.0.113.7');
  // A socket that has already been destroyed knows no peer.
  expect(remoteAddress(withRemote(undefined))).toBeUndefined();
});
