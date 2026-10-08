import { LoginForm } from "@/features/auth/login-form";
import { AuthShell } from "@/components/ui/shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginPage() {
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
