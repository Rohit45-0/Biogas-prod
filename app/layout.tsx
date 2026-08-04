import type { Metadata } from "next";
import "./globals.css";
import "./fixes.css";
export const metadata:Metadata={title:"Aquaivolt AI Command Center",description:"Interactive biogas prediction, optimization and digital twin prototype."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
