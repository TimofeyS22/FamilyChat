"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { FamilyChatLogo } from "@/components/ui/familychat-logo";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuthStore } from "@/features/auth/auth-store";
import { genericAuthError } from "@/lib/api/errors";

const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9._=-]{2,31}$/, "Введите имя пользователя FamilyChat."),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const login = useAuthStore((state) => state.login);
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { password: "", username: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      router.replace("/chats");
    } catch {
      setFormError(genericAuthError);
    }
  });

  return (
    <Card className="space-y-6 rounded-[2rem] border-white/80 bg-white/88 p-6 shadow-2xl shadow-sky-950/10 backdrop-blur-xl">
      <div className="text-center">
        <FamilyChatLogo />
        <h1 className="mt-2 text-2xl font-bold tracking-normal text-ink-primary">
          Добро пожаловать
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">
          Войдите в аккаунт, созданный для вашей семьи.
        </p>
      </div>

      {formError ? <ErrorState message={formError} /> : null}

      <form className="space-y-4" onSubmit={onSubmit}>
        <Input
          autoComplete="username"
          error={errors.username?.message}
          icon={<UserRound className="h-4 w-4" />}
          label="Имя пользователя"
          placeholder="Ваше имя пользователя"
          {...register("username")}
        />
        <PasswordInput
          autoComplete="current-password"
          error={errors.password?.message}
          label="Пароль"
          {...register("password")}
        />
        <Button className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Входим" : "Войти"}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-secondary">
        Нет аккаунта?{" "}
        <Link className="font-semibold text-accent-teal hover:underline" href="/register">
          Использовать приглашение
        </Link>
      </p>
    </Card>
  );
}
