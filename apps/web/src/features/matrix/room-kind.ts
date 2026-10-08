import type { MatrixRoomSummary } from "./types";

const commonFamilyRoomNames = new Set(["family chat", "семейный чат"]);

export function isCommonFamilyRoom(room: MatrixRoomSummary) {
  return commonFamilyRoomNames.has(room.name.trim().toLowerCase()) && !room.peerMatrixUserId;
}

export function isPrivateMatrixRoom(room: MatrixRoomSummary) {
  if (isCommonFamilyRoom(room)) {
    return false;
  }
  const memberCount = new Set(room.memberIds.filter(Boolean)).size;
  return room.isDirect || Boolean(room.peerMatrixUserId) || memberCount <= 2;
}
