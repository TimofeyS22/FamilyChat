import { AuthShell } from "@/components/ui/shell";
import { RegisterForm } from "@/features/auth/register-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RegisterPage() {
  return (
    <AuthShell>
      <RegisterForm />
    </AuthShell>
  );
}
