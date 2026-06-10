import { useState } from "react";

type MovieRec = {
  movieId: number;
  title: string;
  genres: string;
  mean_rating?: number | null;
  runtime?: number | null;
};

type ChatAiResponse = {
  reply: string;
  genres?: string[];
  year_start?: number;
  year_end?: number;
  recommendations: MovieRec[];
};

type Message = {
  role: "user" | "ai";
  text: string;
};

type Props = {
  currentRecommendations: MovieRec[];
  onRecommendations: (data: ChatAiResponse) => void;
};

export default function ChatWidget({
  currentRecommendations,
  onRecommendations,
}: Props) {
  const API_BASE = "https://licenta-backend-n7r9.onrender.com";

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      text: "Salutare 👋 Ce film ai dori să vizionezi astăzi?",
    },
  ]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat-ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          current_recommendations: currentRecommendations,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: ChatAiResponse = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: data.reply,
        },
      ]);

      if (data.recommendations && data.recommendations.length > 0) {
        onRecommendations(data);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "A apărut o eroare la conectarea cu asistentul AI.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-box">
          <div className="chat-header">
            <span>MovieAI Assistant</span>
            <button onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={msg.role === "ai" ? "chat-message ai" : "chat-message user"}
              >
                {msg.text}
              </div>
            ))}

            {loading && <div className="chat-message ai">Caut recomandări...</div>}
          </div>

          <div className="chat-input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              placeholder="Ex: Vreau acțiune cu comedie din anii 2000..."
            />

            <button onClick={sendMessage}>➤</button>
          </div>
        </div>
      )}

      <button className="chat-button" onClick={() => setOpen((prev) => !prev)}>
        💬
      </button>
    </div>
  );
}