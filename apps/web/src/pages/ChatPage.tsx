import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiSend, streamChat, type ChatMessage } from "../api";

type ConversationPayload = {
  id: string;
  characterName: string;
  messages: ChatMessage[];
};

export default function ChatPage() {
  const { characterId } = useParams();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useMutation({
    mutationFn: (id: string) =>
      apiSend<{ id: string }>(`/api/characters/${id}/conversations`, "POST", {}),
    onSuccess: (created) => setConversationId(created.id),
  });

  useEffect(() => {
    if (characterId) {
      bootstrap.mutate(characterId);
    }
    // Intentional: create/resume once per character route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  const conversationQuery = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => apiGet<ConversationPayload>(`/api/conversations/${conversationId}`),
    enabled: Boolean(conversationId),
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversationId || !draft.trim()) {
      return;
    }
    const content = draft.trim();
    setDraft("");
    setStreaming("");
    setError(null);
    try {
      await streamChat(conversationId, content, (token) => {
        setStreaming((current) => current + token);
      });
      setStreaming("");
      await conversationQuery.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chat failed");
    }
  }

  const messages = conversationQuery.data?.messages ?? [];

  return (
    <main>
      <h1>Chat</h1>
      <p>Character: {conversationQuery.data?.characterName ?? characterId}</p>
      {conversationId ? <Link to={`/debug/${conversationId}`}>Open debug</Link> : null}
      <section>
        {messages.map((message) => (
          <article key={message.id}>
            <strong>{message.role}</strong>
            <p>{message.content}</p>
          </article>
        ))}
        {streaming ? (
          <article>
            <strong>ASSISTANT</strong>
            <p>{streaming}</p>
          </article>
        ) : null}
      </section>
      <form onSubmit={(event) => void onSubmit(event)}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Write a message"
        />
        <button type="submit" disabled={!conversationId || !draft.trim()}>
          Send
        </button>
      </form>
      {error ? <p>{error}</p> : null}
    </main>
  );
}
