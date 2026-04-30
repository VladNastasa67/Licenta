import { useEffect, useState } from "react";
import "./App.css";
import ChatWidget from "./components/ChatWidget.tsx";

type MovieRec = {
  movieId: number;
  title: string;
  genres: string;
  mean_rating?: number;
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

  const [k, setK] = useState("10");
  const [sortBy, setSortBy] = useState< | "default" | "title_asc" | "title_desc" | "rating_asc" | "rating_desc" | "year_asc" | "year_desc" >("default");
  const [ratingMin, setRatingMin] = useState("");
  const [ratingMax, setRatingMax] = useState("");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [algorithm, setAlgorithm] = useState<"popularity" | "filter-only" | "user-knn" | "genre-popularity" | "chat-ai">("popularity");
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
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  }

  function splitGenres(value: string) {
    return value.split("|").filter(Boolean);
  }

  function getYear(title: string) {
    const match = title.match(/\((\d{4})\)/);
    return match ? Number(match[1]) : 0;
  }

  function getSortedRecommendations() {
    if (!data) return [];

    const recs = [...data.recommendations];

    if (sortBy === "title_asc") {
      return recs.sort((a, b) => a.title.localeCompare(b.title));
    }

    if (sortBy === "title_desc") {
      return recs.sort((a, b) => b.title.localeCompare(a.title));
    }

    if (sortBy === "rating_asc") {
      return recs.sort((a, b) => (a.mean_rating ?? 0) - (b.mean_rating ?? 0));
    }

    if (sortBy === "rating_desc") {
      return recs.sort((a, b) => (b.mean_rating ?? 0) - (a.mean_rating ?? 0));
    }

    if (sortBy === "year_asc") {
      return recs.sort((a, b) => getYear(a.title) - getYear(b.title));
    }

    if (sortBy === "year_desc") {
      return recs.sort((a, b) => getYear(b.title) - getYear(a.title));
    }

    return recs;
  }

  async function loadRecommendations() {

    if (algorithm === "chat-ai") {
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const kValue = Number(k);
      const params = new URLSearchParams();

      params.set("k", String(kValue));
      params.set("sort_by", sortBy);

      if (ratingMin !== "") {
        params.set("rating_min", ratingMin);
      }

      if (ratingMax !== "") {
        params.set("rating_max", ratingMax);
      }

      if (yearStart !== "") {
        params.set("year_start", yearStart);
      }

      if (yearEnd !== "") {
        params.set("year_end", yearEnd);
      }

      if (!kValue || kValue < 1) {
        throw new Error("Top K trebuie să fie cel puțin 1");
      }

      let url = `${API_BASE}/recommend/popularity?${params.toString()}`;

      if (algorithm === "user-knn") {
        if (!userId) throw new Error("Selectează un user");

        params.set("userId", String(userId));
        url = `${API_BASE}/recommend/user-knn?${params.toString()}`;
      }

      if (algorithm === "genre-popularity") {
        if (selectedGenres.length === 0) {
          throw new Error("Selectează cel puțin un gen");
        }

        selectedGenres.forEach((g) => {
          params.append("genres", g);
        });

        url = `${API_BASE}/recommend/popularity-by-genres?${params.toString()}`;
      }

      if (algorithm === "filter-only") {
        selectedGenres.forEach((g) => {
          params.append("genres", g);
        });

        url = `${API_BASE}/recommend/filter-only?${params.toString()}`;
      }

      if (algorithm === "user-knn") {
        if (!userId) throw new Error("Selectează un user");
        params.set("userId", String(userId));
        url = `${API_BASE}/recommend/user-knn?${params.toString()}`;
      }

      if (algorithm === "genre-popularity") {
        if (selectedGenres.length === 0) throw new Error("Selectează cel puțin un gen");

        selectedGenres.forEach((g) => {
          params.append("genres", g);
        });

        url = `${API_BASE}/recommend/popularity-by-genres?${params.toString()}`;
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
  }, [
    k,
    algorithm,
    userId,
    selectedGenres,
    sortBy,
    ratingMin,
    ratingMax,
    yearStart,
    yearEnd,
  ]);

  useEffect(() => {
    if (showSeen && algorithm === "user-knn" && userId) {
      loadSeen();
    } else {
      if (!showSeen) setSeenData(null);
      if (algorithm !== "user-knn") setSeenData(null);
    }
  }, [showSeen, userId, seenLimit, seenMinRating, algorithm]);

  function handleAiRecommendations(aiData: {
    reply: string;
    genres?: string[];
    year_start?: number;
    year_end?: number;
    recommendations: MovieRec[];
  }) {
    if (!aiData.recommendations || aiData.recommendations.length === 0) {
      return;
    }
    setAlgorithm("chat-ai");
    setSelectedGenres(aiData.genres || []);

    setData({
      algorithm: "chat-ai",
      k: aiData.recommendations.length,
      genres: aiData.genres || [],
      recommendations: aiData.recommendations,
    });
  }
  
  return (
    <main className="app">
      <div className="container">
        <nav className="navbar">
          <div className="logo">
            <span className="logo-icon">🎬</span>
            <span>MovieAI</span>
          </div>

          <div className="nav-links">
            <a href="#recommendations">Recomandări</a>
            <a href="#genres">Genuri</a>
            <a href="#about">Despre</a>
          </div>
        </nav>

        <header className="header">
          <span className="eyebrow">MovieLens • Recommender System</span>
          <h1>Movie Recommender</h1>
          <p>
            Recomandări de filme folosind popularitate, User-KNN și filtrare după mai multe genuri.
          </p>
        </header>

        <section className="panel">
          <div className="info-line">
            Backend: <code>{API_BASE}</code> • Algoritm: <b>{algorithm}</b>
            {algorithm === "user-knn" && userId ? <> • User: <b>{userId}</b></> : null}
            {algorithm === "genre-popularity" && selectedGenres.length > 0 ? (
              <> • Genuri: <b>{selectedGenres.join(", ")}</b></>
            ) : null}
          </div>

          <div className="controls">
            <div className="field">
              <label>Algoritm</label>
              <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value as any)}>
                <option value="popularity">Popularity</option>
                <option value="user-knn">User-KNN personalizat</option>
                <option value="genre-popularity">Top filme după genuri</option>
                <option value="filter-only">Filtrare simpla</option>
              </select>
            </div>

            <div className="field">
              <label>User</label>
              <select
                value={userId ?? ""}
                onChange={(e) => setUserId(Number(e.target.value))}
                disabled={algorithm !== "user-knn"}
              >
                {users.map((u) => (
                  <option key={u} value={u}>
                    User {u}
                  </option>
                ))}
              </select>
            </div>

            <div className="field small">
              <label>Top K</label>
              <input
                type="number"
                min="1"
                value={k}
                onChange={(e) => {
                  let val = e.target.value;
                  val = val.replace(/^0+(\d)/, "$1");
                  if (val.startsWith("-")) return;
                  setK(val);
                }}
              />
            </div>

            <div className="field">
              <label>Sortare</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="default">Implicit</option>
                <option value="title_asc">Titlu A-Z</option>
                <option value="title_desc">Titlu Z-A</option>
                <option value="rating_desc">Rating descrescător</option>
                <option value="rating_asc">Rating crescător</option>
                <option value="year_desc">An descrescător</option>
                <option value="year_asc">An crescător</option>
              </select>
            </div>

            <div className="field small">
              <label>Rating minim</label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={ratingMin}
                onChange={(e) => setRatingMin(e.target.value)}
                placeholder="ex: 3.5"
              />
            </div>

            <div className="field small">
              <label>Rating maxim</label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={ratingMax}
                onChange={(e) => setRatingMax(e.target.value)}
                placeholder="ex: 5"
              />
            </div>

            <div className="field small">
              <label>Apărut după</label>
              <input
                type="number"
                min="1900"
                max="2100"
                value={yearStart}
                onChange={(e) => setYearStart(e.target.value)}
                placeholder="ex: 2000"
              />
            </div>

            <div className="field small">
              <label>Apărut înainte de</label>
              <input
                type="number"
                min="1900"
                max="2100"
                value={yearEnd}
                onChange={(e) => setYearEnd(e.target.value)}
                placeholder="ex: 2020"
              />
            </div>

            <button
              className="secondary-btn"
              type="button"
              onClick={() => {
                setRatingMin("");
                setRatingMax("");
                setYearStart("");
                setYearEnd("");
              }}
            >
              Resetează filtre
            </button>

            <div className="field">
              <label>Afișare</label>
              <div className="view-toggle">
                <button
                  type="button"
                  className={viewMode === "list" ? "view-btn active" : "view-btn"}
                  onClick={() => setViewMode("list")}
                >
                  ☰ Listă
                </button>

                <button
                  type="button"
                  className={viewMode === "grid" ? "view-btn active" : "view-btn"}
                  onClick={() => setViewMode("grid")}
                >
                  ▦ Grid
                </button>
              </div>
            </div>

            <button onClick={loadRecommendations}>
              {loading ? "Se încarcă..." : "Generează recomandări"}
            </button>

            <button
              className="secondary-btn"
              onClick={async () => {
                const next = !showSeen;
                setShowSeen(next);
                if (next && algorithm === "user-knn" && userId) await loadSeen();
              }}
              disabled={algorithm !== "user-knn"}
            >
              {showSeen ? "Ascunde filme văzute" : "Arată filme văzute"}
            </button>
          </div>
        </section>

        <section className="panel" id="genres">
          <h2 className="section-title">Alege genurile preferate</h2>
          <p className="muted">
            Funcția este activă când alegi algoritmul „Top filme după genuri”.
          </p>

          <div className="genres-grid">
            {genres.map((g) => (
              <label className="genre-chip" key={g}>
                <input
                  type="checkbox"
                  checked={selectedGenres.includes(g)}
                  onChange={() => toggleGenre(g)}
                  disabled={algorithm !== "genre-popularity" && algorithm !== "filter-only"}
                />
                {g}
              </label>
            ))}
          </div>
        </section>

        {error && <div className="error">Eroare: {error}</div>}

        <section className="panel" id="recommendations">
          <h2 className="section-title">Recomandări {data ? `(Top ${data.k})` : ""}</h2>

          {!data && !loading && (
            <div className="empty">Alege un algoritm și generează recomandări.</div>
          )}

          {data && data.recommendations.length === 0 && (
            <div className="empty">Nu s-au găsit filme pentru criteriile selectate.</div>
          )}

          {data && data.recommendations.length > 0 && (
            <div className={viewMode === "grid" ? "movie-grid" : "movie-list"}>
              {getSortedRecommendations().map((m, index) => (
                <article className="movie-card" key={m.movieId}>
                  <div className="movie-rank">#{index + 1}</div>

                  <div>
                    <div className="movie-title">{m.title}</div>

                    <div className="movie-meta">
                      ⭐ Rating mediu: {m.mean_rating ? m.mean_rating.toFixed(2) : "N/A"} • An:{" "}
                      {getYear(m.title) || "N/A"}
                    </div>

                    <div>
                      {splitGenres(m.genres).map((g) => (
                        <span className="badge" key={g}>
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {showSeen && algorithm === "user-knn" && (
          <section className="panel">
            <h2 className="section-title">Filme văzute / evaluate</h2>

            <div className="controls compact">
              <div className="field small">
                <label>Limit</label>
                <input
                  type="number"
                  value={seenLimit}
                  onChange={(e) => setSeenLimit(Number(e.target.value))}
                />
              </div>

              <div className="field small">
                <label>Min rating</label>
                <input
                  type="number"
                  step="0.5"
                  value={seenMinRating}
                  onChange={(e) => setSeenMinRating(Number(e.target.value))}
                />
              </div>

              <button onClick={loadSeen}>
                {seenLoading ? "Se încarcă..." : "Reîncarcă văzute"}
              </button>
            </div>

            {seenError && <div className="error">Eroare: {seenError}</div>}

            {seenData && (
              <>
                <p className="muted">
                  Total ratinguri user: {seenData.count} • Afișate: {seenData.seen.length}
                </p>

                <div className="movie-list">
                  {seenData.seen.map((m) => (
                    <article className="movie-card" key={m.movieId}>
                      <div className="rating-pill">{m.rating}</div>

                      <div>
                        <div className="movie-title">{m.title}</div>

                        <div className="movie-meta">
                          Rating dat de user: {m.rating} • An: {getYear(m.title) || "N/A"}
                        </div>

                        <div>
                          {splitGenres(m.genres).map((g) => (
                            <span className="badge" key={g}>
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>
      <ChatWidget
        currentRecommendations={getSortedRecommendations()}
        onRecommendations={handleAiRecommendations}
      />
    </main>
  );
}