import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Perform Practice Solutions | Client Demo',
  description:
    'Local client presentation with fictional referral and outreach data. Not a live service.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before paint: a saved dark preference must not flash white first. */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('perform-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
