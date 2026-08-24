import type { Socket } from 'node:net';

/**
 * An IPv4 address in the IPv4-mapped IPv6 form Node reports it in when the
 * listener is dual-stack.
 */
const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;

/**
 * The IP address at the other end of a connection.
 *
 * A dual-stack listener — which is what Node binds by default — reports an
 * IPv4 peer as `::ffff:203.0.113.7`. That is the same address as
 * `203.0.113.7`, only written the other way round, and the mapped spelling
 * silently defeats every comparison an application makes: an allowlist, a
 * rate-limiter key, a log line matched against another system's. It is
 * therefore normalised to the IPv4 form, which is what the peer would call
 * itself. IPv6 addresses are passed through as Node gives them.
 *
 * Undefined once the socket has been destroyed, which a caller that hung up
 * early can manage before its request is dispatched.
 * @param socket - The connection's socket.
 */
export const remoteAddress = (socket: Socket): string | undefined => {
  const address = socket.remoteAddress;
  if (address === undefined) {
    return undefined;
  }
  return IPV4_MAPPED.exec(address)?.[1] ?? address;
};
