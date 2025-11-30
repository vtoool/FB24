import React from 'react';
import './globals.css';

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
      <body className="bg-gray-50 text-gray-900 font-sans antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}