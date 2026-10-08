export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const genericAuthError = "Не удалось выполнить запрос. Проверьте данные и попробуйте ещё раз.";
