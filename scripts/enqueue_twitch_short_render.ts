import { enqueueTwitchShortRender } from "../lib/server/twitch-short-render-jobs"

async function main() {
  const clipId = process.argv[2]?.trim()
  if (!clipId) throw new Error("TWITCH_SHORT_ACCEPTANCE_CLIP_REQUIRED")

  const job = await enqueueTwitchShortRender(clipId)
  process.stdout.write(JSON.stringify({
    jobId: job.jobId,
    clipId: job.clipId,
    status: job.status,
  }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "TWITCH_SHORT_ACCEPTANCE_ENQUEUE_FAILED")
  process.exit(1)
})
