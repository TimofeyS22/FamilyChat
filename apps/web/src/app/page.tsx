import { HomeRedirect } from "@/features/auth/protected-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HomePage() {
  return <HomeRedirect />;
}
