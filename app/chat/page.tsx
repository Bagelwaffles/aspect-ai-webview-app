import LeadCapture from "@/components/lead-capture"
import ChatBox from "@/components/chat-box"

export default function ChatPage() {
  return (
    <main className="min-h-[80vh] bg-black text-zinc-100 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <h1 className="text-xl font-semibold">Chat & Lead Intake</h1>
        <p className="text-sm text-zinc-400">Submit your info, then chat with our agents.</p>
        <LeadCapture />
        <ChatBox requireSubscription />
      </div>
    </main>
  )
}
