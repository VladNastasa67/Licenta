from fastapi import FastAPI, Query, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, HTTPBearer, HTTPAuthorizationCredentials

from backend.app.services.data_service import load_data
from backend.app.services.popularity import PopularityRecommender
from backend.app.services.user_knn import UserKNNRecommender

from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI

import os
import json
import re

from backend.app.services.user_service import (
    create_user,
    authenticate_user,
    find_user_by_email,
    get_registered_users,
    save_user_favorite_movies
)

from backend.app.services.auth_service import (
    create_access_token,
    decode_access_token
)

# -------------------------
# INIT
# -------------------------

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI(title="Movie Recommender API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ratings, movies = load_data()

pop_model = PopularityRecommender()
pop_model.fit(ratings)

user_knn_model = UserKNNRecommender()
user_knn_model.fit(ratings)


# -------------------------
# MODELS
# -------------------------

class ChatMovie(BaseModel):
    movieId: int
    title: str
    genres: str
    mean_rating: float | None = None
    runtime: int | None = None


class ChatRequest(BaseModel):
    message: str
    current_recommendations: list[ChatMovie] = []

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str
    
class OnboardingRequest(BaseModel):
    favorite_movie_ids: list[int]


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
optional_bearer = HTTPBearer(auto_error=False)

def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer)
):
    if credentials is None:
        return None

    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        return None

    email = payload.get("sub")

    if email is None:
        return None

    user = find_user_by_email(email)

    if user is None:
        return None

    return user


def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Token invalid sau expirat."
        )

    email = payload.get("sub")

    if email is None:
        raise HTTPException(
            status_code=401,
            detail="Token invalid."
        )

    user = find_user_by_email(email)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Utilizatorul nu exista."
        )

    return user

# -------------------------
# UTILS
# -------------------------

def clean_runtime(value):
    if value is None:
        return None

    try:
        if str(value).lower() == "nan":
            return None

        return int(value)
    except Exception:
        return None

def extract_year(title):
    match = re.search(r"\((\d{4})\)", title)
    return int(match.group(1)) if match else None


def detect_genres_from_message(message):
    msg = message.lower()

    genre_map = {
        "actiune": "Action",
        "acțiune": "Action",
        "action": "Action",

        "aventura": "Adventure",
        "aventură": "Adventure",
        "adventure": "Adventure",

        "animatie": "Animation",
        "animație": "Animation",
        "animation": "Animation",

        "copii": "Children",
        "children": "Children",

        "comedie": "Comedy",
        "comedii": "Comedy",
        "comedy": "Comedy",

        "crima": "Crime",
        "crimă": "Crime",
        "crime": "Crime",

        "documentar": "Documentary",
        "documentare": "Documentary",
        "documentary": "Documentary",

        "drama": "Drama",
        "dramă": "Drama",
        "drame": "Drama",

        "fantasy": "Fantasy",
        "fantezie": "Fantasy",

        "horror": "Horror",

        "imax": "IMAX",

        "musical": "Musical",

        "mister": "Mystery",
        "mystery": "Mystery",

        "romantic": "Romance",
        "romantice": "Romance",
        "dragoste": "Romance",
        "romance": "Romance",

        "sf": "Sci-Fi",
        "sci-fi": "Sci-Fi",
        "science fiction": "Sci-Fi",

        "thriller": "Thriller",

        "razboi": "War",
        "război": "War",
        "war": "War",

        "western": "Western",
    }

    detected = []

    for word, genre in genre_map.items():
        pattern = r"\b" + re.escape(word) + r"\b"

        if re.search(pattern, msg) and genre not in detected:
            detected.append(genre)

    return detected


def infer_year_filters(message):
    msg = message.lower()

    year_start = None
    year_end = None

    if "din anii 2000" in msg:
        year_start = 2000
        year_end = 2009
        return year_start, year_end

    match_between = re.search(
        r"(?:intre|între)\s+(\d{4})\s+(?:si|și)\s+(\d{4})",
        msg
    )

    if match_between:
        year_start = int(match_between.group(1))
        year_end = int(match_between.group(2))
        return year_start, year_end

    match_after = re.search(r"(?:dupa|după)\s+(\d{4})", msg)

    if match_after:
        year_start = int(match_after.group(1))

    match_before = re.search(r"(?:inainte de|înainte de)\s+(\d{4})", msg)

    if match_before:
        year_end = int(match_before.group(1)) - 1

    return year_start, year_end


