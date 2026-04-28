import math
import pandas as pd


class PopularityRecommender:
    def __init__(self):
        self.ranking = None

    def fit(self, ratings: pd.DataFrame):
        agg = ratings.groupby("movieId").agg(
            mean_rating=("rating", "mean"),
            count_rating=("rating", "count")
        ).reset_index()

        agg["score"] = agg["mean_rating"] * agg["count_rating"].apply(
            lambda x: math.log10(x) if x > 0 else 0
        )

        self.ranking = agg.sort_values("score", ascending=False)

    def recommend(self, seen_movie_ids=None, k=10):
        if seen_movie_ids is None:
            seen_movie_ids = []

        recs = self.ranking[~self.ranking["movieId"].isin(seen_movie_ids)]
        return recs.head(k)["movieId"].tolist()

    def recommend_by_genres(self, movies: pd.DataFrame, genres: list[str], seen_movie_ids=None, k=10):
        if seen_movie_ids is None:
            seen_movie_ids = []

        if not genres:
            return self.recommend(seen_movie_ids=seen_movie_ids, k=k)

        filtered_movies = movies.copy()

        for genre in genres:
            filtered_movies = filtered_movies[
                filtered_movies["genres"].str.contains(genre, case=False, na=False)
            ]

        filtered_movies = filtered_movies[["movieId"]]

        recs = self.ranking.merge(filtered_movies, on="movieId", how="inner")
        recs = recs[~recs["movieId"].isin(seen_movie_ids)]

        return recs.head(k)["movieId"].tolist()