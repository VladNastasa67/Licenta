import { useEffect, useState } from "react";

type MovieRec = {
  movieId: number;
  title: string;
  genres: string;
};

type RecoResponse = {
  algorithm: string;
  k: number;
  userId?: number;
  recommendations: MovieRec[];
};

type UsersResponse = {
  count: number;
  limit: number;
  users: number[];
};

type SeenMovie = {
  movieId: number;
  title: string;
  genres: string;
  rating: number;
  timestamp: number;
};

type SeenResponse = {
  userId: number;
  count: number;
  limit: number;
  minRating: number;
  seen: SeenMovie[];
};

export default function App() {
  const API_BASE = "http://127.0.0.1:8000";

  const [k, setK] = useState<number>(10);
  const [algorithm, setAlgorithm] = useState<"popularity" | "user-knn">("popularity");
  const [users, setUsers] = useState<number[]>([]);
  const [userId, setUserId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RecoResponse | null>(null);

  const [showSeen, setShowSeen] = useState(false);
  const [seenLoading, setSeenLoading] = useState(false);
  const [seenError, setSeenError] = useState<string | null>(null);
  const [seenData, setSeenData] = useState<SeenResponse | null>(null);
  const [seenLimit, setSeenLimit] = useState<number>(20);
  const [seenMinRating, setSeenMinRating] = useState<number>(0);

  async function loadUsers() {
    try {
      const res = await fetch(`${API_BASE}/users?limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status} la /users`);
      const json: UsersResponse = await res.json();
      setUsers(json.users || []);
      setUserId(json.users?.length ? json.users[0] : null);
    } catch (e: any) {
      setError(e?.message ?? "Eroare la încărcarea userilor");
    }
  }

  async function loadRecommendations() {
    setLoading(true);
    setError(null);

    try {
      let url = `${API_BASE}/recommend/popularity?k=${k}`;

      if (algorithm === "user-knn") {
        if (!userId) throw new Error("Selectează un user");
        url = `${API_BASE}/recommend/user-knn?userId=${userId}&k=${k}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: RecoResponse = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Eroare la recomandări");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadSeen() {
    if (!userId) return;

    setSeenLoading(true);
    setSeenError(null);

    try {
      const url = `${API_BASE}/users/${userId}/seen?limit=${seenLimit}&minRating=${seenMinRating}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} la /users/${userId}/seen`);
      const json: SeenResponse = await res.json();
      setSeenData(json);
    } catch (e: any) {
      setSeenError(e?.message ?? "Eroare la filme văzute");
      setSeenData(null);
    } finally {
      setSeenLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, algorithm, userId]);

  // dacă lista e deschisă și schimbi user/filtre/algoritm, reîncarcă “seen”
  useEffect(() => {
    if (showSeen && algorithm === "user-knn" && userId) {
      loadSeen();
    } else {
      // dacă treci pe popularity sau închizi lista, o curățăm
      if (!showSeen) setSeenData(null);
      if (algorithm !== "user-knn") setSeenData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSeen, userId, seenLimit, seenMinRating, algorithm]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 6 }}>🎬 Movie Recommender</h1>
      <div style={{ opacity: 0.8, marginBottom: 20 }}>
        Backend: <code>{API_BASE}</code> • Algoritm: <b>{algorithm}</b>
        {algorithm === "user-knn" && userId ? (
          <>
            {" "}
            • User: <b>{userId}</b>
          </>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <label>
          Algoritm:&nbsp;
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as any)}
            style={{ padding: 6, minWidth: 180 }}
          >
            <option value="popularity">Popularity</option>
            <option value="user-knn">User-KNN (personalizat)</option>
          </select>
        </label>

        <label>
          User:&nbsp;
          <select
            value={userId ?? ""}
            onChange={(e) => setUserId(Number(e.target.value))}
            style={{ padding: 6, minWidth: 140 }}
            disabled={algorithm !== "user-knn"}
          >
            {users.map((u) => (
              <option key={u} value={u}>
                user {u}
              </option>
            ))}
          </select>
        </label>

        <label>
          Top K:&nbsp;
          <input
            type="number"
            min={5}
            max={50}
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
            style={{ width: 90, padding: 6 }}
          />
        </label>

        <button
          onClick={loadRecommendations}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={loading}
        >
          {loading ? "Se încarcă..." : "Reîncarcă"}
        </button>

        <button
          onClick={async () => {
            const next = !showSeen;
            setShowSeen(next);
            if (next && algorithm === "user-knn" && userId) {
              await loadSeen();
            }
          }}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={algorithm !== "user-knn"}
          title={algorithm !== "user-knn" ? "Selectează User-KNN ca să vezi istoricul userului" : ""}
        >
          {showSeen ? "Ascunde filme văzute" : "Arată filme văzute"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#ffe5e5", padding: 12, borderRadius: 8, marginBottom: 14 }}>
          <b>Eroare:</b> {error}
        </div>
      )}

      {data && (
        <div>
          <h2 style={{ marginTop: 0 }}>Recomandări (Top {data.k})</h2>
          <ol style={{ paddingLeft: 18 }}>
            {data.recommendations.map((m) => (
              <li key={m.movieId} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>{m.title}</div>
                <div style={{ opacity: 0.75 }}>{m.genres}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {showSeen && algorithm === "user-knn" && (
        <div style={{ marginTop: 22, paddingTop: 10, borderTop: "1px solid #eee" }}>
          <h2 style={{ marginTop: 0 }}>Filme văzute/evaluate</h2>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <label>
              Limit:&nbsp;
              <input
                type="number"
                min={5}
                max={200}
                value={seenLimit}
                onChange={(e) => setSeenLimit(Number(e.target.value))}
                style={{ width: 90, padding: 6 }}
              />
            </label>

            <label>
              Min rating:&nbsp;
              <input
                type="number"
                min={0}
                max={5}
                step={0.5}
                value={seenMinRating}
                onChange={(e) => setSeenMinRating(Number(e.target.value))}
                style={{ width: 90, padding: 6 }}
              />
            </label>

            <button
              onClick={loadSeen}
              style={{ padding: "8px 12px", cursor: "pointer" }}
              disabled={seenLoading || !userId}
            >
              {seenLoading ? "Se încarcă..." : "Reîncarcă văzute"}
            </button>
          </div>

          {seenError && (
            <div style={{ background: "#ffe5e5", padding: 12, borderRadius: 8, marginBottom: 14 }}>
              <b>Eroare:</b> {seenError}
            </div>
          )}

          {!seenError && !seenData && <div style={{ opacity: 0.8 }}>Nu există date încă.</div>}

          {seenData && (
            <div style={{ opacity: 0.85, marginBottom: 10 }}>
              Total ratinguri user: <b>{seenData.count}</b> • Afișate: <b>{seenData.seen.length}</b>
            </div>
          )}

          {seenData && (
            <ol style={{ paddingLeft: 18 }}>
              {seenData.seen.map((m) => (
                <li key={m.movieId} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>
                    {m.title}{" "}
                    <span style={{ fontWeight: 400, opacity: 0.75 }}>
                      (rating: {m.rating})
                    </span>
                  </div>
                  <div style={{ opacity: 0.75 }}>{m.genres}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
