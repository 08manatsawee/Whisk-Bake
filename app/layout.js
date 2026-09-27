export const metadata = {
  title: 'Whisk & Bake',
  description: 'Whisk & Bake Application',
}

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
