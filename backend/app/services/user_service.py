import json
import os

from backend.app.services.auth_service import hash_password, verify_password


USERS_FILE = "backend/app/users.json"


def load_users() -> list[dict]:
    if not os.path.exists(USERS_FILE):
        with open(USERS_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=4)

    with open(USERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_users(users: list[dict]) -> None:
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=4)


def get_registered_users() -> list[dict]:
    return load_users()


def find_user_by_email(email: str) -> dict | None:
    users = load_users()

    for user in users:
        if user["email"].lower() == email.lower():
            return user

    return None


def create_user(username: str, email: str, password: str) -> dict:
    users = load_users()

    if find_user_by_email(email):
        raise ValueError("Exista deja un cont cu acest email.")

    new_id = len(users) + 1

    user = {
        "id": new_id,
        "knn_user_id": 100000 + new_id,
        "username": username,
        "email": email,
        "hashed_password": hash_password(password),
        "favorite_movie_ids": [],
        "onboarding_completed": False
    }

    users.append(user)
    save_users(users)

    return user


def authenticate_user(email: str, password: str) -> dict | None:
    user = find_user_by_email(email)

    if user is None:
        return None

    if not verify_password(password, user["hashed_password"]):
        return None

    return user


def save_user_favorite_movies(email: str, favorite_movie_ids: list[int]) -> dict:
    users = load_users()

    if len(favorite_movie_ids) != 5:
        raise ValueError("Trebuie sa selectezi exact 5 filme.")

    for user in users:
        if user["email"].lower() == email.lower():
            user["favorite_movie_ids"] = favorite_movie_ids
            user["onboarding_completed"] = True
            save_users(users)
            return user

    raise ValueError("Utilizatorul nu exista.")