"""Psycopg connection helper. Reads DATABASE_URL from env, matching the
shared contract postgresql://eq:eq@db:5432/earthquake (see docker-compose.yml,
service `db` reachable by name on the eqnet bridge network).
"""
import os

import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://eq:eq@db:5432/earthquake")


def get_connection() -> psycopg.Connection:
    """Open a new psycopg connection. Use as a context manager so it closes:
    `with get_connection() as conn: ...`
    """
    return psycopg.connect(DATABASE_URL)


def is_reachable() -> bool:
    """Quick reachability check for /health. Never raises."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False
