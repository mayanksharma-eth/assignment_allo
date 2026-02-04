import "./globals.css";

export const metadata = {
  title: "Allo • Ask Merlin",
  description: "Basic layout for an investing assistant UI"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

