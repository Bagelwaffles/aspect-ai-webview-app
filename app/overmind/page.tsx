import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { authOptions } from "@/lib/auth"
import { listAgentContracts } from "@/lib/agent-contract-registry"
import { overmindControlState } from "@/lib/server/overmind-control-plane"

export const dynamic = "force-dynamic"

function badge(value: string) {
  return (
    <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
      {value}
    </span>
  )
}

export default async function OvermindPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect("/login?callbackUrl=%2Fovermind")

  const signedInEmail = session.user.email.trim().toLowerCase()
  const ownerEmail = process.env.AMS_OWNER_EMAIL?.trim().toLowerCase()
  if (!ownerEmail || signedInEmail !== ownerEmail) {
    return (
      <main className="mx-auto max-w-3xl p-6 py-12">
        <h1 className="text-2xl font-bold">Owner access required</h1>
        <p className="mt-3 text-muted-foreground">
          The Overmind control plane is restricted to the configured AMS owner session.
        </p>
      </main>
    )
  }

  const contracts = listAgentContracts()
  const control = overmindControlState()
  const live = contracts.filter((contract) => contract.status === "live").length
  const blocked = contracts.filter((contract) => contract.status === "blocked").length
  const actionNative = contracts.filter((contract) => contract.deliverableClass === "action").length

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 py-8 md:p-6">
      <section className="space-y-3">
        <p className="text-sm font-medium text-primary">AMS Owner Control Plane</p>
        <h1 className="text-3xl font-bold">Aspect Overmind</h1>
        <p className="max-w-3xl text-muted-foreground">
          Registry-driven coordination for AMS agents. This first control-plane release can inspect
          contracts and build plans. Generic external execution remains disabled until each executor
          adapter, audit trail, approval gate, rollback path, and production proof is verified.
        </p>
        <div className="flex flex-wrap gap-2">
          {badge("Planning enabled")}
          {badge(control.executionEnabled ? "Execution enabled" : "Execution disabled")}
          {badge(control.killSwitchActive ? "Kill switch active" : "Kill switch standby")}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Registered</p><p className="text-3xl font-bold">{contracts.length}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Live</p><p className="text-3xl font-bold">{live}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Action-native</p><p className="text-3xl font-bold">{actionNative}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Blocked</p><p className="text-3xl font-bold">{blocked}</p></div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Control posture</h2>
        <p className="mt-2 text-sm text-muted-foreground">{control.reason}</p>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-5">
          <h2 className="text-lg font-semibold">Agent contract registry</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Future AMS agents must fit this contract before they can be promoted through Beta to Live.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Agent</th><th className="p-3">Status</th><th className="p-3">Deliverable</th><th className="p-3">Runtime</th><th className="p-3">Approval</th><th className="p-3">Billing</th><th className="p-3">Connections</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.slug} className="border-b last:border-0">
                  <td className="p-3 font-medium">{contract.name}</td>
                  <td className="p-3">{contract.status}</td>
                  <td className="p-3">{contract.deliverableClass}</td>
                  <td className="p-3">{contract.runtime}</td>
                  <td className="p-3">{contract.approval}</td>
                  <td className="p-3">{contract.billing}</td>
                  <td className="p-3 text-muted-foreground">{contract.requiredConnections.join(", ") || "None declared"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
