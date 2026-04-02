import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[3]
DATA_PATH = BASE_DIR / "data" / "ml-latest-small"

def load_data():
    ratings = pd.read_csv(DATA_PATH / "ratings.csv")
    movies = pd.read_csv(DATA_PATH / "movies.csv")
    return ratings, movies
