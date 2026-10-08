"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { KeyRound, UserRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { FamilyChatLogo } from "@/components/ui/familychat-logo";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Toast } from "@/components/ui/toast";
import { useAuthStore } from "@/features/auth/auth-store";
import { genericAuthError } from "@/lib/api/errors";

const registerSchema = z
  .object({
    displayName: z.string().trim().min(1, "Введите имя.").max(120),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9._=-]{2,31}$/, "Используйте 3-32 строчные латинские буквы, цифры или ._=-."),
    password: z.string().min(8, "Пароль должен быть не короче 8 символов."),
    repeatPassword: z.string().min(8, "Повторите пароль."),
    inviteCode: z.string().trim().min(1, "Введите код приглашения.").max(64),
  })
  .refine((values) => values.password === values.repeatPassword, {
    message: "Пароли не совпадают.",
    path: ["repeatPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const registerAccount = useAuthStore((state) => state.register);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: "",
      inviteCode: "",
      password: "",
      repeatPassword: "",
      username: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setCreated(false);
    try {
      await registerAccount({
        displayName: values.displayName,
        inviteCode: values.inviteCode,
        password: values.password,
        username: values.username,
      });
      reset();
      setCreated(true);
    } catch {
      setFormError(genericAuthError);
    }
  });

  return (
    <Card className="space-y-6 rounded-[2rem] border-white/80 bg-white/88 p-6 shadow-2xl shadow-sky-950/10 backdrop-blur-xl">
      <div className="text-center">
        <FamilyChatLogo />
        <h1 className="mt-2 text-2xl font-bold tracking-normal text-ink-primary">
          Создайте аккаунт
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">
          Используйте приглашение от администратора семьи.
        </p>
      </div>

      {formError ? <ErrorState message={formError} /> : null}
      {created ? (
        <Toast>
          Аккаунт создан. Теперь можно{" "}
          <Link className="font-semibold text-accent-teal hover:underline" href="/login">
            войти
          </Link>
          .
        </Toast>
      ) : null}

      <form className="space-y-4" onSubmit={onSubmit}>
        <Input
          autoComplete="name"
          error={errors.displayName?.message}
          icon={<UserRound className="h-4 w-4" />}
          label="Имя"
          placeholder="Ваше имя"
          {...register("displayName")}
        />
        <Input
          autoComplete="username"
          error={errors.username?.message}
          label="Имя пользователя"
          placeholder="username"
          {...register("username")}
        />
        <PasswordInput
          autoComplete="new-password"
          error={errors.password?.message}
          label="Пароль"
          {...register("password")}
        />
        <PasswordInput
          autoComplete="new-password"
          error={errors.repeatPassword?.message}
          label="Повторите пароль"
          {...register("repeatPassword")}
        />
        <Input
          autoComplete="one-time-code"
          error={errors.inviteCode?.message}
          icon={<KeyRound className="h-4 w-4" />}
          label="Код приглашения"
          placeholder="MAMA-8F2K"
          {...register("inviteCode")}
        />
        <Button className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Создаём аккаунт" : "Создать аккаунт"}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-secondary">
        Уже есть аккаунт?{" "}
        <Link className="font-semibold text-accent-teal hover:underline" href="/login">
          Войти
        </Link>
      </p>
    </Card>
  );
}
