/**
 * AMS Academy pilot curriculum.
 * Static, reviewable content only: no untrusted course imports, model calls,
 * billing, public enrollment, or changes to AJ's separate Stream Lab site.
 */
export const academyCourse = {
  id: "build-your-first-saas",
  title: "Build Your First SaaS",
  subtitle: "A practical, no-code-background learning path",
  description:
    "Learn how to validate a product, plan an MVP, design secure accounts, test payments, and prepare a measured launch.",
  version: 1,
} as const

export const academyLessons = [
  {
    id: "find-the-problem",
    number: 1,
    title: "Find a problem worth solving",
    outcome: "Explain who your customer is and what recurring problem you solve.",
    guidance: [
      "Choose one clearly defined customer, not everyone.",
      "Describe one repeated frustration and what it currently costs them.",
      "Interview potential customers before assuming they will pay.",
    ],
    assignment: "Write one sentence: I help [customer] solve [specific problem] so they can [measurable outcome].",
  },
  {
    id: "scope-the-mvp",
    number: 2,
    title: "Scope your first working product",
    outcome: "Define the smallest useful version you can demonstrate.",
    guidance: [
      "Choose a single core workflow: input, transformation, useful result.",
      "Separate essential launch requirements from future ideas.",
      "Choose one measurable success event, such as a completed first task.",
    ],
    assignment: "Write your top three must-have features, one success event, and three features you are deliberately postponing.",
  },
  {
    id: "accounts-and-interface",
    number: 3,
    title: "Design accounts and a useful dashboard",
    outcome: "Map the experience from sign-in to a successful first task.",
    guidance: [
      "Sketch the sign-in, welcome, main task, and result screens.",
      "Keep administrator actions separate from customer permissions.",
      "Protect each customer's information at every data access point.",
    ],
    assignment: "Draw or describe the four screens a new customer will use on day one.",
  },
  {
    id: "safe-data-and-ai",
    number: 4,
    title: "Store progress and use AI responsibly",
    outcome: "Explain data ownership, persistence, and AI verification.",
    guidance: [
      "Decide which information must survive a browser or device change.",
      "Keep secret keys on the server and restrict data by account.",
      "Treat AI-generated answers as suggestions requiring verification.",
    ],
    assignment: "List the information your app stores, who may read it, and how you will check an AI answer.",
  },
  {
    id: "test-billing-and-security",
    number: 5,
    title: "Test subscriptions and access safely",
    outcome: "Describe a reliable TEST-only checkout and entitlement flow.",
    guidance: [
      "Begin with sandbox transactions; never mistake TEST success for real income.",
      "Grant access only after independently verified payment events.",
      "Make duplicate webhook deliveries safe and verify cancellation behavior.",
    ],
    assignment: "Write a checklist covering TEST checkout, duplicate events, access activation, cancellation, and one failed-payment case.",
  },
  {
    id: "launch-measure-and-improve",
    number: 6,
    title: "Plan a controlled launch",
    outcome: "Choose a measurable customer acquisition and feedback process.",
    guidance: [
      "Create a simple landing page with one clear offer and next step.",
      "Measure activation, retention, acquisition cost, and recurring revenue separately.",
      "Review customer feedback before expanding features or paid advertising.",
    ],
    assignment: "Draft a launch checklist with an activation goal, one traffic source, one feedback question, and a rollback plan.",
  },
] as const

export type AcademyLessonId = (typeof academyLessons)[number]["id"]

export function isAcademyLessonId(value: unknown): value is AcademyLessonId {
  return typeof value === "string" && academyLessons.some((lesson) => lesson.id === value)
}
