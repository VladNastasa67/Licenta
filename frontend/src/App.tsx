import { useEffect, useState } from "react";
import AuthPage from "./AuthPage";
import OnboardingPage from "./OnboardingPage";
import "./App.css";
import ChatWidget from "./components/ChatWidget.tsx";

const API_BASE = "http://192.168.0.184:8000";

type MovieRec = {
  movieId: number;
  title: string;
  genres: string;
  mean_rating?: number | null;
  runtime?: number | null;
};

type RecoResponse = {
  algorithm: string;
  k: number;
  userId?: number;
  genres?: string[];
  recommendations: MovieRec[];
};

type KNNUser = {
  userId: number;
  label: string;
  type: "movielens" | "registered";
};

type UsersResponse = {
  count: number;
  limit: number;
  users: KNNUser[];
};

type GenresResponse = {
  genres: string[];
};

type SeenMovie = {
  movieId: number;
  title: string;
  genres: string;
  runtime?: number | null;
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

type LoggedUser = {
  id: number;
  knn_user_id?: number | null;
  username: string;
  email: string;
  onboarding_completed?: boolean;
};

export default function App() {
  const [accessMode, setAccessMode] = useState<
    "auth" | "guest" | "onboarding" | null
  >(null);

  useEffect(() => {
    async function checkAccess() {
      const token = localStorage.getItem("access_token");
      const guestMode = localStorage.getItem("guest_mode");

      if (token) {
        try {
          const response = await fetch(`${API_BASE}/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("user");
            localStorage.removeItem("guest_mode");
            setAccessMode(null);
            return;
          }

          const user = await response.json();
          localStorage.setItem("user", JSON.stringify(user));

          if (user.needs_onboarding) {
            setAccessMode("onboarding");
          } else {
            setAccessMode("auth");
          }

          return;
        } catch (error) {
          console.error(error);
          localStorage.removeItem("access_token");
          localStorage.removeItem("user");
          localStorage.removeItem("guest_mode");
          setAccessMode(null);
          return;
        }
      }

      if (guestMode === "true") {
        setAccessMode("guest");
        return;
      }

      setAccessMode(null);
    }

    checkAccess();
  }, []);

  async function handleLoginSuccess() {
    localStorage.removeItem("guest_mode");

    const token = localStorage.getItem("access_token");

    if (!token) {
      setAccessMode(null);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user");
        setAccessMode(null);
        return;
      }

      const user = await response.json();
      localStorage.setItem("user", JSON.stringify(user));

      if (user.needs_onboarding) {
        setAccessMode("onboarding");
      } else {
        setAccessMode("auth");
      }
    } catch (error) {
      console.error(error);
      setAccessMode(null);
    }
  }

  function handleGuestAccess() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    localStorage.setItem("guest_mode", "true");
    setAccessMode("guest");
  }

  function handleOnboardingCompleted() {
    setAccessMode("auth");
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    localStorage.removeItem("guest_mode");
    setAccessMode(null);
  }

  if (accessMode === null) {
    return (
      <AuthPage
        onLoginSuccess={handleLoginSuccess}
        onGuestAccess={handleGuestAccess}
      />
    );
  }

  if (accessMode === "onboarding") {
    return (
      <OnboardingPage
        onCompleted={handleOnboardingCompleted}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <MovieApp
      onLogout={handleLogout}
      isGuest={accessMode === "guest"}
    />
  );
}

function MovieApp({
  onLogout,
  isGuest,
}: {
  onLogout: () => void;
  isGuest: boolean;
}) {
  const [k, setK] = useState("10");

  const [sortBy, setSortBy] = useState<
    | "default"
    | "title_asc"
    | "title_desc"
    | "rating_asc"
    | "rating_desc"
    | "year_asc"
    | "year_desc"
    | "runtime_asc"
    | "runtime_desc"
  >("default");

  const [ratingMin, setRatingMin] = useState("");
  const [ratingMax, setRatingMax] = useState("");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");
  const [runtimeMin, setRuntimeMin] = useState("");
  const [runtimeMax, setRuntimeMax] = useState("");

  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const [algorithm, setAlgorithm] = useState<
    "popularity" | "filter-only" | "user-knn" | "genre-popularity" | "chat-ai"
  >("popularity");

  const [users, setUsers] = useState<KNNUser[]>([]);
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

  const loggedUser: LoggedUser | null = JSON.parse(
    localStorage.getItem("user") || "null"
  );

  function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem("access_token");

    if (!token) {
      return {};
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  }

  function handleUnauthorized() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    localStorage.removeItem("guest_mode");
    onLogout();
  }

  async function authFetch(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem("access_token");

    const response = await fetch(url, {
      ...options,
      headers: {
        ...((options.headers as Record<string, string>) || {}),
        ...getAuthHeaders(),
      },
    });

    if ((response.status === 401 || response.status === 403) && token) {
      handleUnauthorized();
      throw new Error("Sesiunea a expirat. Autentifica-te din nou.");
    }

    return response;
  }

  async function loadUsers() {
    try {
      const res = await authFetch(`${API_BASE}/users?limit=200`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} la /users`);
      }

      const json: UsersResponse = await res.json();

      setUsers(json.users || []);
      setUserId(json.users?.length ? json.users[0].userId : null);
    } catch (e: any) {
      setError(e?.message ?? "Eroare la incarcarea userilor");
    }
  }

  async function loadGenres() {
    try {
      const res = await authFetch(`${API_BASE}/genres`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} la /genres`);
      }

      const json: GenresResponse = await res.json();
      setGenres(json.genres || []);
    } catch (e: any) {
      setError(e?.message ?? "Eroare la incarcarea genurilor");
    }
  }

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : [...prev, genre]
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

    if (sortBy === "runtime_asc") {
      return recs.sort(
        (a, b) => (a.runtime ?? Infinity) - (b.runtime ?? Infinity)
      );
    }

    if (sortBy === "runtime_desc") {
      return recs.sort((a, b) => (b.runtime ?? 0) - (a.runtime ?? 0));
    }

    return recs;
  }

  async function loadRecommendations() {
    if (algorithm === "chat-ai") {
      return;
    }

    if (isGuest && algorithm === "user-knn") {
      setError("Trebuie sa fii autentificat pentru a folosi recomandarile User-KNN.");
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const kValue = Number(k);
      const params = new URLSearchParams();

      if (!kValue || kValue < 1) {
        throw new Error("Top K trebuie sa fie cel putin 1");
      }

      params.set("k", String(kValue));

      if (sortBy !== "default") {
        params.set("sort_by", sortBy);
      } else {
        params.set("sort_by", "popularity");
      }

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

      if (runtimeMin !== "") {
        params.set("runtime_min", runtimeMin);
      }

      if (runtimeMax !== "") {
        params.set("runtime_max", runtimeMax);
      }

      let url = `${API_BASE}/recommend/popularity?${params.toString()}`;

      if (algorithm === "user-knn") {
        if (!userId) {
          throw new Error("Selecteaza un user");
        }

        params.set("userId", String(userId));
        url = `${API_BASE}/recommend/user-knn?${params.toString()}`;
      }

      if (algorithm === "genre-popularity") {
        if (selectedGenres.length === 0) {
          throw new Error("Selecteaza cel putin un gen");
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

      const res = await authFetch(url);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json: RecoResponse = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Eroare la recomandari");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadSeen() {
    if (!userId) return;

    if (isGuest) {
      setSeenError("Trebuie sa fii autentificat pentru a vedea filmele evaluate de un user.");
      setSeenData(null);
      return;
    }

    setSeenLoading(true);
    setSeenError(null);

    try {
      const url = `${API_BASE}/users/${userId}/seen?limit=${seenLimit}&minRating=${seenMinRating}`;
      const res = await authFetch(url);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} la /users/${userId}/seen`);
      }

      const json: SeenResponse = await res.json();
      setSeenData(json);
    } catch (e: any) {
      setSeenError(e?.message ?? "Eroare la filme vazute");
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
    runtimeMin,
    runtimeMax,
  ]);

  useEffect(() => {
    if (showSeen && algorithm === "user-knn" && userId && !isGuest) {
      loadSeen();
    } else {
      if (!showSeen) {
        setSeenData(null);
      }

      if (algorithm !== "user-knn") {
        setSeenData(null);
      }

      if (isGuest) {
        setSeenData(null);
      }
    }
  }, [showSeen, userId, seenLimit, seenMinRating, algorithm, isGuest]);

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
            <a href="#recommendations">Recomandari</a>
            <a href="#genres">Genuri</a>
            <a href="#about">Despre</a>
          </div>
        </nav>

        <header className="header">
          <span className="eyebrow">MovieLens • Recommender System</span>
          <h1>Movie Recommender</h1>

          <p>
            Recomandari de filme folosind popularitate, User-KNN si filtrare
            dupa mai multe genuri.
          </p>

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "18px",
            }}
          >
            {isGuest ? (
              <span className="muted">
                Mod acces: <b>Vizitator</b>
              </span>
            ) : (
              loggedUser && (
                <span className="muted">
                  Conectat ca: <b>{loggedUser.email}</b>
                </span>
              )
            )}

            <button type="button" onClick={onLogout}>
              {isGuest ? "Iesire vizitator" : "Logout"}
            </button>
          </div>
        </header>

        <section className="panel">
          <div className="info-line">
            Backend: <code>{API_BASE}</code> • Algoritm: <b>{algorithm}</b>

            {algorithm === "user-knn" && userId ? (
              <>
                {" "}
                • User: <b>{userId}</b>
              </>
            ) : null}

            {algorithm === "genre-popularity" && selectedGenres.length > 0 ? (
              <>
                {" "}
                • Genuri: <b>{selectedGenres.join(", ")}</b>
              </>
            ) : null}
          </div>

          {isGuest && (
            <div className="info-line">
              Esti in modul vizitator. Poti folosi recomandarile generale, dar
              User-KNN necesita autentificare.
            </div>
          )}

          <div className="controls">
            <div className="field">
              <label>Algoritm</label>

              <select
                value={algorithm}
                onChange={(e) => {
                  const selected = e.target.value as
                    | "popularity"
                    | "filter-only"
                    | "user-knn"
                    | "genre-popularity"
                    | "chat-ai";

                  if (isGuest && selected === "user-knn") {
                    alert("User-KNN necesita autentificare.");
                    return;
                  }

                  setAlgorithm(selected);
                }}
              >
                <option value="popularity">Popularity</option>

                <option value="user-knn" disabled={isGuest}>
                  User-KNN personalizat {isGuest ? "(necesita login)" : ""}
                </option>

                <option value="genre-popularity">Top filme dupa genuri</option>
                <option value="filter-only">Filtrare simpla</option>
              </select>
            </div>

            <div className="field">
              <label>User</label>

              <select
                value={userId ?? ""}
                onChange={(e) => setUserId(Number(e.target.value))}
                disabled={algorithm !== "user-knn" || isGuest}
              >
                {users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.label}
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

                  if (val.startsWith("-")) {
                    return;
                  }

                  setK(val);
                }}
              />
            </div>

            <div className="field">
              <label>Sortare</label>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="default">Implicit</option>
                <option value="title_asc">Titlu A-Z</option>
                <option value="title_desc">Titlu Z-A</option>
                <option value="rating_desc">Rating descrescator</option>
                <option value="rating_asc">Rating crescator</option>
                <option value="year_desc">An descrescator</option>
                <option value="year_asc">An crescator</option>
                <option value="runtime_asc">Durata crescatoare</option>
                <option value="runtime_desc">Durata descrescatoare</option>
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
              <label>Aparut dupa</label>

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
              <label>Aparut inainte de</label>

              <input
                type="number"
                min="1900"
                max="2100"
                value={yearEnd}
                onChange={(e) => setYearEnd(e.target.value)}
                placeholder="ex: 2020"
              />
            </div>

            <div className="field small">
              <label>Durata minima</label>

              <input
                type="number"
                min="0"
                value={runtimeMin}
                onChange={(e) => setRuntimeMin(e.target.value)}
                placeholder="ex: 80"
              />
            </div>

            <div className="field small">
              <label>Durata maxima</label>

              <input
                type="number"
                min="0"
                value={runtimeMax}
                onChange={(e) => setRuntimeMax(e.target.value)}
                placeholder="ex: 120"
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
                setRuntimeMin("");
                setRuntimeMax("");
              }}
            >
              Reseteaza filtre
            </button>

            <div className="field">
              <label>Afisare</label>

              <div className="view-toggle">
                <button
                  type="button"
                  className={
                    viewMode === "list" ? "view-btn active" : "view-btn"
                  }
                  onClick={() => setViewMode("list")}
                >
                  ☰ Lista
                </button>

                <button
                  type="button"
                  className={
                    viewMode === "grid" ? "view-btn active" : "view-btn"
                  }
                  onClick={() => setViewMode("grid")}
                >
                  ▦ Grid
                </button>
              </div>
            </div>

            <button type="button" onClick={loadRecommendations}>
              {loading ? "Se incarca..." : "Genereaza recomandari"}
            </button>

            <button
              className="secondary-btn"
              type="button"
              onClick={async () => {
                if (isGuest) {
                  alert("Filmele vazute sunt disponibile doar dupa autentificare.");
                  return;
                }

                const next = !showSeen;
                setShowSeen(next);

                if (next && algorithm === "user-knn" && userId) {
                  await loadSeen();
                }
              }}
              disabled={algorithm !== "user-knn" || isGuest}
            >
              {showSeen ? "Ascunde filme vazute" : "Arata filme vazute"}
            </button>
          </div>
        </section>

        <section className="panel" id="genres">
          <h2 className="section-title">Alege genurile preferate</h2>

          <p className="muted">
            Functia este activa cand alegi algoritmul „Top filme dupa genuri”
            sau „Filtrare simpla”.
          </p>

          <div className="genres-grid">
            {genres.map((g) => (
              <label className="genre-chip" key={g}>
                <input
                  type="checkbox"
                  checked={selectedGenres.includes(g)}
                  onChange={() => toggleGenre(g)}
                  disabled={
                    algorithm !== "genre-popularity" &&
                    algorithm !== "filter-only"
                  }
                />

                {g}
              </label>
            ))}
          </div>
        </section>

        {error && <div className="error">Eroare: {error}</div>}

        <section className="panel" id="recommendations">
          <h2 className="section-title">
            Recomandari {data ? `(Top ${data.k})` : ""}
          </h2>

          {!data && !loading && (
            <div className="empty">
              Alege un algoritm si genereaza recomandari.
            </div>
          )}

          {data && data.recommendations.length === 0 && (
            <div className="empty">
              Nu s-au gasit filme pentru criteriile selectate.
            </div>
          )}

          {data && data.recommendations.length > 0 && (
            <div className={viewMode === "grid" ? "movie-grid" : "movie-list"}>
              {getSortedRecommendations().map((m, index) => (
                <article className="movie-card" key={m.movieId}>
                  <div className="movie-rank">#{index + 1}</div>

                  <div>
                    <div className="movie-title">{m.title}</div>

                    <div className="movie-meta">
                      ⭐ Rating mediu:{" "}
                      {m.mean_rating ? m.mean_rating.toFixed(2) : "N/A"} • An:{" "}
                      {getYear(m.title) || "N/A"} • Durata:{" "}
                      {m.runtime ? `${m.runtime} min` : "N/A"}
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

        {showSeen && algorithm === "user-knn" && !isGuest && (
          <section className="panel">
            <h2 className="section-title">Filme vazute / evaluate</h2>

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

              <button type="button" onClick={loadSeen}>
                {seenLoading ? "Se incarca..." : "Reincarca vazute"}
              </button>
            </div>

            {seenError && <div className="error">Eroare: {seenError}</div>}

            {seenData && (
              <>
                <p className="muted">
                  Total ratinguri user: {seenData.count} • Afisate:{" "}
                  {seenData.seen.length}
                </p>

                <div className="movie-list">
                  {seenData.seen.map((m) => (
                    <article className="movie-card" key={m.movieId}>
                      <div className="rating-pill">{m.rating}</div>

                      <div>
                        <div className="movie-title">{m.title}</div>

                        <div className="movie-meta">
                          Rating dat de user: {m.rating} • An:{" "}
                          {getYear(m.title) || "N/A"} • Durata:{" "}
                          {m.runtime ? `${m.runtime} min` : "N/A"}
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