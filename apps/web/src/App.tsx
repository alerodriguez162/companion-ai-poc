import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import CharacterNewPage from "./pages/CharacterNewPage";
import CharacterSelectPage from "./pages/CharacterSelectPage";
import ChatPage from "./pages/ChatPage";
import DebugPage from "./pages/DebugPage";

export default function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <div>
        <nav>
          <Link to="/">Characters</Link>
          <Link to="/characters/new">New character</Link>
        </nav>
        <Routes>
          <Route path="/" element={<CharacterSelectPage />} />
          <Route path="/characters/new" element={<CharacterNewPage />} />
          <Route path="/chat/:characterId" element={<ChatPage />} />
          <Route path="/debug/:conversationId" element={<DebugPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </QueryClientProvider>
  );
}
