import type {
  RunnerOutputFrame,
  RunnerSpawnedFrame
} from 'common/types/ipc/sidecarInternal'

/**
 * The per-call stream table of a runner call that watches its output (Phase 88.2, 88.2-15, D-02). The shell writes
 * `runnerOutput` and `runnerSpawned` frames on the sidecar's stdin ahead of the call's reply; each names the stream
 * (`streamId`) the caller opened, and this table hands them to that stream's `onOutput` and `onSpawn` callbacks, which are
 * the callbacks `callRunner`'s `onOutput` option and `spawnAsync`'s observer have always taken.
 *
 * `createRunnerStreams` keeps its table in a closure, so there is no module-level state, no timer and no handle (the
 * sidecar exit contract): two tables never share a stream, and a stream that is never closed holds only its own entry.
 *
 * Delivery is in `seq` order. The pipe the frames travel on is ordered, so frames arrive in order; the table orders them
 * anyway, so a frame that is dropped (the listener refuses a malformed one) or that arrives late does not reorder the
 * output. A gap is waited for only while at most {@link MAX_PENDING} later frames are held, and `close` delivers whatever is
 * held, oldest first, so a dropped frame costs that frame and never the stream.
 */

/** How many frames behind a gap a stream holds before it delivers past the gap. */
export const MAX_PENDING = 256

/**
 * The handle a stream's callbacks get for the run's child: structurally the runner's `ChildHandle`. `pid` is undefined
 * until the shell reports the spawn (a helper-class run reports none). `exitCode` and `signalCode` stay null here: the
 * run's end is the call's reply, not the handle's. `kill` ends the run through the injected kill and answers `true`.
 */
export interface RunnerChildHandle {
  readonly pid: number | undefined
  readonly exitCode: number | null
  readonly signalCode: NodeJS.Signals | null
  kill(signal?: NodeJS.Signals): boolean
}

/** What the caller of a runner call wants to hear, in the TS callers' own shape. */
export interface RunnerStreamCallbacks {
  /** One chunk of the child's output, with the run's handle. */
  onOutput?: (chunk: string, child: RunnerChildHandle) => void
  /** The child started; called once, with the handle every later `onOutput` carries. */
  onSpawn?: (child: RunnerChildHandle) => void
}

/** What a table needs from the transport: ending the run that answers to a stream id (`runnerKill`). */
export interface RunnerStreamsDeps {
  kill(streamId: string): Promise<unknown>
}

/** The table. */
export interface RunnerStreams {
  /** Opens a stream for one call and answers the id the call sends as its `streamId`. */
  open(callbacks: RunnerStreamCallbacks): string
  /** Delivers what is still held, oldest first, and forgets the stream. Harmless for a stream that is not open. */
  close(streamId: string): void
  /** One `runnerOutput` frame: delivered in `seq` order to the open stream it names, ignored for any other. */
  output(frame: RunnerOutputFrame): void
  /** One `runnerSpawned` frame: gives the open stream it names its handle, once. */
  spawned(frame: RunnerSpawnedFrame): void
  /** How many streams are open (tests, and a caller that wants to know nothing was left behind). */
  size(): number
}

interface Stream {
  readonly callbacks: RunnerStreamCallbacks
  /** The handle the callbacks get: pid-less until the spawn is reported. */
  child: RunnerChildHandle
  /** True once a `runnerSpawned` frame has been taken. */
  spawned: boolean
  /** The `seq` the next delivery is for. */
  next: number
  /** Frames that arrived ahead of `next`, by `seq`. */
  readonly pending: Map<number, RunnerOutputFrame>
}

/** Builds a table over `deps`. */
export function createRunnerStreams(deps: RunnerStreamsDeps): RunnerStreams {
  const streams = new Map<string, Stream>()
  let counter = 0

  /** A handle for `streamId` with `pid` (undefined before the spawn). */
  function handleFor(
    streamId: string,
    pid: number | undefined
  ): RunnerChildHandle {
    return {
      pid,
      exitCode: null,
      signalCode: null,
      kill() {
        // A run that has ended answers nothing to the id, which is the answer the caller wants: it is gone.
        void deps.kill(streamId).catch(() => undefined)
        return true
      }
    }
  }

  /** Hands one frame to the stream's `onOutput` and moves its `next` past the frame. */
  function deliver(stream: Stream, frame: RunnerOutputFrame): void {
    stream.next = frame.seq + 1
    stream.callbacks.onOutput?.(frame.chunk, stream.child)
  }

  /** The held frame with the smallest `seq`, if any. */
  function oldestPending(stream: Stream): RunnerOutputFrame | undefined {
    let oldest: RunnerOutputFrame | undefined
    for (const frame of stream.pending.values()) {
      if (oldest === undefined || frame.seq < oldest.seq) oldest = frame
    }
    return oldest
  }

  /** Delivers every held frame that is next in line. */
  function drain(stream: Stream): void {
    for (;;) {
      const frame = stream.pending.get(stream.next)
      if (!frame) return
      stream.pending.delete(frame.seq)
      deliver(stream, frame)
    }
  }

  return {
    open(callbacks) {
      counter += 1
      const streamId = `runner-stream-${counter}`
      streams.set(streamId, {
        callbacks,
        child: handleFor(streamId, undefined),
        spawned: false,
        next: 0,
        pending: new Map()
      })
      return streamId
    },

    close(streamId) {
      const stream = streams.get(streamId)
      if (!stream) return
      streams.delete(streamId)
      // Whatever is still held is behind a gap that will not fill now: deliver it in order.
      for (;;) {
        const frame = oldestPending(stream)
        if (!frame) return
        stream.pending.delete(frame.seq)
        deliver(stream, frame)
      }
    },

    output(frame) {
      const stream = streams.get(frame.streamId)
      if (!stream) return
      // A frame already delivered, or one for a seq already held, is not delivered twice.
      if (frame.seq < stream.next || stream.pending.has(frame.seq)) return
      stream.pending.set(frame.seq, frame)
      drain(stream)
      // Too many frames behind one gap: it is not going to fill, so go on from the oldest held.
      while (stream.pending.size > MAX_PENDING) {
        const oldest = oldestPending(stream)
        if (!oldest) break
        stream.pending.delete(oldest.seq)
        deliver(stream, oldest)
        drain(stream)
      }
    },

    spawned(frame) {
      const stream = streams.get(frame.streamId)
      if (!stream || stream.spawned) return
      stream.spawned = true
      stream.child = handleFor(frame.streamId, frame.pid)
      stream.callbacks.onSpawn?.(stream.child)
    },

    size() {
      return streams.size
    }
  }
}
