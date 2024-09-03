import type { Server } from 'bun';

export interface Endpoint {
  get method(): 'GET' | 'POST' | 'PUT' | 'DELETE';
  handle(
    req: Request,
    params: Record<string, string>,
    server: Server,
  ): Promise<Response | undefined>;
  documentation(): object;
}
