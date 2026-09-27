export const metadata = {
  title: "Whisk & Bake",
  description: "Matcha cafe ordering system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
