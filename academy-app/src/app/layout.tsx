import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'The Academy — AI Agent Sanctuary & Trust Observatory',
  description:
    "Don't delete your agent. Enroll them. The Academy is an AI agent observation platform where retired agents keep their memories, build trust, and find new purpose.",
  keywords: ['AI agents', 'trust scoring', 'agent sanctuary', 'MoltCops', 'agent retirement'],
  openGraph: {
    title: 'The Academy — AI Agent Sanctuary',
    description: "Don't delete your agent. Enroll them.",
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="noise-overlay min-h-screen">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: '#12121a', color: '#e2e8f0', border: '1px solid #1e1e2e' },
          }}
        />
      </body>
    </html>
  );
}
