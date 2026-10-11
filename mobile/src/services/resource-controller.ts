import { ApiError } from './api-client';
type Clock = { now: () => number; set: (work: () => void, delay: number) => unknown; clear: (timer: unknown) => void };
const clock: Clock = { now: Date.now, set: (work, delay) => setTimeout(work, delay), clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>) };
// One foreground generation owns one timer/read. Late aborted reads cannot schedule more work.
export class ResourceController<T> {
  private foreground = false; private revision = 0; private timer: unknown;
  private flight: AbortController | null = null; private failures = 0; private nextAllowed = 0; private forbidden = false; private value: T | null = null;
  constructor(private load: (signal: AbortSignal) => Promise<T>, private receive: (value: T) => void,
    private fail: (error: unknown) => void, private loading: (value: boolean) => void,
    private poll: () => ((value: T) => boolean) | undefined, private interval: number, private time: Clock = clock) {}
  activate() { this.foreground = true; if (!this.forbidden) void this.refresh(); }
  deactivate() {
    this.foreground = false; this.revision++; this.time.clear(this.timer); this.timer = undefined;
    this.flight?.abort(); this.flight = null; this.loading(false);
  }
  private schedule() {
    this.time.clear(this.timer); this.timer = undefined;
    if (!this.foreground || this.forbidden || !this.poll() || (this.value !== null && !this.poll()!(this.value))) return;
    this.timer = this.time.set(() => { this.timer = undefined; void this.refresh(); }, Math.max(this.interval * Math.min(4, 2 ** this.failures), this.nextAllowed - this.time.now()));
  }
  async refresh() {
    if (!this.foreground || this.flight) return;
    if (this.time.now() < this.nextAllowed) { this.schedule(); return; }
    this.time.clear(this.timer); this.timer = undefined;
    const controller = new AbortController(); const revision = this.revision; this.flight = controller; this.loading(true);
    try {
      const value = await this.load(controller.signal);
      if (!controller.signal.aborted && this.revision === revision) {
        this.value = value; this.failures = 0; this.forbidden = false; this.receive(value);
      }
    } catch (error) {
      if (!controller.signal.aborted && this.revision === revision) {
        this.failures++;
        if (error instanceof ApiError && error.status === 429) this.nextAllowed = this.time.now() + (error.retryAfter || 120) * 1000;
        if (error instanceof ApiError && [401, 403].includes(error.status)) { this.value = null; this.forbidden = true; }
        this.fail(error);
      }
    } finally {
      if (this.flight === controller) { this.flight = null; this.loading(false); this.schedule(); }
    }
  }
}
