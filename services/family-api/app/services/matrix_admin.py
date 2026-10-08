import re

from app.core.config import Settings
from app.core.errors import MatrixUserConflictError
from app.integrations.synapse import SynapseAdminClient

MATRIX_LOCALPART_RE = re.compile(r"^[a-z][a-z0-9._=-]{2,31}$")


class MatrixAdminService:
    def __init__(self, client: SynapseAdminClient, settings: Settings) -> None:
        self._client = client
        self._server_name = settings.matrix_server_name
        self._reserved_localparts = settings.reserved_localparts()

    def build_matrix_user_id(self, username: str) -> str:
        if not MATRIX_LOCALPART_RE.fullmatch(username):
            raise ValueError("Invalid Matrix localpart")
        if username in self._reserved_localparts:
            raise MatrixUserConflictError("Matrix localpart is reserved")
        return f"@{username}:{self._server_name}"

    def create_user(self, username: str, display_name: str, password: str) -> str:
        matrix_user_id = self.build_matrix_user_id(username)
        if self._client.user_exists(matrix_user_id):
            raise MatrixUserConflictError("Matrix user already exists")
        self._client.create_user(matrix_user_id, password, display_name)
        return matrix_user_id

    def update_user_display_name(self, matrix_user_id: str, display_name: str) -> None:
        self._client.update_user_display_name(matrix_user_id, display_name)

    def user_exists(self, matrix_user_id: str) -> bool:
        return self._client.user_exists(matrix_user_id)

    def create_private_room(self, name: str, *, encrypted: bool = False) -> str:
        return self._client.create_private_room(name, encrypted=encrypted)

    def room_members(self, matrix_room_id: str) -> set[str]:
        return self._client.room_members(matrix_room_id)

    def join_user_to_room(self, matrix_room_id: str, matrix_user_id: str) -> None:
        self._client.join_user_to_room(matrix_room_id, matrix_user_id)

    def deactivate_user(self, matrix_user_id: str) -> None:
        self._client.deactivate_user(matrix_user_id)