def infer_sort_by(message):
    msg = message.lower()

    if (
        "cele mai noi" in msg
        or "cel mai nou" in msg
        or "cele mai recente" in msg
        or "cel mai recent" in msg
        or "an descrescator" in msg
        or "an descrescător" in msg
    ):
        return "year_desc"

    if (
        "cele mai vechi" in msg
        or "cel mai vechi" in msg
        or "an crescator" in msg
        or "an crescător" in msg
    ):
        return "year_asc"

    if (
        "cele mai bune" in msg
        or "cel mai bun" in msg
        or "rating mare" in msg
        or "rating descrescator" in msg
        or "rating descrescător" in msg
        or "cele mai apreciate" in msg
    ):
        return "rating_desc"

    if (
        "rating mic" in msg
        or "rating crescator" in msg
        or "rating crescător" in msg
        or "cele mai slabe" in msg
    ):
        return "rating_asc"

    if "a-z" in msg or "alfabetic crescator" in msg or "alfabetic crescător" in msg:
        return "title_asc"

    if "z-a" in msg or "alfabetic descrescator" in msg or "alfabetic descrescător" in msg:
        return "title_desc"

    if (
        "cele mai scurte" in msg
        or "cel mai scurt" in msg
        or "durata crescatoare" in msg
        or "durată crescătoare" in msg
        or "durata mica" in msg
        or "durată mică" in msg
        or "filme scurte" in msg
    ):
        return "runtime_asc"

    if (
        "cele mai lungi" in msg
        or "cel mai lung" in msg
        or "durata descrescatoare" in msg
        or "durată descrescătoare" in msg
        or "durata mare" in msg
        or "durată mare" in msg
        or "filme lungi" in msg
    ):
        return "runtime_desc"

    return "popularity"

def movie_records(df):
    records = []

    for _, row in df.iterrows():
        records.append({
            "movieId": int(row["movieId"]),
            "title": row["title"],
            "genres": row["genres"],
            "mean_rating": None if "mean_rating" not in row or str(row["mean_rating"]).lower() == "nan" else float(row["mean_rating"]),
            "runtime": clean_runtime(row["runtime"]) if "runtime" in row else None
        })

    return records


def filter_by_genres(df, genres):
    if not genres:
        return df

    filtered = df.copy()

    for genre in genres:
        filtered = filtered[
            filtered["genres"].str.contains(genre, case=False, na=False)
        ]

    return filtered

def filter_by_rating(df, rating_min=None, rating_max=None):
    filtered = df.copy()

    if rating_min is not None:
        filtered = filtered[filtered["mean_rating"] >= float(rating_min)]

    if rating_max is not None:
        filtered = filtered[filtered["mean_rating"] <= float(rating_max)]

    return filtered


def filter_by_year(df, year_start=None, year_end=None):
    filtered = df.copy()

    if year_start is not None:
        filtered = filtered[filtered["year"] >= int(year_start)]

    if year_end is not None:
        filtered = filtered[filtered["year"] <= int(year_end)]

    return filtered

def filter_by_runtime(df, runtime_min=None, runtime_max=None):
    filtered = df.copy()

    if "runtime" not in filtered.columns:
        return filtered

    filtered["runtime"] = filtered["runtime"].apply(clean_runtime)

    if runtime_min is not None:
        filtered = filtered[filtered["runtime"].notna()]
        filtered = filtered[filtered["runtime"] >= int(runtime_min)]

    if runtime_max is not None:
        filtered = filtered[filtered["runtime"].notna()]
        filtered = filtered[filtered["runtime"] <= int(runtime_max)]

    return filtered


def apply_sorting(df, sort_by="popularity"):
    if sort_by == "year_desc":
        return df.sort_values(
            ["year", "mean_rating"],
            ascending=[False, False]
        )

    if sort_by == "year_asc":
        return df.sort_values(
            ["year", "mean_rating"],
            ascending=[True, False]
        )

    if sort_by == "rating_desc":
        return df.sort_values(
            ["mean_rating", "year"],
            ascending=[False, False]
        )

    if sort_by == "rating_asc":
        return df.sort_values(
            ["mean_rating", "year"],
            ascending=[True, False]
        )

    if sort_by == "runtime_asc":
        return df.sort_values(
            ["runtime", "mean_rating"],
            ascending=[True, False],
            na_position="last"
        )

    if sort_by == "runtime_desc":
        return df.sort_values(
            ["runtime", "mean_rating"],
            ascending=[False, False],
            na_position="last"
        )

    if sort_by == "title_asc":
        return df.sort_values("title", ascending=True)

    if sort_by == "title_desc":
        return df.sort_values("title", ascending=False)

    if "rank" in df.columns:
        return df.sort_values("rank")

    return df.sort_values("mean_rating", ascending=False)

def build_movies_with_stats():
    recs = movies.copy()

    recs = recs.merge(
        pop_model.ranking[["movieId", "mean_rating"]],
        on="movieId",
        how="left"
    )

    recs["year"] = recs["title"].apply(extract_year)

    return recs


