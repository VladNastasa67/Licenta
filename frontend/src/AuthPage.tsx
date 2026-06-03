import { useState } from "react";
import "./AuthPage.css";

const API_BASE = "http://127.0.0.1:8000";

type AuthPageProps = {
  onLoginSuccess: () => void;
  onGuestAccess: () => void;
};

export default function AuthPage({
  onLoginSuccess,
  onGuestAccess,
}: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  function resetFields() {
    setUsername("");
    setEmail("");
    setPassword("");
  }

  function switchToLogin() {
    setMode("login");
    resetFields();
  }

  function switchToRegister() {
    setMode("register");
    resetFields();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";

      const body =
        mode === "login"
          ? {
              email,
              password,
            }
          : {
              username,
              email,
              password,
            };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "A aparut o eroare.");
        return;
      }

      if (mode === "register") {
        alert("Cont creat cu succes. Acum te poti autentifica.");
        switchToLogin();
        return;
      }

      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.removeItem("guest_mode");

      onLoginSuccess();
    } catch (error) {
      console.error(error);
      alert("Nu s-a putut face conexiunea cu backend-ul.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Movie Recommender</h1>

        <p className="auth-subtitle">
          {mode === "login"
            ? "Autentifica-te pentru a primi recomandari personalizate."
            : "Creeaza un cont. Dupa prima autentificare vei alege 5 filme preferate."}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={switchToLogin}
          >
            Login
          </button>

          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={switchToRegister}
          >
            Register
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="auth-form"
          autoComplete={mode === "login" ? "on" : "new-password"}
        >
          {mode === "register" && (
            <div className="form-group">
              <label>Nume utilizator</label>

              <input
                type="text"
                name="register_username_disabled"
                value={username}
                minLength={3}
                autoComplete="new-password"
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>

            <input
              type="email"
              name={mode === "login" ? "email" : "register_email_disabled"}
              value={email}
              autoComplete={mode === "login" ? "email" : "new-password"}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Parola</label>

            <input
              type="password"
              name={
                mode === "login" ? "password" : "register_password_disabled"
              }
              value={password}
              minLength={6}
              maxLength={72}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? "Se proceseaza..."
              : mode === "login"
              ? "Autentificare"
              : "Creare cont"}
          </button>

          <button type="button" className="guest-btn" onClick={onGuestAccess}>
            Continua ca vizitator
          </button>
        </form>
      </div>
    </div>
  );
}