import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function SettingsPage() {
  const supabase = createClient();

  // 1. Check User Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }

  // 2. Fetch Settings Safely (Fixes 406 Error)
  // .maybeSingle() returns null instead of crashing if no row exists
  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle(); 

  // Server Action to Save Settings
  async function saveSettings(formData: FormData) {
    "use server";
    const token = formData.get("token") as string;
    const supabase = createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fixes 400 Error: Explicitly matching the Unique Constraint
    const { error } = await supabase.from("settings").upsert(
      {
        user_id: user.id,
        meta_page_access_token: token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" } // Must match the SQL unique constraint
    );

    if (error) {
      console.error("Save Error:", error);
      throw new Error("Failed to save settings");
    }

    revalidatePath("/settings");
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">CRM Settings</h1>
      
      <div className="bg-white p-6 rounded-lg shadow border">
        <h2 className="text-lg font-semibold mb-4">Meta Graph API Configuration</h2>
        <p className="text-sm text-gray-600 mb-4">
            Paste your Page Access Token below. This allows the CRM to read your messages.
        </p>

        <form action={saveSettings} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Page Access Token</label>
            <input 
              name="token"
              type="text" 
              defaultValue={settings?.meta_page_access_token || ""}
              placeholder="EAA..."
              className="w-full p-2 border rounded font-mono text-sm"
              required
            />
          </div>

          <button 
            type="submit" 
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Save Configuration
          </button>
        </form>
      </div>
    </div>
  );
}