def normalize_title(title):
    title = title.lower()
    title = re.sub(r"\(\d{4}\)", "", title)
    title = re.sub(r"[^a-z0-9\s]", "", title)
    title = re.sub(r"\s+", " ", title).strip()
    return title


def find_movie_by_title(movie_title):
    searched = normalize_title(movie_title)

    all_movies = build_movies_with_stats()
    all_movies["normalized_title"] = all_movies["title"].apply(normalize_title)

    exact_match = all_movies[all_movies["normalized_title"] == searched]

    if not exact_match.empty:
        return exact_match.iloc[0]

    partial_match = all_movies[
        all_movies["normalized_title"].str.contains(searched, case=False, na=False)
    ]

    if not partial_match.empty:
        return partial_match.iloc[0]

    reverse_partial_match = all_movies[
        all_movies["normalized_title"].apply(lambda x: x in searched)
    ]

    if not reverse_partial_match.empty:
        return reverse_partial_match.iloc[0]

    return None


def get_genre_set(genres_str):
    if not genres_str or genres_str == "(no genres listed)":
        return set()

    return set(genres_str.split("|"))


def recommend_similar_movies_by_title(movie_title, k=10):
    source_movie = find_movie_by_title(movie_title)

    if source_movie is None:
        return None, None

    source_movie_id = int(source_movie["movieId"])
    source_title = source_movie["title"]
    source_genres = get_genre_set(source_movie["genres"])

    recs = build_movies_with_stats()
    recs = recs.dropna(subset=["mean_rating"])
    recs["year"] = recs["title"].apply(extract_year)

    recs = recs[recs["movieId"] != source_movie_id].copy()

    def similarity_score(row):
        movie_genres = get_genre_set(row["genres"])

        if not source_genres or not movie_genres:
            return 0

        common_genres = source_genres.intersection(movie_genres)
        all_genres = source_genres.union(movie_genres)

        return len(common_genres) / len(all_genres)

    recs["similarity_score"] = recs.apply(similarity_score, axis=1)

    recs = recs[recs["similarity_score"] > 0]

    recs = recs.sort_values(
        ["similarity_score", "mean_rating", "year"],
        ascending=[False, False, False]
    )

    selected = recs.head(k)

    return source_title, selected

def is_current_list_question(message):
    msg = message.lower()

    keywords = [
        "din lista",
        "lista mea",
        "lista curenta",
        "lista curentă",
        "dintre acestea",
        "dintre filmele astea",
        "dintre filmele acestea",
        "pe care le ai afișate",
        "pe care le ai afisate",
        "afișate",
        "afisate",
    ]

    return any(k in msg for k in keywords)


def answer_from_current_list(message, current_list):
    if not current_list:
        return None

    msg = message.lower()

    detected_genres = detect_genres_from_message(message)

    filtered_list = current_list

    if detected_genres:
        for genre in detected_genres:
            filtered_list = [
                movie for movie in filtered_list
                if genre.lower() in movie.get("genres", "").lower()
            ]

    if not filtered_list:
        return {
            "reply": "Nu am găsit în lista afișată niciun film care să respecte genul cerut.",
            "genres": detected_genres,
            "year_start": None,
            "year_end": None,
            "sort_by": "popularity",
            "recommendations": []
        }

    movies_with_year = [
        movie for movie in filtered_list
        if movie.get("year") is not None
    ]

    if (
        "cel mai recent" in msg
        or "cel mai nou" in msg
        or "an de aparitie" in msg
        or "an de apariție" in msg
    ):
        if not movies_with_year:
            return None

        movie = max(movies_with_year, key=lambda x: x["year"])

        if detected_genres:
            return {
                "reply": f'Cel mai recent film de {", ".join(detected_genres)} din lista ta este "{movie["title"]}".',
                "genres": detected_genres,
                "year_start": None,
                "year_end": None,
                "sort_by": "year_desc",
                "recommendations": []
            }

        return {
            "reply": f'Cel mai recent film din lista ta este "{movie["title"]}".',
            "genres": [],
            "year_start": None,
            "year_end": None,
            "sort_by": "year_desc",
            "recommendations": []
        }

    if "cel mai vechi" in msg:
        if not movies_with_year:
            return None

        movie = min(movies_with_year, key=lambda x: x["year"])

        if detected_genres:
            return {
                "reply": f'Cel mai vechi film de {", ".join(detected_genres)} din lista ta este "{movie["title"]}".',
                "genres": detected_genres,
                "year_start": None,
                "year_end": None,
                "sort_by": "year_asc",
                "recommendations": []
            }

        return {
            "reply": f'Cel mai vechi film din lista ta este "{movie["title"]}".',
            "genres": [],
            "year_start": None,
            "year_end": None,
            "sort_by": "year_asc",
            "recommendations": []
        }

    if "cel mai bun" in msg or "rating" in msg or "apreciat" in msg:
        movies_with_rating = [
            movie for movie in filtered_list
            if movie.get("mean_rating") is not None
        ]

        if not movies_with_rating:
            return None

        movie = max(movies_with_rating, key=lambda x: x["mean_rating"])

        if detected_genres:
            return {
                "reply": f'Cel mai bun film de {", ".join(detected_genres)} din lista ta este "{movie["title"]}", cu rating mediu {movie["mean_rating"]:.2f}.',
                "genres": detected_genres,
                "year_start": None,
                "year_end": None,
                "sort_by": "rating_desc",
                "recommendations": []
            }

        return {
            "reply": f'Cel mai bun film din lista ta este "{movie["title"]}", cu rating mediu {movie["mean_rating"]:.2f}.',
            "genres": [],
            "year_start": None,
            "year_end": None,
            "sort_by": "rating_desc",
            "recommendations": []
        }

    return None


