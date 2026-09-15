"""
POLARIS Phase 10A — Copernicus Data Space OAuth2 Authentication Service.

Handles token acquisition, caching, and renewal for the Copernicus Data Space
identity service. Credentials are read exclusively from environment variables.

Security rules enforced here:
  - Client secret is NEVER logged, returned in API responses, or stored in state.
  - Access tokens are NEVER returned to the frontend.
  - All credential errors return generic status strings, not the secret itself.
"""

import os
import time
import logging
import threading
from typing import Optional
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    requests = None  # type: ignore

logger = logging.getLogger("polaris.sentinel1.auth")

# Copernicus Data Space token endpoint
COPERNICUS_TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
)

# Default token lifetime buffer: refresh 60 seconds before expiry
TOKEN_REFRESH_BUFFER_SECONDS = 60

# Request timeout
AUTH_TIMEOUT_SECONDS = 15


class CopernicusTokenError(Exception):
    """Raised when token acquisition fails."""
    pass


class CopernicusCredentialsMissingError(CopernicusTokenError):
    """Raised when COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET is not set."""
    pass


class _TokenCache:
    """Thread-safe token cache with expiry tracking."""

    def __init__(self):
        self._lock = threading.Lock()
        self._access_token: Optional[str] = None
        self._expires_at: float = 0.0  # Unix timestamp

    def get(self) -> Optional[str]:
        with self._lock:
            if self._access_token and time.monotonic() < self._expires_at:
                return self._access_token
            return None

    def set(self, token: str, expires_in_seconds: int) -> None:
        with self._lock:
            self._access_token = token
            self._expires_at = time.monotonic() + expires_in_seconds - TOKEN_REFRESH_BUFFER_SECONDS
            logger.debug(
                "[CopernicusAuth] Token cached. Expires in %.0f seconds (with %d s buffer).",
                expires_in_seconds, TOKEN_REFRESH_BUFFER_SECONDS
            )

    def invalidate(self) -> None:
        with self._lock:
            self._access_token = None
            self._expires_at = 0.0


_cache = _TokenCache()


def _get_credentials() -> tuple[str, str]:
    """
    Reads credentials from environment variables only.
    Raises CopernicusCredentialsMissingError if either is absent.
    Never logs credential values.
    """
    client_id = os.environ.get("COPERNICUS_CLIENT_ID", "").strip()
    client_secret = os.environ.get("COPERNICUS_CLIENT_SECRET", "").strip()

    if not client_id:
        raise CopernicusCredentialsMissingError(
            "COPERNICUS_CLIENT_ID environment variable is not set."
        )
    if not client_secret:
        raise CopernicusCredentialsMissingError(
            "COPERNICUS_CLIENT_SECRET environment variable is not set."
        )
    return client_id, client_secret


def _fetch_new_token(client_id: str, client_secret: str) -> str:
    """
    Acquires a fresh OAuth2 client-credentials token from Copernicus.
    Raises CopernicusTokenError on any failure.
    Token value is cached but never logged at INFO or higher.

    Uses requests.Session so HTTP_PROXY / HTTPS_PROXY environment variables
    are automatically honoured for corporate proxy environments.
    """
    if requests is None:
        raise CopernicusTokenError(
            "The 'requests' library is not installed. "
            "Add 'requests' to backend/requirements.txt."
        )

    logger.info(
        "[CopernicusAuth] Requesting token from %s", COPERNICUS_TOKEN_URL
    )

    # Use a Session so HTTP_PROXY / HTTPS_PROXY env vars are respected
    session = requests.Session()

    try:
        import base64 as _base64
        # Send credentials both ways for maximum server compatibility:
        #   - Authorization: Basic header  (client_secret_basic method)
        #   - form body                    (client_secret_post method)
        credentials = _base64.b64encode(
            f"{client_id}:{client_secret}".encode()
        ).decode()

        response = session.post(
            COPERNICUS_TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=AUTH_TIMEOUT_SECONDS,
        )
    except requests.exceptions.Timeout:
        raise CopernicusTokenError(
            "Copernicus identity service timed out after "
            f"{AUTH_TIMEOUT_SECONDS} seconds. "
            "Check network connectivity or set HTTP_PROXY / HTTPS_PROXY if behind a proxy."
        )
    except requests.exceptions.ConnectionError as exc:
        raise CopernicusTokenError(
            f"Could not connect to Copernicus identity service: {exc}. "
            "Verify internet connectivity. If behind a proxy, set HTTP_PROXY / HTTPS_PROXY."
        )
    finally:
        session.close()

    if response.status_code != 200:
        # Log status code only — never log response body (may contain token hints)
        logger.warning(
            "[CopernicusAuth] Token request failed. HTTP %d.", response.status_code
        )
        try:
            error_body = response.json()
            error_msg = error_body.get("error_description", error_body.get("error", "Unknown"))
        except Exception:
            error_msg = "Malformed response from identity service."
        raise CopernicusTokenError(
            f"Copernicus authentication failed (HTTP {response.status_code}): {error_msg}"
        )

    try:
        payload = response.json()
    except Exception:
        raise CopernicusTokenError(
            "Copernicus identity service returned a malformed (non-JSON) response."
        )

    token = payload.get("access_token")
    expires_in = payload.get("expires_in", 600)

    if not token:
        raise CopernicusTokenError(
            "Copernicus identity response did not contain an access_token field."
        )

    if not isinstance(expires_in, (int, float)) or expires_in <= 0:
        expires_in = 600  # Fallback: 10 minutes

    _cache.set(token, int(expires_in))
    logger.info(
        "[CopernicusAuth] Token acquired successfully. Expires in %d seconds.", expires_in
    )
    return token  # Never logged at INFO/DEBUG level — only returned internally


def get_access_token() -> str:
    """
    Returns a valid Copernicus access token, using the cache if available.

    Raises:
        CopernicusCredentialsMissingError — if env vars not set
        CopernicusTokenError              — if auth fails for any other reason

    SECURITY: The returned token is backend-only. It must never be included
    in API responses or forwarded to the frontend.
    """
    cached = _cache.get()
    if cached:
        logger.debug("[CopernicusAuth] Returning cached token.")
        return cached

    logger.info("[CopernicusAuth] Cache miss — acquiring new token from Copernicus.")
    client_id, client_secret = _get_credentials()
    return _fetch_new_token(client_id, client_secret)


def invalidate_token() -> None:
    """Forces the next get_access_token() call to acquire a fresh token."""
    _cache.invalidate()
    logger.info("[CopernicusAuth] Token cache invalidated.")


def credentials_are_configured() -> bool:
    """Returns True if both credential env vars are present (does not validate them)."""
    client_id = os.environ.get("COPERNICUS_CLIENT_ID", "").strip()
    client_secret = os.environ.get("COPERNICUS_CLIENT_SECRET", "").strip()
    return bool(client_id and client_secret)
