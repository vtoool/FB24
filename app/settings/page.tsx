"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SettingsPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadSettings() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Fetch existing token using .maybeSingle() to avoid 406 errors
      const { data: settingsData, error } = await supabase
        .from("settings")
        .select("meta_page_access_token")
        .eq("user_id", user.id)
        .maybeSingle();

      const data = settingsData as any;

      if (data) {
        setToken(data.meta_page_access_token || "");
      }
      setLoading(false);
    }
    loadSettings();
  }, [supabase, router]);

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Strict Upsert logic - cast to any to avoid 'never' inference issue
    // Removed updated_at as it is not in the type definition
    const { error } = await supabase.from("settings").upsert(
      {
        user_id: user.id,
        meta_page_access_token: token,
      } as any,
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Save failed:", error);
      setMsg("Error saving settings. Check console.");
    } else {
      setMsg("✅ Configuration Saved!");
    }
    setSaving(false);
  };

  if (loading) return <div className="p-10 text-center text-foreground">Loading settings...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 min-h-screen">
      {/* Navigation Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">CRM Settings</h1>
        <div className="flex items-center gap-4">
             <ThemeToggle />
            <Link href="/" className="text-primary hover:underline">
            &larr; Back to Dashboard
            </Link>
        </div>
      </div>
      
      <div className="bg-card p-6 rounded-lg shadow border border-border">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Meta Graph API Configuration</h2>
        <p className="text-sm text-muted-foreground mb-4">
            Paste your Page Access Token below.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-foreground">Page Access Token</label>
            <input 
              type="text" 
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAA..."
              className="w-full p-2 border border-input bg-background rounded font-mono text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={handleSave}
              disabled={saving}
              className={`px-4 py-2 rounded text-primary-foreground ${saving ? "bg-muted cursor-not-allowed" : "bg-primary hover:bg-primary/90"}`}
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>
            
            {msg && <span className={`text-sm ${msg.includes("Error") ? "text-destructive" : "text-green-600"}`}>{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}