def answer_from_dataset_question(message):
    msg = message.lower()

    if "setul de date" not in msg and "dataset" not in msg:
        return None

    detected_genres = detect_genres_from_message(message)

    recs = build_movies_with_stats()
    recs = recs.dropna(subset=["mean_rating"])
    recs = recs.dropna(subset=["year"])

    if detected_genres:
        recs = filter_by_genres(recs, detected_genres)

    if recs.empty:
        return {
            "reply": "Nu am găsit filme care să respecte cerința în setul de date.",
            "genres": detected_genres,
            "year_start": None,
            "year_end": None,
            "sort_by": "popularity",
            "recommendations": []
        }

    if "cel mai recent" in msg or "cel mai nou" in msg:
        selected = recs.sort_values(
            ["year", "mean_rating"],
            ascending=[False, False]
        ).head(1)

        movie = selected.iloc[0]

        return {
            "reply": f'Cel mai recent film{" de " + ", ".join(detected_genres) if detected_genres else ""} din setul de date este "{movie["title"]}".',
            "genres": detected_genres,
            "year_start": None,
            "year_end": None,
            "sort_by": "year_desc",
            "recommendations": []
        }

    if "cel mai vechi" in msg:
        selected = recs.sort_values(
            ["year", "mean_rating"],
            ascending=[True, False]
        ).head(1)

        movie = selected.iloc[0]

        return {
            "reply": f'Cel mai vechi film{" de " + ", ".join(detected_genres) if detected_genres else ""} din setul de date este "{movie["title"]}".',
            "genres": detected_genres,
            "year_start": None,
            "year_end": None,
            "sort_by": "year_asc",
            "recommendations": []
        }

    if "cel mai bun" in msg or "rating" in msg or "apreciat" in msg:
        selected = recs.sort_values(
            ["mean_rating", "year"],
            ascending=[False, False]
        ).head(1)

        movie = selected.iloc[0]

        return {
            "reply": f'Cel mai bun film{" de " + ", ".join(detected_genres) if detected_genres else ""} din setul de date este "{movie["title"]}", cu rating mediu {movie["mean_rating"]:.2f}.',
            "genres": detected_genres,
            "year_start": None,
            "year_end": None,
            "sort_by": "rating_desc",
            "recommendations": []
        }

    return None

def extract_similar_movie_title(message):
    msg = message.strip()

    patterns = [
        r"mi-a placut\s+(.+?)(?:,|\.|\?|$)",
        r"mi a placut\s+(.+?)(?:,|\.|\?|$)",
        r"mi-a plăcut\s+(.+?)(?:,|\.|\?|$)",
        r"mi a plăcut\s+(.+?)(?:,|\.|\?|$)",

        r"am vazut\s+(.+?)\s+si mi-a placut",
        r"am vazut\s+(.+?)\s+si mi a placut",
        r"am văzut\s+(.+?)\s+și mi-a plăcut",
        r"am văzut\s+(.+?)\s+și mi a plăcut",

        r"filme asemanatoare cu\s+(.+?)(?:,|\.|\?|$)",
        r"filme asemănătoare cu\s+(.+?)(?:,|\.|\?|$)",
        r"ceva asemanator cu\s+(.+?)(?:,|\.|\?|$)",
        r"ceva asemănător cu\s+(.+?)(?:,|\.|\?|$)",
        r"filme similare cu\s+(.+?)(?:,|\.|\?|$)",
        r"filme ca\s+(.+?)(?:,|\.|\?|$)",

        r"recomanda-mi ceva ca\s+(.+?)(?:,|\.|\?|$)",
        r"recomandă-mi ceva ca\s+(.+?)(?:,|\.|\?|$)",
        r"recomanda-mi filme ca\s+(.+?)(?:,|\.|\?|$)",
        r"recomandă-mi filme ca\s+(.+?)(?:,|\.|\?|$)",

        r"daca mi-a placut\s+(.+?)(?:,|\.|\?|$)",
        r"daca mi a placut\s+(.+?)(?:,|\.|\?|$)",
        r"dacă mi-a plăcut\s+(.+?)(?:,|\.|\?|$)",
        r"dacă mi a plăcut\s+(.+?)(?:,|\.|\?|$)",
    ]

    for pattern in patterns:
        match = re.search(pattern, msg, re.IGNORECASE)

        if match:
            title = match.group(1).strip()

            title = re.sub(
                r"\b(recomanda-mi|recomandă-mi|recomanda|recomandă|ceva|filme|film|similar|similare|asemanator|asemănător|cu|ca)\b",
                "",
                title,
                flags=re.IGNORECASE
            )

            title = title.strip(" .,!?:;\"'")

            if title:
                return title

    return None


