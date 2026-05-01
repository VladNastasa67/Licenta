import pandas as pd
import requests
import time

TMDB_API_KEY = "cb25610d572dc4f3d7712957270f78c5"

movies = pd.read_csv("data/ml-latest-small/movies.csv")
links = pd.read_csv("data/ml-latest-small/links.csv")

movies_links = movies.merge(links, on="movieId", how="left")

runtimes = []

for index, row in movies_links.iterrows():
    movie_id = row["movieId"]
    tmdb_id = row["tmdbId"]

    if pd.isna(tmdb_id):
        runtimes.append({
            "movieId": movie_id,
            "runtime": None
        })
        continue

    tmdb_id = int(tmdb_id)

    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
    params = {
        "api_key": TMDB_API_KEY,
        "language": "en-US"
    }

    try:
        response = requests.get(url, params=params)

        if response.status_code == 200:
            data = response.json()
            runtime = data.get("runtime")

            runtimes.append({
                "movieId": movie_id,
                "runtime": runtime
            })

            print(f"{row['title']} -> {runtime} min")
        else:
            runtimes.append({
                "movieId": movie_id,
                "runtime": None
            })

            print(f"Eroare pentru {row['title']}: {response.status_code}")

    except Exception as e:
        runtimes.append({
            "movieId": movie_id,
            "runtime": None
        })

        print(f"Eroare la {row['title']}: {e}")

    time.sleep(0.25)

runtime_df = pd.DataFrame(runtimes)

movies_with_runtime = movies.merge(runtime_df, on="movieId", how="left")

movies_with_runtime.to_csv("data/ml-latest-small/movies_with_runtime.csv", index=False)

print("Gata. Am salvat movies_with_runtime.csv")