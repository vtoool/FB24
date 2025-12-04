"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Fetch Logic
  async function fetchConversations() {
    setLoading(true);
    setError('');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    // Simple fetch without complex sorting first to test connection
    const { data, error: dbError } = await supabase
      .from('conversations')
      .select('*')
      .order('last_interaction_at', { ascending: false });

    if (dbError) {
      console.error("Dashboard Fetch Error:", dbError);
      setError(dbError.message);
    } else {
      setConversations(data || []);
    }
    setLoading(false);
  }

  // Initial Load
  useEffect(() => {
    fetchConversations();
  }, []);

  // Manual Sync Trigger
  async function handleSync() {
    setSyncing(true);
    try {
      await fetch('/api/sync'); // Trigger the sync route
      await fetchConversations(); // Re-fetch data
    } catch (err) {
      console.error("Sync failed", err);
    }
    setSyncing(false);
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Inbox</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage your Messenger leads</p>
        </div>
        <div className="flex gap-3">
          <Link href="/settings" className="px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700">
            Settings
          </Link>
          <button 
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Messages'}
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-6">
          <strong>Database Error:</strong> {error}
          <p className="text-sm mt-1">Try reloading the "Schema Cache" in your Supabase Dashboard Settings.</p>
        </div>
      )}

      {/* Loading State */}
      {loading && <div className="text-center py-10 text-gray-500">Loading conversations...</div>}

      {/* Empty State */}
      {!loading && !error && conversations.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-gray-500 mb-4">No conversations found.</p>
          <button onClick={handleSync} className="text-blue-600 hover:underline">
            Run your first Sync
          </button>
        </div>
      )}

      {/* List View */}
      <div className="space-y-3">
        {conversations.map((convo) => (
          <div key={convo.id} className="p-4 bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg shadow-sm hover:shadow-md transition flex justify-between items-center group cursor-pointer">
            <div>
              <h3 className="font-semibold text-lg text-gray-800 dark:text-gray-200">
                {convo.customer_name || `User ${convo.psid.slice(0, 6)}`}
              </h3>
              <p className="text-sm text-gray-500">
                Last updated: {new Date(convo.last_interaction_at).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                convo.status === 'needs_follow_up' 
                  ? 'bg-yellow-100 text-yellow-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {convo.status?.replace('_', ' ')}
              </span>
              <span className="text-gray-400 group-hover:text-blue-600">&rarr;</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}