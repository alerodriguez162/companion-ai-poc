import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiGet } from "../api";

export default function DebugPage() {
  const { conversationId } = useParams();
  const query = useQuery({
    queryKey: ["debug", conversationId],
    queryFn: () => apiGet<Record<string, unknown>>(`/api/conversations/${conversationId}/debug`),
    enabled: Boolean(conversationId),
    refetchInterval: 4000,
  });

  return (
    <main>
      <h1>Memory / story debug</h1>
      <p>Conversation: {conversationId}</p>
      {query.error instanceof Error ? <p>{query.error.message}</p> : null}
      <pre>{JSON.stringify(query.isLoading ? "Loading…" : (query.data ?? {}), null, 2)}</pre>
    </main>
  );
}
