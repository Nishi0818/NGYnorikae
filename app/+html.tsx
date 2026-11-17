import { type PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: PropsWithChildren) {
  const isProduction = process.env.NODE_ENV === "production";

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#FFFFFF" />
        <meta name="description" content="名古屋市営地下鉄・名古屋市バス・名鉄の時刻表と乗換時間を考慮するオフライン乗換案内" />
        <link rel="manifest" href="/manifest.json" />
        <ScrollViewStyleReset />
        <script
          dangerouslySetInnerHTML={{
            __html: isProduction
              ? `if (typeof window !== 'undefined' && 'serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('/service-worker.js').catch(function () {}); }); }`
              : `if (typeof window !== 'undefined' && 'serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(function (registrations) { registrations.forEach(function (registration) { registration.unregister(); }); }); if ('caches' in window) { caches.keys().then(function (names) { names.forEach(function (name) { caches.delete(name); }); }); } }`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
