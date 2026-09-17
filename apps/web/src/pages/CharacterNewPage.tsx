import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiSend } from "../api";

type TraitState = {
  humor: number;
  sarcasm: number;
  affection: number;
  curiosity: number;
};

export default function CharacterNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [traits, setTraits] = useState<TraitState>({
    humor: 0.5,
    sarcasm: 0.5,
    affection: 0.5,
    curiosity: 0.5,
  });
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiSend<{ id: string }>("/api/characters", "POST", payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["characters"] });
      navigate(`/chat/${created.id}`);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      personality: String(form.get("personality") ?? ""),
      background: String(form.get("background") ?? ""),
      speakingStyle: String(form.get("speakingStyle") ?? ""),
      scenario: String(form.get("scenario") ?? ""),
      traits,
    });
  }

  return (
    <main>
      <h1>Character creator</h1>
      <form onSubmit={onSubmit}>
        <label>
          Name
          <input name="name" required maxLength={80} />
        </label>
        <label>
          Description
          <textarea name="description" required rows={2} />
        </label>
        <label>
          Personality
          <textarea name="personality" required rows={2} />
        </label>
        <label>
          Background
          <textarea name="background" required rows={2} />
        </label>
        <label>
          Speaking style
          <textarea name="speakingStyle" required rows={2} />
        </label>
        <label>
          Scenario
          <textarea name="scenario" required rows={2} />
        </label>
        {(Object.keys(traits) as Array<keyof TraitState>).map((key) => (
          <label key={key}>
            {key} ({traits[key].toFixed(2)})
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={traits[key]}
              onChange={(event) =>
                setTraits((current) => ({ ...current, [key]: Number(event.target.value) }))
              }
            />
          </label>
        ))}
        <button type="submit" disabled={mutation.isPending}>
          Create
        </button>
        {mutation.error instanceof Error ? <p>{mutation.error.message}</p> : null}
      </form>
    </main>
  );
}
