import React from 'react';
import './globals.css';
import { ThemeProvider } from '../components/theme-provider';

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
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground font-sans antialiased overflow-hidden">
        <ThemeProvider defaultTheme="system" storageKey="crm-theme">
            {children}
        </ThemeProvider>
      </body>
    </html>
  );
}