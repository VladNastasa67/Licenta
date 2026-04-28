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
  genres?: string[];
  recommendations: MovieRec[];
};

type UsersResponse = {
  count: number;
  limit: number;
  users: number[];
};

type GenresResponse = {
  genres: string[];
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

  const [k, setK] = useState(10);
  const [algorithm, setAlgorithm] = useState<"popularity" | "user-knn" | "genre-popularity">("popularity");
  const [users, setUsers] = useState<number[]>([]);
  const [userId, setUserId] = useState<number | null>(null);

  const [genres, setGenres] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RecoResponse | null>(null);

  const [showSeen, setShowSeen] = useState(false);
  const [seenLoading, setSeenLoading] = useState(false);
  const [seenError, setSeenError] = useState<string | null>(null);
  const [seenData, setSeenData] = useState<SeenResponse | null>(null);
  const [seenLimit, setSeenLimit] = useState(20);
  const [seenMinRating, setSeenMinRating] = useState(0);

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

  async function loadGenres() {
    try {
      const res = await fetch(`${API_BASE}/genres`);
      if (!res.ok) throw new Error(`HTTP ${res.status} la /genres`);

      const json: GenresResponse = await res.json();
      setGenres(json.genres || []);
    } catch (e: any) {
      setError(e?.message ?? "Eroare la încărcarea genurilor");
    }
  }

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : [...prev, genre]
    );
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

      if (algorithm === "genre-popularity") {
        if (selectedGenres.length === 0) {
          throw new Error("Selectează cel puțin un gen");
        }

        const genreParams = selectedGenres
          .map((g) => `genres=${encodeURIComponent(g)}`)
          .join("&");

        url = `${API_BASE}/recommend/popularity-by-genres?${genreParams}&k=${k}`;
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
    loadGenres();
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [k, algorithm, userId, selectedGenres]);

  useEffect(() => {
    if (showSeen && algorithm === "user-knn" && userId) {
      loadSeen();
    } else {
      if (!showSeen) setSeenData(null);
      if (algorithm !== "user-knn") setSeenData(null);
    }
  }, [showSeen, userId, seenLimit, seenMinRating, algorithm]);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "Arial" }}>
      <h1>Movie Recommender</h1>

      <p>
        Backend: <code>{API_BASE}</code> • Algoritm: <b>{algorithm}</b>
        {algorithm === "user-knn" && userId ? <> • User: <b>{userId}</b></> : null}
        {algorithm === "genre-popularity" && selectedGenres.length > 0 ? (
          <> • Genuri: <b>{selectedGenres.join(", ")}</b></>
        ) : null}
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <label>
          Algoritm:{" "}
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as any)}
            style={{ padding: 6, minWidth: 220 }}
          >
            <option value="popularity">Popularity</option>
            <option value="user-knn">User-KNN (personalizat)</option>
            <option value="genre-popularity">Top filme după mai multe genuri</option>
          </select>
        </label>

        <label>
          User:{" "}
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
          Top K:{" "}
          <input
            type="number"
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
            style={{ width: 90, padding: 6 }}
          />
        </label>

        <button onClick={loadRecommendations} style={{ padding: "8px 12px", cursor: "pointer" }}>
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

      <div style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 8 }}><b>Genuri:</b></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {genres.map((g) => (
            <label key={g} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={selectedGenres.includes(g)}
                onChange={() => toggleGenre(g)}
                disabled={algorithm !== "genre-popularity"}
              />
              {g}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>
          Eroare: {error}
        </div>
      )}

      {data && (
        <div>
          <h2>Recomandări (Top {data.k})</h2>
          <ol>
            {data.recommendations.map((m) => (
              <li key={m.movieId} style={{ marginBottom: 12 }}>
                <div><b>{m.title}</b></div>
                <div style={{ color: "#666" }}>{m.genres}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {showSeen && algorithm === "user-knn" && (
        <div style={{ marginTop: 32 }}>
          <h2>Filme văzute/evaluate</h2>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <label>
              Limit:{" "}
              <input
                type="number"
                value={seenLimit}
                onChange={(e) => setSeenLimit(Number(e.target.value))}
                style={{ width: 90, padding: 6 }}
              />
            </label>

            <label>
              Min rating:{" "}
              <input
                type="number"
                step="0.5"
                value={seenMinRating}
                onChange={(e) => setSeenMinRating(Number(e.target.value))}
                style={{ width: 90, padding: 6 }}
              />
            </label>

            <button onClick={loadSeen} style={{ padding: "8px 12px", cursor: "pointer" }}>
              {seenLoading ? "Se încarcă..." : "Reîncarcă văzute"}
            </button>
          </div>

          {seenError && <div style={{ color: "red" }}>Eroare: {seenError}</div>}

          {!seenError && !seenData && <div>Nu există date încă.</div>}

          {seenData && (
            <>
              <p>
                Total ratinguri user: {seenData.count} • Afișate: {seenData.seen.length}
              </p>

              <ol>
                {seenData.seen.map((m) => (
                  <li key={m.movieId} style={{ marginBottom: 12 }}>
                    <div>
                      <b>{m.title}</b> (rating: {m.rating})
                    </div>
                    <div style={{ color: "#666" }}>{m.genres}</div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}