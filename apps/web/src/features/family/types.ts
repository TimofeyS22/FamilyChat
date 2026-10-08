export type FamilyUser = {
  id: string;
  matrixUserId: string;
  username: string;
  displayName: string;
  familyCode: string;
  avatarUrl: string | null;
};

export type FamilyUsersState = "idle" | "loading" | "ready" | "error";
