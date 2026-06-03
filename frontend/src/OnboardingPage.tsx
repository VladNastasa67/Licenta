import { useEffect, useState } from "react";
import "./AuthPage.css";

const API_BASE = "http://127.0.0.1:8000";

type OnboardingMovie = {
  movieId: number;
  title: string;
  genres: string;
  mean_rating?: number | null;
  runtime?: number | null;
};

type OnboardingPageProps = {
  onCompleted: () => void;
  onLogout: () => void;
};

export default function OnboardingPage({
  onCompleted,
  onLogout,
}: OnboardingPageProps) {
  const [movies, setMovies] = useState<OnboardingMovie[]>([]);
  const [selectedMovieIds, setSelectedMovieIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadMovies() {
      setLoading(true);

      try {
        const response = await fetch(`${API_BASE}/auth/onboarding-movies`);
        const data = await response.json();

        if (!response.ok) {
          alert(data.detail || "Nu s-au putut incarca filmele.");
          return;
        }

        setMovies(data.movies || []);
      } catch (error) {
        console.error(error);
        alert("Nu s-a putut face conexiunea cu backend-ul.");
      } finally {
        setLoading(false);
      }
    }

    loadMovies();
  }, []);

  function toggleMovie(movieId: number) {
    setSelectedMovieIds((prev) => {
      if (prev.includes(movieId)) {
        return prev.filter((id) => id !== movieId);
      }

      if (prev.length >= 5) {
        alert("Poti selecta maximum 5 filme.");
        return prev;
      }

      return [...prev, movieId];
    });
  }

  async function savePreferences() {
    if (selectedMovieIds.length !== 5) {
      alert("Trebuie sa selectezi exact 5 filme.");
      return;
    }

    const token = localStorage.getItem("access_token");

    if (!token) {
      alert("Sesiunea a expirat. Autentifica-te din nou.");
      onLogout();
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_BASE}/auth/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          favorite_movie_ids: selectedMovieIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "Nu s-au putut salva preferintele.");
        return;
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      onCompleted();
    } catch (error) {
      console.error(error);
      alert("Nu s-a putut face conexiunea cu backend-ul.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card onboarding-card">
        <h1>Alege filmele preferate</h1>

        <p className="auth-subtitle">
          Selecteaza exact 5 filme care ti-au placut sau pe care ai vrea sa le
          vezi. Acestea vor fi folosite pentru recomandarile User-KNN.
        </p>

        <div className="movie-picker">
          <div className="movie-picker-header">
            <strong>Top 100 filme populare</strong>
            <span>{selectedMovieIds.length}/5 selectate</span>
          </div>

          {loading ? (
            <p className="movie-picker-message">Se incarca filmele...</p>
          ) : (
            <div className="movie-picker-list">
              {movies.map((movie) => (
                <label
                  key={movie.movieId}
                  className={
                    selectedMovieIds.includes(movie.movieId)
                      ? "onboarding-movie selected"
                      : "onboarding-movie"
                  }
                >
                  <input
                    type="checkbox"
                    checked={selectedMovieIds.includes(movie.movieId)}
                    onChange={() => toggleMovie(movie.movieId)}
                  />

                  <span>
                    {movie.title}
                    {movie.mean_rating ? (
                      <small> ⭐ {movie.mean_rating.toFixed(2)}</small>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          className="auth-submit"
          type="button"
          disabled={saving || selectedMovieIds.length !== 5}
          onClick={savePreferences}
        >
          {saving ? "Se salveaza..." : "Continua in aplicatie"}
        </button>

        <button type="button" className="guest-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}