from urllib.parse import quote

import httpx

from app.core.config import Settings
from app.core.errors import MatrixAdminError


class SynapseAdminClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.matrix_homeserver_url.rstrip("/")
        self._admin_token = settings.matrix_admin_access_token
        self._timeout = httpx.Timeout(10.0)

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._admin_token}"}

    def user_exists(self, matrix_user_id: str) -> bool:
        encoded_user_id = quote(matrix_user_id, safe="")
        url = f"{self._base_url}/_synapse/admin/v2/users/{encoded_user_id}"
        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.get(url, headers=self._headers())
            if response.status_code == 404:
                return False
            response.raise_for_status()
            return True
        except httpx.HTTPError as exc:
            raise MatrixAdminError("Matrix user existence check failed") from exc

    def create_user(self, matrix_user_id: str, password: str, display_name: str) -> None:
        encoded_user_id = quote(matrix_user_id, safe="")
        url = f"{self._base_url}/_synapse/admin/v2/users/{encoded_user_id}"
        payload = {
            "password": password,
            "displayname": display_name,
            "admin": False,
            "deactivated": False,
        }
        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.put(url, headers=self._headers(), json=payload)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise MatrixAdminError("Matrix user creation failed") from exc

    def update_user_display_name(self, matrix_user_id: str, display_name: str) -> None:
        encoded_user_id = quote(matrix_user_id, safe="")
        url = f"{self._base_url}/_synapse/admin/v2/users/{encoded_user_id}"
        payload = {"displayname": display_name}
        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.put(url, headers=self._headers(), json=payload)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise MatrixAdminError("Matrix user display name update failed") from exc

    def create_private_room(self, name: str, *, encrypted: bool = False) -> str:
        url = f"{self._base_url}/_matrix/client/v3/createRoom"
        payload = {
            "name": name,
            "preset": "private_chat",
            "visibility": "private",
        }
        if encrypted:
            payload["initial_state"] = [
                {
                    "type": "m.room.encryption",
                    "state_key": "",
                    "content": {"algorithm": "m.megolm.v1.aes-sha2"},
                }
            ]
        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(url, headers=self._headers(), json=payload)
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise MatrixAdminError("Matrix room creation failed") from exc

        room_id = body.get("room_id")
        if not isinstance(room_id, str) or not room_id:
            raise MatrixAdminError("Matrix room creation returned no room id")
        return room_id

    def room_members(self, matrix_room_id: str) -> set[str]:
        encoded_room_id = quote(matrix_room_id, safe="")
        url = f"{self._base_url}/_synapse/admin/v1/rooms/{encoded_room_id}/members"
        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.get(url, headers=self._headers())
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise MatrixAdminError("Matrix room members lookup failed") from exc

        members = body.get("members")
        if not isinstance(members, list):
            raise MatrixAdminError("Matrix room members lookup returned invalid data")
        return {member for member in members if isinstance(member, str)}

    def join_user_to_room(self, matrix_room_id: str, matrix_user_id: str) -> None:
        encoded_room_id = quote(matrix_room_id, safe="")
        url = f"{self._base_url}/_synapse/admin/v1/join/{encoded_room_id}"
        payload = {"user_id": matrix_user_id}
        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(url, headers=self._headers(), json=payload)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise MatrixAdminError("Matrix room join failed") from exc

    def deactivate_user(self, matrix_user_id: str) -> None:
        encoded_user_id = quote(matrix_user_id, safe="")
        url = f"{self._base_url}/_synapse/admin/v2/users/{encoded_user_id}"
        payload = {"deactivated": True}
        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.put(url, headers=self._headers(), json=payload)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise MatrixAdminError("Matrix user deactivation failed") from exc
