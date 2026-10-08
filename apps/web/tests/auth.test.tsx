import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/features/auth/login-form";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { RegisterForm } from "@/features/auth/register-form";
import { useAuthStore } from "@/features/auth/auth-store";
import { matrixSessionStorage } from "@/features/matrix/session-storage";

import { getMatrixSdkMocks, mockRouter } from "./setup";

const matrixSdkMocks = getMatrixSdkMocks();

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    }),
  );
}

function tokenWithRole(role = "member") {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "none" })}.${encode({ role, sub: "user-1" })}.signature`;
}

function resetAuthStore() {
  useAuthStore.setState({
    accessToken: null,
    hydrated: true,
    isAuthenticated: false,
    role: "unknown",
  });
}

describe("auth UI", () => {
  it("renders the login form", () => {
    resetAuthStore();

    render(<LoginForm />);

    expect(screen.getByRole("heading", { name: /добро пожаловать/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/имя пользователя/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^пароль$/i)).toBeInTheDocument();
  });

  it("stores a token and routes after login success without showing the token", async () => {
    resetAuthStore();
    const token = tokenWithRole("member");
    const fetchMock = vi.fn(() => jsonResponse({ accessToken: token, tokenType: "bearer" }));
    const logSpy = vi.spyOn(console, "log");
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText(/имя пользователя/i), "Timofey");
    await user.type(screen.getByLabelText(/^пароль$/i), "secure-password");
    await user.click(screen.getByRole("button", { name: /войти/i }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/chats"));
    expect(window.localStorage.length).toBe(2);
    expect(window.sessionStorage.length).toBe(0);
    expect(matrixSessionStorage.read()).toEqual(
      expect.objectContaining({
        accessToken: "fake-matrix-token",
        userId: "@timofey:familychat.local",
      }),
    );
    expect(screen.queryByText(token)).not.toBeInTheDocument();
    expect(screen.queryByText("fake-matrix-token")).not.toBeInTheDocument();
    expect(screen.queryByText("secure-password")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual({
      password: "secure-password",
      username: "timofey",
    });
    expect(matrixSdkMocks.client.login).toHaveBeenCalledWith(
      "m.login.password",
      expect.objectContaining({
        password: "secure-password",
        user: "timofey",
      }),
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("clears all auth state when Matrix login fails after Family API login", async () => {
    resetAuthStore();
    const token = tokenWithRole("member");
    const fetchMock = vi.fn(() => jsonResponse({ accessToken: token, tokenType: "bearer" }));
    matrixSdkMocks.client.login.mockRejectedValue(new Error("M_FORBIDDEN raw matrix failure"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText(/имя пользователя/i), "timofey");
    await user.type(screen.getByLabelText(/^пароль$/i), "secure-password");
    await user.click(screen.getByRole("button", { name: /войти/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось выполнить запрос. Проверьте данные и попробуйте ещё раз.",
    );
    expect(screen.queryByText(/M_FORBIDDEN/i)).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("shows a generic login error", async () => {
    resetAuthStore();
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ detail: "Invalid credentials" }, 401)));
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText(/имя пользователя/i), "timofey");
    await user.type(screen.getByLabelText(/^пароль$/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /войти/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось выполнить запрос. Проверьте данные и попробуйте ещё раз.",
    );
    expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument();
  });

  it("blocks unauthenticated protected content", async () => {
    resetAuthStore();

    render(
      <ProtectedRoute>
        <div>Private area</div>
      </ProtectedRoute>,
    );

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Private area")).not.toBeInTheDocument();
  });
});

describe("register UI", () => {
  it("validates password confirmation", async () => {
    resetAuthStore();
    const user = userEvent.setup();

    render(<RegisterForm />);
    await user.type(screen.getByLabelText(/^имя$/i), "Timofey");
    await user.type(screen.getByLabelText(/имя пользователя/i), "timofey");
    await user.type(screen.getByLabelText(/^пароль$/i), "secure-password");
    await user.type(screen.getByLabelText(/повторите пароль/i), "different-password");
    await user.type(screen.getByLabelText(/код приглашения/i), "MAMA-8F2K");
    await user.click(screen.getByRole("button", { name: /создать аккаунт/i }));

    expect(await screen.findByText(/пароли не совпадают/i)).toBeInTheDocument();
  });

  it("sends the expected register request shape without logging secrets", async () => {
    resetAuthStore();
    const fetchMock = vi.fn(() =>
      jsonResponse({
        familyCode: "TIM-1024",
        matrixUserId: "@timofey:familychat.local",
        success: true,
        userId: "timofey",
      }),
    );
    const logSpy = vi.spyOn(console, "log");
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<RegisterForm />);
    await user.type(screen.getByLabelText(/^имя$/i), " Timofey ");
    await user.type(screen.getByLabelText(/имя пользователя/i), "Timofey");
    await user.type(screen.getByLabelText(/^пароль$/i), "secure-password");
    await user.type(screen.getByLabelText(/повторите пароль/i), "secure-password");
    await user.type(screen.getByLabelText(/код приглашения/i), "mama-8f2k");
    await user.click(screen.getByRole("button", { name: /создать аккаунт/i }));

    await screen.findByText(/аккаунт создан/i);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/auth/register",
      expect.objectContaining({ method: "POST" }),
    );
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual({
      displayName: "Timofey",
      inviteCode: "MAMA-8F2K",
      password: "secure-password",
      username: "timofey",
    });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("clears Family and Matrix sessions on logout", () => {
    resetAuthStore();
    window.localStorage.setItem("familychat.web.session", tokenWithRole("member"));
    matrixSessionStorage.write({
      accessToken: "fake-matrix-token",
      baseUrl: "http://localhost:8080",
      deviceId: "FAKEDEVICE",
      userId: "@timofey:familychat.local",
    });
    useAuthStore.setState({
      accessToken: "not-rendered-token",
      hydrated: true,
      isAuthenticated: true,
      role: "member",
    });

    useAuthStore.getState().logout();

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("rejects a stored Matrix session for a different base URL", () => {
    window.localStorage.setItem(
      "familychat.web.matrix-session",
      JSON.stringify({
        accessToken: "fake-matrix-token",
        baseUrl: "https://unexpected-matrix.example.invalid",
        deviceId: "FAKEDEVICE",
        userId: "@timofey:familychat.local",
      }),
    );

    expect(matrixSessionStorage.read()).toBeNull();
    expect(window.localStorage.getItem("familychat.web.matrix-session")).toBeNull();
    expect(window.sessionStorage.getItem("familychat.web.matrix-session")).toBeNull();
  });
});