def answer_similar_movie_request(message):
    movie_title = extract_similar_movie_title(message)

    if not movie_title:
        return None

    source_title, recs = recommend_similar_movies_by_title(movie_title, k=10)

    if source_title is None:
        return {
            "reply": f'Nu am gasit filmul "{movie_title}" in dataset. Incearca sa scrii titlul mai exact, de exemplu "Toy Story", "Matrix" sau "Forrest Gump".',
            "genres": [],
            "year_start": None,
            "year_end": None,
            "sort_by": "similarity",
            "recommendations": []
        }

    return {
        "reply": f'Ti-am gasit filme asemanatoare cu "{source_title}", pe baza genurilor comune, a ratingului mediu si a anului de aparitie.',
        "genres": [],
        "year_start": None,
        "year_end": None,
        "sort_by": "similarity",
        "recommendations": movie_records(recs)
    }
    
def seen_movie_records(df):
    records = []

    for _, row in df.iterrows():
        records.append({
            "movieId": int(row["movieId"]),
            "title": row["title"],
            "genres": row["genres"],
            "runtime": clean_runtime(row["runtime"]) if "runtime" in row else None,
            "rating": float(row["rating"]),
            "timestamp": int(row["timestamp"])
        })

    return records

def build_ratings_with_registered_users():
    import pandas as pd

    all_ratings = ratings.copy()
    registered_users = get_registered_users()

    extra_rows = []

    for user in registered_users:
        knn_user_id = user.get("knn_user_id")
        favorite_movie_ids = user.get("favorite_movie_ids", [])

        if not knn_user_id:
            continue
         
        if len(favorite_movie_ids) != 5:
            continue



        for movie_id in favorite_movie_ids:
            extra_rows.append({
                "userId": int(knn_user_id),
                "movieId": int(movie_id),
                "rating": 5.0,
                "timestamp": 0
            })

    if extra_rows:
        extra_ratings = pd.DataFrame(extra_rows)
        all_ratings = pd.concat([all_ratings, extra_ratings], ignore_index=True)

    return all_ratings

# -------------------------
# AUTH ENDPOINTS
# -------------------------

@app.post("/auth/register")
def register(request: RegisterRequest):
    try:
        user = create_user(
            username=request.username,
            email=request.email,
            password=request.password
        )

        return {
            "message": "Cont creat cu succes.",
            "user": {
                "id": user["id"],
                "knn_user_id": user["knn_user_id"],
                "username": user["username"],
                "email": user["email"],
                "onboarding_completed": user["onboarding_completed"]
            }
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

@app.post("/auth/login")
def login(request: LoginRequest):
    user = authenticate_user(
        email=request.email,
        password=request.password
    )

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Email sau parola gresita."
        )

    token = create_access_token(
        data={
            "sub": user["email"],
            "user_id": user["id"]
        }
    )

    onboarding_completed = user.get("onboarding_completed", False)

    return {
        "access_token": token,
        "token_type": "bearer",
        "needs_onboarding": not onboarding_completed,
        "user": {
            "id": user["id"],
            "knn_user_id": user.get("knn_user_id"),
            "username": user["username"],
            "email": user["email"],
            "onboarding_completed": onboarding_completed
        }
    }

