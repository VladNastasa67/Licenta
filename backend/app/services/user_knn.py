import pandas as pd
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity


class UserKNNRecommender:
    def __init__(self):
        self.user_item = None
        self.similarity = None
        self.user_ids = None
        self.movie_ids = None

    def fit(self, ratings: pd.DataFrame):
        # matrice user-item
        self.user_item = ratings.pivot_table(
            index="userId",
            columns="movieId",
            values="rating",
            fill_value=0.0
        )

        self.user_ids = self.user_item.index.to_numpy()
        self.movie_ids = self.user_item.columns.to_numpy()

        # similaritate între useri
        self.similarity = cosine_similarity(self.user_item)

    def recommend(self, user_id: int, ratings: pd.DataFrame, k=10):
        if user_id not in self.user_item.index:
            return []

        # indexul userului
        user_idx = list(self.user_item.index).index(user_id)

        # similarități cu alți useri
        sim_scores = self.similarity[user_idx]

        # scor film = sum(sim(user, alt_user) * rating_alt_user)
        scores = np.dot(sim_scores, self.user_item.values)

        # filme deja văzute
        seen_movies = set(
            ratings[ratings["userId"] == user_id]["movieId"]
        )

        recommendations = []
        for movie_id, score in zip(self.movie_ids, scores):
            if movie_id not in seen_movies:
                recommendations.append((movie_id, score))

        recommendations.sort(key=lambda x: x[1], reverse=True)
        return [movie_id for movie_id, _ in recommendations[:k]]
