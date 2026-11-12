import assert from "node:assert/strict"
import test from "node:test"

import { academyLessons, isAcademyLessonId } from "../lib/academy/catalog"
import { customerSubjectFromProviderSubject } from "../lib/auth"
import {
  academyProgressKey,
  resolveAcademyRedisConfig,
  getAcademyCompletedLessons,
  markAcademyLessonComplete,
} from "../lib/server/academy-progress"

class MemoryRedis {
  private readonly sets = new Map<string, Set<string>>()

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? new Set())]
  }

  async sadd(key: string, member: string): Promise<number> {
    const members = this.sets.get(key) ?? new Set<string>()
    const before = members.size
    members.add(member)
    this.sets.set(key, members)
    return members.size - before
  }
}

function customer(id: string): string {
  const subject = customerSubjectFromProviderSubject(id)
  assert.ok(subject, "test customer subject should be valid")
  return subject
}

test("academy curriculum has six uniquely identified, actionable lessons", () => {
  assert.equal(academyLessons.length, 6)
  assert.equal(new Set(academyLessons.map((lesson) => lesson.id)).size, 6)
  for (const lesson of academyLessons) {
    assert.ok(isAcademyLessonId(lesson.id))
    assert.ok(lesson.assignment.length > 10)
    assert.ok(lesson.guidance.length >= 3)
  }
  assert.equal(isAcademyLessonId("../../outside"), false)
  assert.equal(isAcademyLessonId(""), false)
  assert.equal(isAcademyLessonId(null), false)
})

test("academy progress uses distinct opaque keys and excludes email identifiers", () => {
  const a = academyProgressKey(customer("aj-example-a"))
  const b = academyProgressKey(customer("another-student"))
  assert.notEqual(a, b)
  assert.match(a, /^ams:academy:progress:v1:[a-f0-9]{64}$/)
  assert.doesNotMatch(a, /@/)
  assert.throws(() => academyProgressKey("student@example.com"), /ACADEMY_INVALID_CUSTOMER/)
})

test("completion is idempotent, follows curriculum IDs, and is customer-isolated", async () => {
  const redis = new MemoryRedis()
  const first = customer("student-1")
  const second = customer("student-2")
  await markAcademyLessonComplete(first, academyLessons[0].id, { redis })
  await markAcademyLessonComplete(first, academyLessons[0].id, { redis })
  await markAcademyLessonComplete(first, academyLessons[1].id, { redis })

  assert.deepEqual(
    new Set(await getAcademyCompletedLessons(first, { redis })),
    new Set([academyLessons[0].id, academyLessons[1].id]),
  )
  assert.deepEqual(await getAcademyCompletedLessons(second, { redis }), [])
  await assert.rejects(
    () => markAcademyLessonComplete(first, "not-an-approved-lesson", { redis }),
    /ACADEMY_INVALID_LESSON/,
  )
  assert.deepEqual(await getAcademyCompletedLessons(second, { redis }), [])
})

test("unrecognized progress entries never count as course completion", async () => {
  const redis = new MemoryRedis()
  const subject = customer("student-3")
  await redis.sadd(academyProgressKey(subject), "retired-lesson-id")
  await redis.sadd(academyProgressKey(subject), academyLessons[2].id)
  assert.deepEqual(await getAcademyCompletedLessons(subject, { redis }), [academyLessons[2].id])
})

test("missing persistence fails closed rather than faking a successful lesson", async () => {
  const subject = customer("student-4")
  await assert.rejects(
    () => getAcademyCompletedLessons(subject, { redis: null }),
    /ACADEMY_PROGRESS_STORE_UNAVAILABLE/,
  )
  await assert.rejects(
    () => markAcademyLessonComplete(subject, academyLessons[0].id, { redis: null }),
    /ACADEMY_PROGRESS_STORE_UNAVAILABLE/,
  )
})

test("Academy never falls back to shared AMS or Production Redis configuration", () => {
  assert.equal(resolveAcademyRedisConfig({}), null)
  assert.equal(
    resolveAcademyRedisConfig({
      UPSTASH_REDIS_REST_URL: "https://production-redis.example.com",
      UPSTASH_REDIS_REST_TOKEN: "production-token-placeholder",
      KV_REST_API_URL: "https://other-app.example.com",
      KV_REST_API_TOKEN: "other-token-placeholder",
    }),
    null,
  )
  assert.equal(
    resolveAcademyRedisConfig({
      AMS_ACADEMY_REDIS_REST_URL: "https://academy-preview.example.com",
      AMS_ACADEMY_REDIS_REST_TOKEN: "preview-only-placeholder",
      UPSTASH_REDIS_REST_URL: "https://production-redis.example.com",
      UPSTASH_REDIS_REST_TOKEN: "production-token-placeholder",
    }),
    {
      url: "https://academy-preview.example.com",
      token: "preview-only-placeholder",
    },
  )
  assert.equal(
    resolveAcademyRedisConfig({
      AMS_ACADEMY_REDIS_REST_URL: "https://academy-preview.example.com",
    }),
    null,
  )
})