@app.get("/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    onboarding_completed = current_user.get("onboarding_completed", False)

    return {
        "id": current_user["id"],
        "knn_user_id": current_user.get("knn_user_id"),
        "username": current_user["username"],
        "email": current_user["email"],
        "onboarding_completed": onboarding_completed,
        "needs_onboarding": not onboarding_completed
    }

@app.post("/auth/onboarding")
def complete_onboarding(
    request: OnboardingRequest,
    current_user: dict = Depends(get_current_user)
):
    try:
        user = save_user_favorite_movies(
            email=current_user["email"],
            favorite_movie_ids=request.favorite_movie_ids
        )

        return {
            "message": "Preferintele au fost salvate.",
            "user": {
                "id": user["id"],
                "knn_user_id": user.get("knn_user_id"),
                "username": user["username"],
                "email": user["email"],
                "onboarding_completed": user.get("onboarding_completed", False)
            }
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

# -------------------------
# BASIC ENDPOINTS
# -------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/users")
def list_users(limit: int = 50):
    movielens_user_ids = sorted(ratings["userId"].unique().tolist())

    users_list = [
        {
            "userId": int(user_id),
            "label": f"MovieLens User {int(user_id)}",
            "type": "movielens"
        }
        for user_id in movielens_user_ids[:limit]
    ]

    registered_users = get_registered_users()
    
    for user in registered_users:
        favorite_movie_ids = user.get("favorite_movie_ids", [])

    for user in registered_users:
        if user.get("knn_user_id"):
            users_list.insert(0, {
                "userId": int(user["knn_user_id"]),
                "label": f'{user["username"]} (cont logat)',
                "type": "registered"
            })

    return {
        "count": len(users_list),
        "limit": limit,
        "users": users_list
    }


@app.get("/genres")
def list_genres():
    all_genres = set()

    for genres_str in movies["genres"].dropna():
        for genre in genres_str.split("|"):
            if genre and genre != "(no genres listed)":
                all_genres.add(genre)

    return {
        "genres": sorted(all_genres)
    }



@app.get("/auth/onboarding-movies")
def onboarding_movies():
    rec_ids = pop_model.recommend(k=100)

    recs = movies[movies["movieId"].isin(rec_ids)].copy()

    recs["rank"] = recs["movieId"].apply(
        lambda x: rec_ids.index(x)
    )

    recs = recs.merge(
        pop_model.ranking[["movieId", "mean_rating"]],
        on="movieId",
        how="left"
    )

    recs = recs.sort_values("rank")

    return {
        "count": int(recs.shape[0]),
        "movies": movie_records(recs)
    }
# -------------------------
# RECOMMENDERS
# -------------------------

@app.get("/recommend/popularity")
def recommend_popularity(
    k: int = 10,
    sort_by: str = "popularity",
    rating_min: float | None = None,
    rating_max: float | None = None,
    year_start: int | None = None,
    year_end: int | None = None,
    runtime_min: int | None = None,
    runtime_max: int | None = None,
    current_user: dict | None = Depends(get_optional_user)
):
    rec_ids = pop_model.recommend(k=500)

    recs = movies[movies["movieId"].isin(rec_ids)].copy()

    recs["rank"] = recs["movieId"].apply(
        lambda x: rec_ids.index(x)
    )

    recs = recs.merge(
        pop_model.ranking[["movieId", "mean_rating"]],
        on="movieId",
        how="left"
    )

    recs["year"] = recs["title"].apply(extract_year)

    recs = filter_by_rating(recs, rating_min, rating_max)
    recs = filter_by_year(recs, year_start, year_end)
    recs = filter_by_runtime(recs, runtime_min, runtime_max)

    recs = apply_sorting(recs, sort_by)
    recs = recs.head(k)

    return {
        "algorithm": "popularity",
        "k": k,
        "sort_by": sort_by,
        "rating_min": rating_min,
        "rating_max": rating_max,
        "year_start": year_start,
        "year_end": year_end,
        "runtime_min": runtime_min,
        "runtime_max": runtime_max,
        "recommendations": movie_records(recs)
    }

@app.get("/recommend/popularity-by-genres")
def recommend_popularity_by_genres(
    genres: list[str] = Query(...),
    k: int = 10,
    sort_by: str = "popularity",
    rating_min: float | None = None,
    rating_max: float | None = None,
    year_start: int | None = None,
    year_end: int | None = None,
    runtime_min: int | None = None,
    runtime_max: int | None = None,
    current_user: dict | None = Depends(get_optional_user)
):
    recs = build_movies_with_stats()

    recs = filter_by_genres(recs, genres)
    recs = recs.dropna(subset=["mean_rating"])

    recs = filter_by_rating(recs, rating_min, rating_max)
    recs = filter_by_year(recs, year_start, year_end)
    recs = filter_by_runtime(recs, runtime_min, runtime_max)

    recs = apply_sorting(recs, sort_by)
    recs = recs.head(k)

    return {
        "algorithm": "popularity-by-genres",
        "genres": genres,
        "k": k,
        "sort_by": sort_by,
        "rating_min": rating_min,
        "rating_max": rating_max,
        "year_start": year_start,
        "year_end": year_end,
        "runtime_min": runtime_min,
        "runtime_max": runtime_max,
        "recommendations": movie_records(recs)
    }

@app.get("/recommend/user-knn")
def recommend_user_knn(
    userId: int,
    k: int = 10,
    sort_by: str = "popularity",
    rating_min: float | None = None,
    rating_max: float | None = None,
    year_start: int | None = None,
    year_end: int | None = None,
    runtime_min: int | None = None,
    runtime_max: int | None = None,
    current_user: dict = Depends(get_current_user)
):
    ratings_with_registered_users = build_ratings_with_registered_users()

    user_knn_model.fit(ratings_with_registered_users)

    rec_ids = user_knn_model.recommend(
        userId,
        ratings_with_registered_users,
        k=500
    )

    recs = movies[movies["movieId"].isin(rec_ids)].copy()

    recs["rank"] = recs["movieId"].apply(
        lambda x: rec_ids.index(x)
    )

    recs = recs.merge(
        pop_model.ranking[["movieId", "mean_rating"]],
        on="movieId",
        how="left"
    )

    recs["year"] = recs["title"].apply(extract_year)

    recs = filter_by_rating(recs, rating_min, rating_max)
    recs = filter_by_year(recs, year_start, year_end)
    recs = filter_by_runtime(recs, runtime_min, runtime_max)

    recs = apply_sorting(recs, sort_by)
    recs = recs.head(k)

    return {
        "algorithm": "user-knn",
        "userId": userId,
        "k": k,
        "sort_by": sort_by,
        "rating_min": rating_min,
        "rating_max": rating_max,
        "year_start": year_start,
        "year_end": year_end,
        "runtime_min": runtime_min,
        "runtime_max": runtime_max,
        "recommendations": movie_records(recs)
    }

@app.get("/users/{userId}/seen")
def user_seen_movies(
    userId: int,
    limit: int = 50,
    minRating: float = 0.0,
    current_user: dict = Depends(get_current_user)
):
    ur = ratings[ratings["userId"] == userId]

    if minRating > 0:
        ur = ur[ur["rating"] >= minRating]

    seen = ur.merge(movies, on="movieId", how="left")

    seen = seen.sort_values(
        ["rating", "timestamp"],
        ascending=[False, False]
    )

    seen = seen.head(limit)

    return {
        "userId": userId,
        "count": int(ratings[ratings["userId"] == userId].shape[0]),
        "limit": limit,
        "minRating": minRating,
        "seen": seen_movie_records(seen)
    }

@app.get("/recommend/filter-only")
def recommend_filter_only(
    k: int = 10,
    genres: list[str] = Query(default=[]),
    sort_by: str = "popularity",
    rating_min: float | None = None,
    rating_max: float | None = None,
    year_start: int | None = None,
    year_end: int | None = None,
    runtime_min: int | None = None,
    runtime_max: int | None = None,
    current_user: dict | None = Depends(get_optional_user)
):
    recs = build_movies_with_stats()

    recs = recs.dropna(subset=["mean_rating"])

    recs = filter_by_genres(recs, genres)
    recs = filter_by_rating(recs, rating_min, rating_max)
    recs = filter_by_year(recs, year_start, year_end)
    recs = filter_by_runtime(recs, runtime_min, runtime_max)

    if recs.empty:
        return {
            "algorithm": "filter-only",
            "k": k,
            "genres": genres,
            "sort_by": sort_by,
            "rating_min": rating_min,
            "rating_max": rating_max,
            "year_start": year_start,
            "year_end": year_end,
            "runtime_min": runtime_min,
            "runtime_max": runtime_max,
            "recommendations": []
        }

    recs = apply_sorting(recs, sort_by)
    recs = recs.head(k)

    return {
        "algorithm": "filter-only",
        "k": k,
        "genres": genres,
        "sort_by": sort_by,
        "rating_min": rating_min,
        "rating_max": rating_max,
        "year_start": year_start,
        "year_end": year_end,
        "runtime_min": runtime_min,
        "runtime_max": runtime_max,
        "recommendations": movie_records(recs)
    }

@app.get("/recommend/similar-movie")
def recommend_similar_movie(
    movie_title: str,
    k: int = 10,
    current_user: dict | None = Depends(get_optional_user)
):
    source_title, recs = recommend_similar_movies_by_title(movie_title, k)

    if source_title is None:
        return {
            "algorithm": "similar-movie",
            "source_movie": movie_title,
            "k": k,
            "recommendations": [],
            "message": "Filmul nu a fost găsit în dataset."
        }

    return {
        "algorithm": "similar-movie",
        "source_movie": source_title,
        "k": k,
        "message": f"Filme asemănătoare cu {source_title}",
        "recommendations": movie_records(recs)
    }

# -------------------------
# AI CHAT
# -------------------------

@app.post("/chat-ai")
def chat_ai(req: ChatRequest,current_user: dict | None = Depends(get_optional_user)):
    final_count = 10

   
    current_list = []

    for m in req.current_recommendations:
        item = m.model_dump()
        item["year"] = extract_year(item["title"])
        current_list.append(item)

    if is_current_list_question(req.message):
        direct_answer = answer_from_current_list(req.message, current_list)

        if direct_answer is not None:
            return direct_answer

    # -------------------------
    # ÎNTREBĂRI DESPRE DATASET
    # -------------------------

    dataset_answer = answer_from_dataset_question(req.message)

    if dataset_answer is not None:
        return dataset_answer
    
    similar_answer = answer_similar_movie_request(req.message)

    if similar_answer is not None:
        return similar_answer

    # -------------------------
    # AI DOAR PENTRU INTERPRETAREA CERERII
    # -------------------------

    prompt = f"""
Ești un asistent AI pentru recomandări de filme.

Utilizatorul spune:
{req.message}

Trebuie să extragi intenția utilizatorului.

Reguli:
- Nu inventa filme.
- Nu răspunde cu explicații.
- Returnează doar JSON valid.
- Dacă utilizatorul cere "filme de dragoste", genul corect este "Romance".
- Dacă utilizatorul cere "filme romantice", genul corect este "Romance".
- Dacă utilizatorul cere "filme SF", genul corect este "Sci-Fi".
- Dacă utilizatorul cere "filme pentru copii", genul corect este "Children".
- Dacă utilizatorul cere "filme de comedie", genul corect este "Comedy".
- Dacă utilizatorul cere "după 2000", year_start = 2000.
- Dacă utilizatorul cere "din anii 2000", year_start = 2000 și year_end = 2009.
- Dacă utilizatorul cere "înainte de 2000", year_end = 1999.
- Dacă utilizatorul cere cele mai noi sau recente filme, sort_by = "year_desc".
- Dacă utilizatorul cere cele mai vechi filme, sort_by = "year_asc".
- Dacă utilizatorul cere cele mai bune sau cele mai apreciate filme, sort_by = "rating_desc".
- Dacă utilizatorul cere filme cu rating mic, sort_by = "rating_asc".
- Dacă utilizatorul cere alfabetic A-Z, sort_by = "title_asc".
- Dacă utilizatorul cere alfabetic Z-A, sort_by = "title_desc".
- Dacă utilizatorul cere filme cele mai scurte sau durată crescătoare, sort_by = "runtime_asc".
- Dacă utilizatorul cere filme cele mai lungi sau durată descrescătoare, sort_by = "runtime_desc".
- Dacă nu cere o sortare clară, sort_by = "popularity".

Genuri valide MovieLens:
Action, Adventure, Animation, Children, Comedy, Crime, Documentary, Drama,
Fantasy, Film-Noir, Horror, IMAX, Musical, Mystery, Romance, Sci-Fi,
Thriller, War, Western.

Returnează DOAR JSON în formatul:
{{
  "reply": "text scurt în română",
  "genres": [],
  "year_start": null,
  "year_end": null,
  "sort_by": "popularity"
}}
"""

    try:
        response = client.responses.create(
            model="gpt-4.1-mini",
            input=prompt,
        )

        parsed = json.loads(response.output_text)

        parsed_genres = parsed.get("genres", [])
        year_start = parsed.get("year_start")
        year_end = parsed.get("year_end")
        sort_by = parsed.get("sort_by", "popularity")
        reply = parsed.get("reply", "Am găsit câteva filme pentru tine 👍")

    except Exception:
        parsed_genres = detect_genres_from_message(req.message)
        year_start, year_end = infer_year_filters(req.message)
        sort_by = infer_sort_by(req.message)
        reply = "Am interpretat cererea și ți-am pregătit recomandări pe baza datelor disponibile 👍"

    # -------------------------
    # SELECTARE FINALĂ DIN DATASET
    # -------------------------

    recs = build_movies_with_stats()
    recs = recs.dropna(subset=["mean_rating"])

    recs = filter_by_genres(recs, parsed_genres)
    recs = filter_by_year(recs, year_start, year_end)

    if recs.empty:
        return {
            "reply": "Nu am găsit filme care să respecte cerința ta.",
            "genres": parsed_genres,
            "year_start": year_start,
            "year_end": year_end,
            "sort_by": sort_by,
            "recommendations": []
        }

    recs = apply_sorting(recs, sort_by)
    selected = recs.head(final_count)

    return {
        "reply": reply,
        "genres": parsed_genres,
        "year_start": year_start,
        "year_end": year_end,
        "sort_by": sort_by,
        "recommendations": movie_records(selected)
    }