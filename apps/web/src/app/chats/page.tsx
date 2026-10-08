import { ChatShell } from "@/features/chats/chat-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ChatsPage() {
  return <ChatShell />;
}
