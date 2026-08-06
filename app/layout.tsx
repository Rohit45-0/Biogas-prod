import type { Metadata } from "next";
import "./globals.css";
import "./fixes.css";
export const metadata:Metadata={
  metadataBase:new URL("https://aquaivolt-command-center.barshilerohit1785.chatgpt.site"),
  title:"Aquaivolt AI Biogas Command Center",
  description:"Model-driven biogas prediction, baseline optimization evidence, simulated IoT monitoring and persistent audit trails.",
  openGraph:{title:"Aquaivolt AI Biogas Command Center",description:"Predict · Optimize · Audit",images:[{url:"/og.png",width:1733,height:908,alt:"Aquaivolt AI Biogas Command Center"}]},
  twitter:{card:"summary_large_image",title:"Aquaivolt AI Biogas Command Center",description:"Predict · Optimize · Audit",images:["/og.png"]},
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
