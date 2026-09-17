import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet, type CharacterSummary } from "../api";

export default function CharacterSelectPage() {
  const query = useQuery({
    queryKey: ["characters"],
    queryFn: () => apiGet<CharacterSummary[]>("/api/characters"),
  });

  return (
    <main>
      <h1>Character selection</h1>
      {query.isLoading ? <p>Loading…</p> : null}
      {query.error instanceof Error ? <p>{query.error.message}</p> : null}
      {query.data?.length === 0 ? (
        <p>
          No characters yet. Create one or run <code>pnpm db:seed</code>.
        </p>
      ) : null}
      <ul>
        {query.data?.map((character) => (
          <li key={character.id}>
            <strong>{character.name}</strong>
            <div>{character.description}</div>
            <Link to={`/chat/${character.id}`}>Open chat</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
