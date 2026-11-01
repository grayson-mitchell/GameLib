// Worker entry: the only file that sees the real Worker env.
import type { RelayEnv } from './env'
import { handleReport } from './handler'

export default {
  async fetch(request: Request, env: RelayEnv): Promise<Response> {
    return handleReport(request, {
      db: env.DB,
      fetch: (u, i) => fetch(u, i),
      now: () => Date.now(),
      random: () => Math.random(),
      env
    })
  }
}
