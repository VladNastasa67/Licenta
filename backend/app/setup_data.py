import zipfile
import urllib.request
from pathlib import Path

URL = "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip"

def main():
    base = Path.cwd()  # folderul din care rulezi comanda
    data_dir = base / "data"
    data_dir.mkdir(exist_ok=True)

    zip_path = data_dir / "ml-latest-small.zip"
    extract_path = data_dir / "ml-latest-small"

    print("RUNNING FROM:", base)
    print("WRITING TO:", data_dir)

    if (extract_path / "ratings.csv").exists():
        print("Dataset există deja:", extract_path)
        print("Files:", [p.name for p in extract_path.iterdir()])
        return

    print("Downloading...")
    urllib.request.urlretrieve(URL, zip_path)
    print("Downloaded:", zip_path)

    print("Extracting...")
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(data_dir)

    print("Done. Checking extracted folder:", extract_path)
    if extract_path.exists():
        print("Files:", [p.name for p in extract_path.iterdir()])
    else:
        print("ERROR: Folder ml-latest-small nu a fost creat!")

if __name__ == "__main__":
    main()
