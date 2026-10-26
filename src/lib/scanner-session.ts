import type { QrDetector } from "@/lib/scanner-detector";
import type { BadgeLookupResult } from "@/lib/scanner-lookup";

type CameraProblem = "permission" | "missing" | "busy" | "unsupported" | "insecure" | "decoder";
export type ScannerState =
  | { kind: "idle" | "starting" | "scanning" | "rearming" | "verifying" }
  | { kind: "camera-error"; problem: CameraProblem }
  | BadgeLookupResult;

export interface ScannerDependencies {
  requestCamera(): Promise<MediaStream>;
  createDetector(): Promise<QrDetector>;
  lookup(token: string, signal: AbortSignal): Promise<BadgeLookupResult>;
  schedule(callback: () => void, delay: number): unknown;
  cancel(timer: unknown): void;
  now(): number;
}

/** Called only by START CAMERA, never during module evaluation or rendering. */
export async function requestScannerCamera(environment = {
  secure: globalThis.isSecureContext,
  devices: globalThis.navigator?.mediaDevices,
}): Promise<MediaStream> {
  if (!environment.secure) throw Object.assign(new Error("Secure connection required"), { name: "InsecureContext" });
  if (!environment.devices?.getUserMedia) throw Object.assign(new Error("Camera unavailable"), { name: "UnsupportedCamera" });
  return environment.devices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
}

function cameraProblem(error: unknown): CameraProblem {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission";
  if (name === "NotFoundError") return "missing";
  if (name === "InsecureContext") return "insecure";
  if (name === "UnsupportedCamera") return "unsupported";
  return "busy";
}

/** Transient session only. Public state contains neither tokens nor frames. */
export class ScannerSession {
  private state: ScannerState = { kind: "idle" };
  private generation = 0;
  private disposed = false;
  private stream: MediaStream | null = null;
  private detector: QrDetector | null = null;
  private timer: unknown;
  private request: AbortController | null = null;
  private detecting = false;
  private lastToken: string | null = null;
  private pendingToken: string | null = null;
  private absentSince: number | null = null;
  private removeTrackListeners: () => void = () => {};

  constructor(
    private video: HTMLVideoElement,
    private deps: ScannerDependencies,
    private onState: (state: ScannerState) => void,
  ) {}

  private current(generation: number) { return !this.disposed && this.generation === generation; }
  private emit(state: ScannerState) {
    this.state = state;
    if (!this.disposed) this.onState(state);
  }

  async start() {
    if (this.disposed || this.stream || this.state.kind === "starting") return;
    const generation = ++this.generation;
    this.emit({ kind: "starting" });
    let decoding = false;
    try {
      const stream = await this.deps.requestCamera();
      if (!this.current(generation)) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      const ended = () => {
        if (!this.current(generation)) return;
        this.generation++;
        this.release();
        this.emit({ kind: "camera-error", problem: "busy" });
      };
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.addEventListener("ended", ended));
      this.removeTrackListeners = () => tracks.forEach((track) => track.removeEventListener("ended", ended));
      this.video.srcObject = stream;
      await this.video.play();
      if (!this.current(generation)) return;
      decoding = true;
      const detector = await this.deps.createDetector();
      if (!this.current(generation)) return;
      this.detector = detector;
      this.emit({ kind: "scanning" });
      this.queue(generation);
    } catch (error) {
      if (!this.current(generation)) return;
      this.release();
      this.emit({ kind: "camera-error", problem: decoding ? "decoder" : cameraProblem(error) });
    }
  }

  private queue(generation: number, delay = 200) {
    this.timer = this.deps.schedule(() => { this.timer = undefined; void this.tick(generation); }, delay);
  }

  private async tick(generation: number) {
    if (!this.current(generation) || this.state.kind !== "scanning" || !this.detector) return;
    if (this.detecting || this.video.readyState < 2 || !this.video.videoWidth) { this.queue(generation); return; }
    let values: string[];
    this.detecting = true;
    try {
      values = await this.detector.detect(this.video);
    } catch {
      if (this.current(generation)) {
        this.release();
        this.emit({ kind: "camera-error", problem: "decoder" });
      }
      return;
    } finally {
      this.detecting = false;
    }
    if (!this.current(generation) || this.state.kind !== "scanning") return;

    if (this.lastToken !== null) {
      if (values.includes(this.lastToken)) this.absentSince = null;
      else {
        this.absentSince ??= this.deps.now();
        if (this.deps.now() - this.absentSince >= 600) this.lastToken = null;
      }
    }
    const token = values.find((value) => value.length > 0 && value !== this.lastToken);
    if (token !== undefined) {
      this.lastToken = token;
      this.absentSince = null;
      this.pendingToken = token;
      void this.verify(token, generation);
    } else this.queue(generation);
  }

  private async verify(token: string, generation: number) {
    this.emit({ kind: "verifying" });
    const request = new AbortController();
    this.request = request;
    let result: BadgeLookupResult;
    try { result = await this.deps.lookup(token, request.signal); }
    catch { result = { kind: "verify-error" }; }
    if (!this.current(generation)) return;
    this.request = null;
    if (result.kind !== "verify-error") this.pendingToken = null;
    if (result.kind === "access-error") this.release();
    this.emit(result);
  }

  retryLookup() {
    if (!this.disposed && this.state.kind === "verify-error" && this.pendingToken !== null) {
      void this.verify(this.pendingToken, this.generation);
    }
  }

  scanNext() {
    if (this.disposed || !this.stream || !this.detector || !["found", "not-found", "verify-error"].includes(this.state.kind)) return;
    this.pendingToken = null;
    const generation = this.generation;
    this.emit({ kind: "rearming" });
    this.timer = this.deps.schedule(() => {
      this.timer = undefined;
      if (!this.current(generation)) return;
      this.emit({ kind: "scanning" });
      this.queue(generation, 0);
    }, 1000);
  }

  private release() {
    if (this.timer !== undefined) this.deps.cancel(this.timer);
    this.timer = undefined;
    this.request?.abort();
    this.request = null;
    this.removeTrackListeners();
    this.removeTrackListeners = () => {};
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.detector = null;
    this.video.pause();
    this.video.srcObject = null;
    this.lastToken = this.pendingToken = null;
    this.absentSince = null;
  }

  stop() {
    this.generation++;
    this.release();
    if (!this.disposed) this.emit({ kind: "idle" });
  }

  dispose() {
    this.disposed = true;
    this.stop();
  }
}
