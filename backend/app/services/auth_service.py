from datetime import datetime, timedelta, timezone
import jwt
from jwt.exceptions import InvalidTokenError

import os
import hashlib
import hmac
import base64


SECRET_KEY = "cheie_secreta_pentru_licenta_schimb-o"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120


def hash_password(password: str) -> str:
    salt = os.urandom(16)

    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        100000
    )

    salt_b64 = base64.b64encode(salt).decode("utf-8")
    hash_b64 = base64.b64encode(password_hash).decode("utf-8")

    return f"{salt_b64}${hash_b64}"


def verify_password(plain_password: str, stored_password: str) -> bool:
    try:
        salt_b64, hash_b64 = stored_password.split("$")

        salt = base64.b64decode(salt_b64)
        stored_hash = base64.b64decode(hash_b64)

        new_hash = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt,
            100000
        )

        return hmac.compare_digest(new_hash, stored_hash)

    except Exception:
        return False


def create_access_token(data: dict) -> str:
    to_encode = data.copy()

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    to_encode.update({"exp": expire})

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )
    except InvalidTokenError:
        return None