export class Log {
  /**
   * Output a debug message.
   * @param args - The message.
   */
  public debug(...args: unknown[]) {
    console.debug(...args);
  }

  /**
   * Output an informational message.
   * @param args - The message.
   */
  public info(...args: unknown[]) {
    console.info(...args);
  }

  /**
   * Output a warning message.
   * @param args - The message.
   */
  public warning(...args: unknown[]) {
    console.warn(...args);
  }

  /**
   * Output an error message.
   * @param args - The message.
   */
  public error(...args: unknown[]) {
    console.error(...args);
  }
}
