from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.services.data_service import load_data
from backend.app.services.popularity import PopularityRecommender
from backend.app.services.user_knn import UserKNNRecommender


app = FastAPI(title="Movie Recommender API")



app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ratings, movies = load_data()

pop_model = PopularityRecommender()
pop_model.fit(ratings)

user_knn_model = UserKNNRecommender()
user_knn_model.fit(ratings)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/users")
def list_users(limit: int = 50):
    user_ids = sorted(ratings["userId"].unique().tolist())
    return {
        "count": len(user_ids),
        "limit": limit,
        "users": user_ids[:limit]
    }


@app.get("/recommend/popularity")
def recommend_popularity(k: int = 10):
    rec_ids = pop_model.recommend(k=k)
    recs = movies[movies["movieId"].isin(rec_ids)].copy()

    # păstrăm ordinea recomandărilor
    recs["rank"] = recs["movieId"].apply(lambda x: rec_ids.index(x))
    recs = recs.sort_values("rank")

    return {
        "algorithm": "popularity",
        "k": k,
        "recommendations": recs[["movieId", "title", "genres"]].to_dict(orient="records")
    }

@app.get("/recommend/user-knn")
def recommend_user_knn(userId: int, k: int = 10):
    rec_ids = user_knn_model.recommend(userId, ratings, k=k)

    recs = movies[movies["movieId"].isin(rec_ids)].copy()
    recs["rank"] = recs["movieId"].apply(lambda x: rec_ids.index(x))
    recs = recs.sort_values("rank")

    return {
        "algorithm": "user-knn",
        "userId": userId,
        "k": k,
        "recommendations": recs[["movieId", "title", "genres"]].to_dict(orient="records")
    }

@app.get("/users/{userId}/seen")
def user_seen_movies(userId: int, limit: int = 50, minRating: float = 0.0):
    # selectăm ratingurile userului
    ur = ratings[ratings["userId"] == userId]

    # filtrare opțională (ex: doar filme evaluate cu >= 3.5)
    if minRating > 0:
        ur = ur[ur["rating"] >= minRating]

    # join cu movies ca să avem titlu + genuri
    seen = ur.merge(movies, on="movieId", how="left")

    # sortăm: cele mai bine evaluate primele, apoi cele mai recente (timestamp)
    seen = seen.sort_values(["rating", "timestamp"], ascending=[False, False])

    # limit
    seen = seen.head(limit)

    return {
        "userId": userId,
        "count": int(ratings[ratings["userId"] == userId].shape[0]),
        "limit": limit,
        "minRating": minRating,
        "seen": seen[["movieId", "title", "genres", "rating", "timestamp"]].to_dict(orient="records"),
    }


