/**
 * Counts of requests handled, and time spent on them, broken down by method and
 * status. Kept in memory for the lifetime of the process and rendered on demand
 * by the metrics endpoint.
 */
export class RequestMetrics {
  private readonly data: Record<
    string,
    { count: number; duration: number } | undefined
  > = {};

  /**
   * Record one handled request.
   * @param method - The request method.
   * @param status - The status it was answered with.
   * @param duration - How long it took, in seconds.
   */
  public track(method: string, status: number, duration: number): void {
    const id = `${method}-${status}`;
    const existing = this.data[id] ?? { count: 0, duration: 0 };
    this.data[id] = {
      count: existing.count + 1,
      duration: existing.duration + duration,
    };
  }

  /**
   * Render the collected request metrics in the Prometheus text format.
   *
   * `HELP` and `TYPE` belong to a metric family and so are emitted once each,
   * before all of that family's series. Durations are exposed as a summary —
   * `_sum` alongside its matching `_count` — because a `_sum` on its own is not
   * a valid summary and cannot be averaged by `rate()`.
   */
  public render(): string {
    const series = Object.entries(this.data).flatMap(([key, entry]) => {
      if (entry === undefined) {
        return [];
      }
      const separator = key.lastIndexOf('-');
      const labels = `{method="${key.slice(0, separator)}",status="${key.slice(separator + 1)}"}`;
      return [{ labels, count: entry.count, duration: entry.duration }];
    });
    const lines = [
      '# HELP yedra_requests_total Total number of HTTP requests handled.',
      '# TYPE yedra_requests_total counter',
      ...series.map((s) => `yedra_requests_total${s.labels} ${s.count}`),
      '# HELP yedra_request_duration_seconds Time spent handling HTTP requests.',
      '# TYPE yedra_request_duration_seconds summary',
      ...series.flatMap((s) => [
        `yedra_request_duration_seconds_sum${s.labels} ${s.duration}`,
        `yedra_request_duration_seconds_count${s.labels} ${s.count}`,
      ]),
    ];
    return `${lines.join('\n')}\n`;
  }
}

/** Where and how to expose the metrics, on a port of their own. */
export type MetricsOptions = {
  port: number;
  path: string;
  /** Extra metrics text to append to yedra's own. */
  get?: () => Promise<string> | string;
};
