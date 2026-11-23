import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Inter, Noto_Sans_Bengali, Noto_Sans_Devanagari, Noto_Sans_Gujarati, Noto_Sans_Gurmukhi, Noto_Sans_Kannada, Noto_Sans_Malayalam, Noto_Sans_Oriya, Noto_Sans_Tamil, Noto_Sans_Telugu } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
const notoDevanagari = Noto_Sans_Devanagari({ subsets: ["devanagari", "latin"], variable: "--font-noto-devanagari", display: "swap", preload: false });
const notoBengali = Noto_Sans_Bengali({ subsets: ["bengali", "latin"], variable: "--font-noto-bengali", display: "swap", preload: false });
const notoGujarati = Noto_Sans_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-noto-gujarati", display: "swap", preload: false });
const notoGurmukhi = Noto_Sans_Gurmukhi({ subsets: ["gurmukhi", "latin"], variable: "--font-noto-gurmukhi", display: "swap", preload: false });
const notoKannada = Noto_Sans_Kannada({ subsets: ["kannada", "latin"], variable: "--font-noto-kannada", display: "swap", preload: false });
const notoMalayalam = Noto_Sans_Malayalam({ subsets: ["malayalam", "latin"], variable: "--font-noto-malayalam", display: "swap", preload: false });
const notoOriya = Noto_Sans_Oriya({ subsets: ["oriya", "latin"], variable: "--font-noto-oriya", display: "swap", preload: false });
const notoTamil = Noto_Sans_Tamil({ subsets: ["tamil", "latin"], variable: "--font-noto-tamil", display: "swap", preload: false });
const notoTelugu = Noto_Sans_Telugu({ subsets: ["telugu", "latin"], variable: "--font-noto-telugu", display: "swap", preload: false });
export const metadata: Metadata = { title: "AgriTrack | Farm Management", description: "Manage farm records, crops, expenses and mandi prices." };
export default async function RootLayout({children}:{children:React.ReactNode}) { const locale=await getLocale(); const messages=await getMessages(); const fontVariables=[inter,notoDevanagari,notoBengali,notoGujarati,notoGurmukhi,notoKannada,notoMalayalam,notoOriya,notoTamil,notoTelugu].map(font=>font.variable).join(" "); return <html lang={locale} className={fontVariables}><body id="smart-agritrack"><NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider></body></html>; }
