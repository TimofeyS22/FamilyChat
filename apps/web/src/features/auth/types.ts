export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: "bearer";
};

export type RegisterRequest = {
  displayName: string;
  username: string;
  password: string;
  inviteCode: string;
};

export type RegisterResponse = {
  success: true;
  userId: string;
  matrixUserId: string;
  familyCode: string;
};

export type AuthRole = "admin" | "member" | "unknown";

export type StoredSession = {
  accessToken: string;
  role: AuthRole;
};
