// Worker entry: the only file that sees the real Worker env.
import type { RelayEnv } from './env'
import { handleReport } from './handler'
import { purgeExpiredBuckets } from './limits'

export default {
  async fetch(request: Request, env: RelayEnv): Promise<Response> {
    return handleReport(request, {
      db: env.DB,
      fetch: (u, i) => fetch(u, i),
      now: () => Date.now(),
      random: () => Math.random(),
      env
    })
  },

  // CR-03: Cron Trigger (wrangler.jsonc "triggers") purging expired
  // rate-limit buckets, so hashed IPs never outlive their window by more
  // than the cron interval, even when no request arrives.
  async scheduled(
    controller: { scheduledTime: number },
    env: RelayEnv
  ): Promise<void> {
    await purgeExpiredBuckets(env.DB, controller.scheduledTime)
  }
}
