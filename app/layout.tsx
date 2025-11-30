import React from 'react';

export const metadata = {
  title: 'Messenger CRM AI',
  description: 'Next.js 14 compatible Messenger CRM with AI automation using Gemini, Supabase, and Tailwind CSS.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script src="https://cdn.tailwindcss.com"></script>
        <script type="importmap">{`
{
  "imports": {
    "lucide-react": "https://aistudiocdn.com/lucide-react@^0.555.0",
    "react/": "https://aistudiocdn.com/react@^18.3.1/",
    "react": "https://aistudiocdn.com/react@^18.3.1",
    "react-dom/": "https://aistudiocdn.com/react-dom@^18.3.1/",
    "@google/genai": "https://aistudiocdn.com/@google/genai@^1.30.0",
    "clsx": "https://aistudiocdn.com/clsx@^2.1.1",
    "next/": "https://aistudiocdn.com/next@^14.2.5/",
    "tailwind-merge": "https://aistudiocdn.com/tailwind-merge@^3.4.0",
    "@supabase/supabase-js": "https://aistudiocdn.com/@supabase/supabase-js@^2.86.0"
  }
}
`}</script>
      </head>
      <body className="bg-gray-50 text-gray-900 font-sans antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
