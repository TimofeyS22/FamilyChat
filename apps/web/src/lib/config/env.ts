export const familyApiBaseUrl =
  process.env.NEXT_PUBLIC_FAMILY_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const matrixBaseUrl =
  process.env.NEXT_PUBLIC_MATRIX_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8080";
