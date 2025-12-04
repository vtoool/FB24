"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
      const { data, error } = await supabase
        .from("settings")
        .select("meta_page_access_token")
        .eq("user_id", user.id)
        .maybeSingle();

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

    // Strict Upsert logic
    const { error } = await supabase.from("settings").upsert(
      {
        user_id: user.id,
        meta_page_access_token: token,
        updated_at: new Date().toISOString(),
      },
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

  if (loading) return <div className="p-10 text-center">Loading settings...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Navigation Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">CRM Settings</h1>
        <Link href="/" className="text-blue-600 hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow border">
        <h2 className="text-lg font-semibold mb-4">Meta Graph API Configuration</h2>
        <p className="text-sm text-gray-600 mb-4">
            Paste your Page Access Token below.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Page Access Token</label>
            <input 
              type="text" 
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAA..."
              className="w-full p-2 border rounded font-mono text-sm"
            />
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={handleSave}
              disabled={saving}
              className={`px-4 py-2 rounded text-white ${saving ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>
            
            {msg && <span className={`text-sm ${msg.includes("Error") ? "text-red-600" : "text-green-600"}`}>{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}