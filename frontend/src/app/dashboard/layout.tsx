import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase-server";
import { BusinessProvider } from "@/lib/business-context";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // getUser() re-verifies against the auth server — trust this over getSession().
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  if (!businesses || businesses.length === 0) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (
    <BusinessProvider
      userId={user.id}
      fullName={profile?.full_name ?? user.email ?? "there"}
      businessId={businesses[0].id}
      businessName={businesses[0].name}
      accessToken={session.access_token}
    >
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <main style={{
          flex: 1,
          padding: "32px",
          overflowY: "auto",
          background: "radial-gradient(ellipse at top left, rgba(99,102,241,0.05) 0%, transparent 60%)",
        }}>
          {children}
        </main>
      </div>
    </BusinessProvider>
  );
}
