import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (!token) {
    redirect("/login");
  }

  try {
    const apiUrl = process.env.NEXT_PRIVATE_API_URL ?? "http://localhost:8000";
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: { Cookie: `access_token=${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      redirect("/login");
    }

    const user = (await res.json()) as { role: string };

    if (user.role === "candidate") {
      redirect("/candidate/dashboard");
    }
    if (user.role === "recruiter") {
      redirect("/recruiter/dashboard");
    }
  } catch {
    // network error or unexpected shape
  }

  redirect("/login");
}
