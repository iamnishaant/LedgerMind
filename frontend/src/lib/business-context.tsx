"use client";
/**
 * Business context — the authenticated identity (user + their active business)
 * plus an `authedFetch` helper that attaches the current Supabase access token
 * to every backend call. Hydrated from the server-rendered dashboard layout so
 * pages never show a loading flash for "who am I"; a browser client keeps the
 * access token fresh in the background via onAuthStateChange.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface BusinessContextValue {
  userId: string;
  fullName: string;
  businessId: string;
  businessName: string;
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>;
  signOut: () => Promise<void>;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({
  userId,
  fullName,
  businessId,
  businessName,
  accessToken: initialAccessToken,
  children,
}: {
  userId: string;
  fullName: string;
  businessId: string;
  businessName: string;
  accessToken: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState(initialAccessToken);
  const tokenRef = useRef(initialAccessToken);
  tokenRef.current = accessToken;

  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
        return;
      }
      if (session?.access_token) setAccessToken(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const authedFetch = async (path: string, init: RequestInit = {}) => {
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${tokenRef.current}` },
    });
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <BusinessContext.Provider value={{ userId, fullName, businessId, businessName, authedFetch, signOut }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness() must be used inside <BusinessProvider>");
  return ctx;
}
