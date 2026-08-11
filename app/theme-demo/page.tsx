'use client'

import { useState } from 'react'
import { ORG_SHORT_NAME, ORG_TAGLINE } from '@/lib/siteConfig'

/* ─────────────────────────────────────────────
   PALETTE DEFINITIONS
   ───────────────────────────────────────────── */

const palettes = {
  unified: {
    name: 'Brand Unified',
    description: 'Your existing brand colors — systematized. Orange accent with navy header, blue-tinted dark mode.',
    light: {
      pageBg: '#f8fafc',
      cardBg: '#ffffff',
      cardBorder: '#e2e8f0',
      headerBg: '#1a1a1a',
      navBg: '#2c3e50',
      navText: '#94a3b8',
      navActive: '#ff6b35',
      textPrimary: '#0f172a',
      textSecondary: '#64748b',
      textMuted: '#94a3b8',
      accent: '#ff6b35',
      accentHover: '#e55a2b',
      accentSubtle: '#fff7ed',
      accentSubtleBorder: '#fed7aa',
      inputBg: '#ffffff',
      inputBorder: '#e2e8f0',
      badgeBg: '#f1f5f9',
      divider: '#e2e8f0',
      hoverBg: '#f8fafc',
    },
    dark: {
      pageBg: '#0f172a',
      cardBg: '#1e293b',
      cardBorder: '#334155',
      headerBg: '#0f172a',
      navBg: '#1a2332',
      navText: '#94a3b8',
      navActive: '#ff8c5a',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      accent: '#ff8c5a',
      accentHover: '#ff6b35',
      accentSubtle: 'rgba(255,107,53,0.12)',
      accentSubtleBorder: 'rgba(255,107,53,0.25)',
      inputBg: '#1e293b',
      inputBorder: '#334155',
      badgeBg: '#1e293b',
      divider: '#334155',
      hoverBg: '#253347',
    },
    colorBadges: {
      blue: { light: { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' }, dark: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' } },
      green: { light: { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' }, dark: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', border: 'rgba(34,197,94,0.3)' } },
      purple: { light: { bg: '#f3e8ff', text: '#7c3aed', border: '#e9d5ff' }, dark: { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa', border: 'rgba(139,92,246,0.3)' } },
      amber: { light: { bg: '#fef3c7', text: '#b45309', border: '#fde68a' }, dark: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)' } },
      red: { light: { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' }, dark: { bg: 'rgba(239,68,68,0.15)', text: '#f87171', border: 'rgba(239,68,68,0.3)' } },
      teal: { light: { bg: '#ccfbf1', text: '#0d9488', border: '#99f6e4' }, dark: { bg: 'rgba(20,184,166,0.15)', text: '#2dd4bf', border: 'rgba(20,184,166,0.3)' } },
    },
    gradient: 'linear-gradient(135deg, #ff6b35, #f59e0b)',
    roleBadges: {
      admin: { light: { bg: '#fee2e2', text: '#dc2626' }, dark: { bg: 'rgba(239,68,68,0.2)', text: '#f87171' } },
      executive: { light: { bg: '#f3e8ff', text: '#7c3aed' }, dark: { bg: 'rgba(139,92,246,0.2)', text: '#a78bfa' } },
      official: { light: { bg: '#dbeafe', text: '#2563eb' }, dark: { bg: 'rgba(59,130,246,0.2)', text: '#60a5fa' } },
    },
  },

  linear: {
    name: 'Linear',
    description: 'Inspired by Linear\'s refined aesthetic. Violet accent, cool undertones, ultra-clean surfaces.',
    light: {
      pageBg: '#f9fafb',
      cardBg: '#ffffff',
      cardBorder: '#e5e7eb',
      headerBg: '#1f2937',
      navBg: '#111827',
      navText: '#9ca3af',
      navActive: '#8b5cf6',
      textPrimary: '#111827',
      textSecondary: '#6b7280',
      textMuted: '#9ca3af',
      accent: '#8b5cf6',
      accentHover: '#7c3aed',
      accentSubtle: '#f5f3ff',
      accentSubtleBorder: '#ddd6fe',
      inputBg: '#ffffff',
      inputBorder: '#e5e7eb',
      badgeBg: '#f3f4f6',
      divider: '#e5e7eb',
      hoverBg: '#f9fafb',
    },
    dark: {
      pageBg: '#09090f',
      cardBg: '#131320',
      cardBorder: '#1f1f35',
      headerBg: '#09090f',
      navBg: '#0d0d18',
      navText: '#71717a',
      navActive: '#a78bfa',
      textPrimary: '#f4f4f5',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
      accent: '#a78bfa',
      accentHover: '#8b5cf6',
      accentSubtle: 'rgba(139,92,246,0.1)',
      accentSubtleBorder: 'rgba(139,92,246,0.2)',
      inputBg: '#131320',
      inputBorder: '#1f1f35',
      badgeBg: '#131320',
      divider: '#1f1f35',
      hoverBg: '#1a1a2e',
    },
    colorBadges: {
      blue: { light: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' }, dark: { bg: 'rgba(59,130,246,0.1)', text: '#93c5fd', border: 'rgba(59,130,246,0.2)' } },
      green: { light: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' }, dark: { bg: 'rgba(34,197,94,0.1)', text: '#86efac', border: 'rgba(34,197,94,0.2)' } },
      purple: { light: { bg: '#faf5ff', text: '#9333ea', border: '#e9d5ff' }, dark: { bg: 'rgba(168,85,247,0.1)', text: '#c4b5fd', border: 'rgba(168,85,247,0.2)' } },
      amber: { light: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' }, dark: { bg: 'rgba(245,158,11,0.1)', text: '#fcd34d', border: 'rgba(245,158,11,0.2)' } },
      red: { light: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }, dark: { bg: 'rgba(239,68,68,0.1)', text: '#fca5a5', border: 'rgba(239,68,68,0.2)' } },
      teal: { light: { bg: '#f0fdfa', text: '#0d9488', border: '#99f6e4' }, dark: { bg: 'rgba(20,184,166,0.1)', text: '#5eead4', border: 'rgba(20,184,166,0.2)' } },
    },
    gradient: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    roleBadges: {
      admin: { light: { bg: '#fef2f2', text: '#ef4444' }, dark: { bg: 'rgba(239,68,68,0.12)', text: '#fca5a5' } },
      executive: { light: { bg: '#faf5ff', text: '#9333ea' }, dark: { bg: 'rgba(168,85,247,0.12)', text: '#c4b5fd' } },
      official: { light: { bg: '#eff6ff', text: '#3b82f6' }, dark: { bg: 'rgba(59,130,246,0.12)', text: '#93c5fd' } },
    },
  },

  shadcn: {
    name: 'Zinc (Pure)',
    description: 'Original shadcn zinc — completely neutral, no blue tint. Included for comparison.',
    light: {
      pageBg: '#fafafa',
      cardBg: '#ffffff',
      cardBorder: '#e4e4e7',
      headerBg: '#18181b',
      navBg: '#27272a',
      navText: '#a1a1aa',
      navActive: '#ff6b35',
      textPrimary: '#09090b',
      textSecondary: '#71717a',
      textMuted: '#a1a1aa',
      accent: '#ff6b35',
      accentHover: '#e55a2b',
      accentSubtle: '#fff7ed',
      accentSubtleBorder: '#fed7aa',
      inputBg: '#ffffff',
      inputBorder: '#d4d4d8',
      badgeBg: '#f4f4f5',
      divider: '#e4e4e7',
      hoverBg: '#f4f4f5',
    },
    dark: {
      pageBg: '#09090b',
      cardBg: '#18181b',
      cardBorder: '#27272a',
      headerBg: '#09090b',
      navBg: '#0f0f12',
      navText: '#71717a',
      navActive: '#ff8c5a',
      textPrimary: '#fafafa',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
      accent: '#ff8c5a',
      accentHover: '#ff6b35',
      accentSubtle: 'rgba(255,107,53,0.08)',
      accentSubtleBorder: 'rgba(255,107,53,0.2)',
      inputBg: '#18181b',
      inputBorder: '#27272a',
      badgeBg: '#27272a',
      divider: '#27272a',
      hoverBg: '#1f1f23',
    },
    colorBadges: {
      blue: { light: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' }, dark: { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', border: 'rgba(59,130,246,0.25)' } },
      green: { light: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' }, dark: { bg: 'rgba(34,197,94,0.12)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' } },
      purple: { light: { bg: '#faf5ff', text: '#9333ea', border: '#e9d5ff' }, dark: { bg: 'rgba(168,85,247,0.12)', text: '#a78bfa', border: 'rgba(168,85,247,0.25)' } },
      amber: { light: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' }, dark: { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24', border: 'rgba(245,158,11,0.25)' } },
      red: { light: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }, dark: { bg: 'rgba(239,68,68,0.12)', text: '#f87171', border: 'rgba(239,68,68,0.25)' } },
      teal: { light: { bg: '#f0fdfa', text: '#0d9488', border: '#99f6e4' }, dark: { bg: 'rgba(20,184,166,0.12)', text: '#2dd4bf', border: 'rgba(20,184,166,0.25)' } },
    },
    gradient: 'linear-gradient(135deg, #ff6b35, #f97316)',
    roleBadges: {
      admin: { light: { bg: '#fee2e2', text: '#dc2626' }, dark: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' } },
      executive: { light: { bg: '#f3e8ff', text: '#7c3aed' }, dark: { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' } },
      official: { light: { bg: '#dbeafe', text: '#2563eb' }, dark: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa' } },
    },
  },

  zincBlue: {
    name: 'Zinc + Brand Navy',
    description: 'Zinc neutrals with a brand navy header, blue-tinted dark mode, and muted category colors that don\'t compete with content.',
    light: {
      pageBg: '#fafafa',
      cardBg: '#ffffff',
      cardBorder: '#e4e4e7',
      headerBg: '#1a1a1a',
      navBg: '#2c3e50',
      navText: '#94a3b8',
      navActive: '#ff6b35',
      textPrimary: '#09090b',
      textSecondary: '#71717a',
      textMuted: '#a1a1aa',
      accent: '#ff6b35',
      accentHover: '#e55a2b',
      accentSubtle: '#fff7ed',
      accentSubtleBorder: '#fed7aa',
      inputBg: '#ffffff',
      inputBorder: '#d4d4d8',
      badgeBg: '#f4f4f5',
      divider: '#e4e4e7',
      hoverBg: '#f4f4f5',
    },
    dark: {
      pageBg: '#0b0e14',
      cardBg: '#141820',
      cardBorder: '#1f2937',
      headerBg: '#0b0e14',
      navBg: '#111827',
      navText: '#64748b',
      navActive: '#d4845e',
      textPrimary: '#e2e4e8',
      textSecondary: '#8891a0',
      textMuted: '#5a6371',
      accent: '#d4845e',
      accentHover: '#c07550',
      accentSubtle: 'rgba(212,132,94,0.07)',
      accentSubtleBorder: 'rgba(212,132,94,0.15)',
      inputBg: '#141820',
      inputBorder: '#1f2937',
      badgeBg: '#1a2030',
      divider: '#1f2937',
      hoverBg: '#1a2030',
    },
    colorBadges: {
      // Muted / desaturated — colors readable but never neon
      blue: { light: { bg: '#f0f4f8', text: '#4a7196', border: '#d5e2ef' }, dark: { bg: 'rgba(59,130,246,0.06)', text: '#6889a8', border: 'rgba(59,130,246,0.1)' } },
      green: { light: { bg: '#f0f5f1', text: '#4a8060', border: '#d2e5d9' }, dark: { bg: 'rgba(34,197,94,0.06)', text: '#5e9a74', border: 'rgba(34,197,94,0.1)' } },
      purple: { light: { bg: '#f3f0f7', text: '#7a6599', border: '#ddd5e9' }, dark: { bg: 'rgba(139,92,246,0.06)', text: '#8878a8', border: 'rgba(139,92,246,0.1)' } },
      amber: { light: { bg: '#f7f3ed', text: '#917542', border: '#e8dcc8' }, dark: { bg: 'rgba(245,158,11,0.06)', text: '#a8904e', border: 'rgba(245,158,11,0.1)' } },
      red: { light: { bg: '#f7f0f0', text: '#a35757', border: '#e8d4d4' }, dark: { bg: 'rgba(239,68,68,0.06)', text: '#a86868', border: 'rgba(239,68,68,0.1)' } },
      teal: { light: { bg: '#eef5f3', text: '#4a8077', border: '#cfe3de' }, dark: { bg: 'rgba(20,184,166,0.06)', text: '#5a9a8e', border: 'rgba(20,184,166,0.1)' } },
    },
    gradient: 'linear-gradient(135deg, #d4845e, #c07550)',
    roleBadges: {
      admin: { light: { bg: '#f7f0f0', text: '#a35757' }, dark: { bg: 'rgba(239,68,68,0.07)', text: '#a86868' } },
      executive: { light: { bg: '#f3f0f7', text: '#7a6599' }, dark: { bg: 'rgba(139,92,246,0.07)', text: '#8878a8' } },
      official: { light: { bg: '#f0f4f8', text: '#4a7196' }, dark: { bg: 'rgba(59,130,246,0.07)', text: '#6889a8' } },
    },
  },

  geist: {
    name: 'Vercel Geist',
    description: 'Maximum contrast — pure black and white with surgical orange accents. Bold and modern.',
    light: {
      pageBg: '#fafafa',
      cardBg: '#ffffff',
      cardBorder: '#eaeaea',
      headerBg: '#000000',
      navBg: '#000000',
      navText: '#888888',
      navActive: '#ff6b35',
      textPrimary: '#000000',
      textSecondary: '#666666',
      textMuted: '#999999',
      accent: '#ff6b35',
      accentHover: '#e55a2b',
      accentSubtle: '#fff7ed',
      accentSubtleBorder: '#ffedd5',
      inputBg: '#ffffff',
      inputBorder: '#eaeaea',
      badgeBg: '#fafafa',
      divider: '#eaeaea',
      hoverBg: '#fafafa',
    },
    dark: {
      pageBg: '#000000',
      cardBg: '#111111',
      cardBorder: '#222222',
      headerBg: '#000000',
      navBg: '#000000',
      navText: '#666666',
      navActive: '#ff8c5a',
      textPrimary: '#ededed',
      textSecondary: '#888888',
      textMuted: '#666666',
      accent: '#ff8c5a',
      accentHover: '#ff6b35',
      accentSubtle: 'rgba(255,107,53,0.08)',
      accentSubtleBorder: 'rgba(255,107,53,0.2)',
      inputBg: '#111111',
      inputBorder: '#333333',
      badgeBg: '#1a1a1a',
      divider: '#222222',
      hoverBg: '#1a1a1a',
    },
    colorBadges: {
      blue: { light: { bg: '#ebf5ff', text: '#0070f3', border: '#b6d9ff' }, dark: { bg: 'rgba(0,112,243,0.1)', text: '#3291ff', border: 'rgba(0,112,243,0.25)' } },
      green: { light: { bg: '#e6f9ef', text: '#0e8345', border: '#a3ebc5' }, dark: { bg: 'rgba(14,131,69,0.1)', text: '#46d17e', border: 'rgba(14,131,69,0.25)' } },
      purple: { light: { bg: '#f1ecff', text: '#7928ca', border: '#d4bfff' }, dark: { bg: 'rgba(121,40,202,0.1)', text: '#b07add', border: 'rgba(121,40,202,0.25)' } },
      amber: { light: { bg: '#fff8e6', text: '#c67600', border: '#ffe5a0' }, dark: { bg: 'rgba(198,118,0,0.1)', text: '#f5a623', border: 'rgba(198,118,0,0.25)' } },
      red: { light: { bg: '#ffebeb', text: '#e00', border: '#ffbdbd' }, dark: { bg: 'rgba(238,0,0,0.1)', text: '#ff4444', border: 'rgba(238,0,0,0.25)' } },
      teal: { light: { bg: '#e6fbf4', text: '#06855e', border: '#8ef5cd' }, dark: { bg: 'rgba(6,133,94,0.1)', text: '#36d5a0', border: 'rgba(6,133,94,0.25)' } },
    },
    gradient: 'linear-gradient(135deg, #ff6b35, #ff4405)',
    roleBadges: {
      admin: { light: { bg: '#ffebeb', text: '#e00' }, dark: { bg: 'rgba(238,0,0,0.12)', text: '#ff4444' } },
      executive: { light: { bg: '#f1ecff', text: '#7928ca' }, dark: { bg: 'rgba(121,40,202,0.12)', text: '#b07add' } },
      official: { light: { bg: '#ebf5ff', text: '#0070f3' }, dark: { bg: 'rgba(0,112,243,0.12)', text: '#3291ff' } },
    },
  },
}

type PaletteKey = keyof typeof palettes

/* ─────────────────────────────────────────────
   ICON COMPONENTS (inline SVGs to avoid imports)
   ───────────────────────────────────────────── */

const Icons = {
  Home: ({ color }: { color: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  ),
  Calendar: ({ color }: { color: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
  ),
  Book: ({ color }: { color: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
  ),
  Bell: ({ color }: { color: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
  ),
  Users: ({ color }: { color: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
  ),
  Shield: ({ color }: { color: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  Check: ({ color }: { color: string }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  Alert: ({ color }: { color: string }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  ),
  ChevronRight: ({ color }: { color: string }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  ),
  Clock: ({ color }: { color: string }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  ),
  Search: ({ color }: { color: string }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  ),
  Gavel: ({ color }: { color: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2l5 5-7 7-5-5z"/><path d="M3 21l4-4"/><path d="M8.5 8.5L3 14"/></svg>
  ),
  Mail: ({ color }: { color: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>
  ),
}

/* ─────────────────────────────────────────────
   PALETTE PREVIEW COMPONENT
   ───────────────────────────────────────────── */

function PalettePreview({ paletteKey, mode }: { paletteKey: PaletteKey; mode: 'light' | 'dark' }) {
  const palette = palettes[paletteKey]
  const t = palette[mode] // theme tokens
  const badges = palette.colorBadges
  const roles = palette.roleBadges

  return (
    <div style={{ background: t.pageBg, borderRadius: '16px', overflow: 'hidden', border: `1px solid ${t.cardBorder}` }}>

      {/* ── HEADER BAR ── */}
      <div style={{ background: t.headerBg, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: '13px' }}>C</span>
          </div>
          <div>
            <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700, letterSpacing: '-0.01em' }}>{ORG_SHORT_NAME} Portal</div>
            <div style={{ color: t.navText, fontSize: '10px' }}>{ORG_TAGLINE}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '10px' }}>JD</span>
          </div>
          <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 500 }}>John</span>
          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: roles.admin[mode].bg, color: roles.admin[mode].text }}>Admin</span>
        </div>
      </div>

      {/* ── NAV BAR ── */}
      <div style={{ background: t.navBg, padding: '0 16px', display: 'flex', gap: '0', borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)'}`, overflowX: 'auto' }}>
        {[
          { label: 'Dashboard', active: true },
          { label: 'Calendar', active: false },
          { label: 'Resources', active: false },
          { label: 'News', active: false },
          { label: 'Evaluations', active: false },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              padding: '10px 14px',
              fontSize: '12px',
              fontWeight: item.active ? 600 : 500,
              color: item.active ? t.navActive : t.navText,
              borderBottom: item.active ? `2px solid ${t.navActive}` : '2px solid transparent',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* ── PAGE CONTENT ── */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Welcome Card with gradient bar */}
        <div style={{ background: t.cardBg, borderRadius: '12px', border: `1px solid ${t.cardBorder}`, overflow: 'hidden', position: 'relative' }}>
          <div style={{ height: '3px', background: palette.gradient }} />
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.accent, marginBottom: '2px' }}>Welcome back</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.02em' }}>John Doe</div>
            <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: t.accentSubtle, color: t.accent, border: `1px solid ${t.accentSubtleBorder}` }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '999px', background: t.accent }} />
              Administrator
            </div>
          </div>
        </div>

        {/* Two-column widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

          {/* Announcements Widget */}
          <div style={{ background: t.cardBg, borderRadius: '12px', border: `1px solid ${t.cardBorder}`, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icons.Bell color={t.accent} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Announcements</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: 600, color: t.accent, cursor: 'pointer' }}>
                View All <Icons.ChevronRight color={t.accent} />
              </div>
            </div>

            {/* High priority announcement */}
            <div style={{ borderLeft: `3px solid ${badges.red[mode].text}`, paddingLeft: '10px', background: badges.red[mode].bg, borderRadius: '8px', padding: '8px 10px 8px 12px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '6px', fontWeight: 600, background: badges.red[mode].bg, color: badges.red[mode].text, border: `1px solid ${badges.red[mode].border}` }}>administrative</span>
                <span style={{ fontSize: '10px', color: badges.red[mode].text, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Icons.Alert color={badges.red[mode].text} /> High Priority
                </span>
                <span style={{ fontSize: '10px', color: t.textMuted }}>Jan 15, 2026</span>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: t.textPrimary }}>Season Scheduling Update</div>
            </div>

            {/* Normal announcement */}
            <div style={{ borderLeft: `3px solid ${t.accent}`, background: t.hoverBg, borderRadius: '8px', padding: '8px 10px 8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '6px', fontWeight: 600, background: badges.green[mode].bg, color: badges.green[mode].text, border: `1px solid ${badges.green[mode].border}` }}>training</span>
                <span style={{ fontSize: '10px', color: t.textMuted }}>Jan 12, 2026</span>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: t.textPrimary }}>Clinic Registration Open</div>
            </div>
          </div>

          {/* Events Widget */}
          <div style={{ background: t.cardBg, borderRadius: '12px', border: `1px solid ${t.cardBorder}`, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icons.Calendar color={t.accent} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Upcoming Events</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: 600, color: t.accent, cursor: 'pointer' }}>
                View All <Icons.ChevronRight color={t.accent} />
              </div>
            </div>

            {/* Event items */}
            {[
              { type: 'training', color: 'green' as const, title: 'Officiating Clinic', time: '7:00 PM', date: 'Tomorrow' },
              { type: 'meeting', color: 'purple' as const, title: 'Executive Board Meeting', time: '6:30 PM', date: 'Jan 20' },
              { type: 'deadline', color: 'red' as const, title: 'Registration Deadline', time: '11:59 PM', date: 'Jan 25' },
            ].map((evt, i) => (
              <div key={i} style={{ border: `1px solid ${t.cardBorder}`, borderRadius: '8px', padding: '8px 10px', marginBottom: i < 2 ? '6px' : '0', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '999px', fontWeight: 600, background: badges[evt.color][mode].bg, color: badges[evt.color][mode].text, border: `1px solid ${badges[evt.color][mode].border}` }}>{evt.type}</span>
                  <span style={{ fontSize: '10px', fontWeight: 500, color: t.textMuted }}>{evt.date}</span>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: t.textPrimary }}>{evt.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '10px', color: t.textMuted }}>
                  <Icons.Clock color={t.textMuted} /> {evt.time}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links Grid */}
        <div style={{ background: t.cardBg, borderRadius: '12px', border: `1px solid ${t.cardBorder}`, padding: '14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary, marginBottom: '10px' }}>Quick Links</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { icon: Icons.Home, label: 'Profile', color: 'amber' as const },
              { icon: Icons.Book, label: 'Resources', color: 'blue' as const },
              { icon: Icons.Bell, label: 'News', color: 'purple' as const },
              { icon: Icons.Calendar, label: 'Calendar', color: 'green' as const },
              { icon: Icons.Gavel, label: 'Rules', color: 'red' as const },
              { icon: Icons.Users, label: 'Members', color: 'teal' as const },
              { icon: Icons.Mail, label: 'Email', color: 'blue' as const },
              { icon: Icons.Shield, label: 'Admin', color: 'purple' as const },
            ].map((link, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: `1px solid ${t.cardBorder}`,
                  cursor: 'pointer',
                  background: t.cardBg,
                }}
              >
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: badges[link.color][mode].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <link.icon color={badges[link.color][mode].text} />
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: t.textPrimary, whiteSpace: 'nowrap' }}>{link.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom row: Buttons + Form + Alert */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

          {/* Buttons & Badges Card */}
          <div style={{ background: t.cardBg, borderRadius: '12px', border: `1px solid ${t.cardBorder}`, padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: t.textPrimary, marginBottom: '10px' }}>Buttons &amp; Badges</div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <button style={{ background: palette.gradient, color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Primary Action</button>
              <button style={{ background: 'transparent', color: t.accent, border: `1.5px solid ${t.accent}`, padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Secondary</button>
              <button style={{ background: t.badgeBg, color: t.textSecondary, border: `1px solid ${t.cardBorder}`, padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Tertiary</button>
            </div>

            {/* Role Badges */}
            <div style={{ fontSize: '10px', fontWeight: 600, color: t.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role Badges</div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {Object.entries(roles).map(([role, colors]) => (
                <span key={role} style={{ padding: '2px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: colors[mode].bg, color: colors[mode].text }}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </span>
              ))}
            </div>

            {/* Category Badges */}
            <div style={{ fontSize: '10px', fontWeight: 600, color: t.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Category Badges</div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {Object.entries(badges).map(([name, colors]) => (
                <span key={name} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: colors[mode].bg, color: colors[mode].text, border: `1px solid ${colors[mode].border}` }}>
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* Form + Alert Card */}
          <div style={{ background: t.cardBg, borderRadius: '12px', border: `1px solid ${t.cardBorder}`, padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: t.textPrimary }}>Form Elements</div>

            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                <Icons.Search color={t.textMuted} />
              </div>
              <input
                type="text"
                placeholder="Search members..."
                readOnly
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: '8px',
                  border: `1px solid ${t.inputBorder}`,
                  background: t.inputBg,
                  color: t.textPrimary,
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Select */}
            <select
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '8px',
                border: `1px solid ${t.inputBorder}`,
                background: t.inputBg,
                color: t.textSecondary,
                fontSize: '12px',
                outline: 'none',
                appearance: 'none',
                boxSizing: 'border-box',
              }}
              defaultValue=""
            >
              <option value="" disabled>Filter by category...</option>
            </select>

            {/* Success Alert */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: badges.green[mode].bg, border: `1px solid ${badges.green[mode].border}` }}>
              <Icons.Check color={badges.green[mode].text} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: badges.green[mode].text }}>Registration confirmed successfully</span>
            </div>

            {/* Warning Alert */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: badges.amber[mode].bg, border: `1px solid ${badges.amber[mode].border}` }}>
              <Icons.Alert color={badges.amber[mode].text} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: badges.amber[mode].text }}>Evaluation deadline approaching</span>
            </div>

            {/* Error Alert */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: badges.red[mode].bg, border: `1px solid ${badges.red[mode].border}` }}>
              <Icons.Alert color={badges.red[mode].text} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: badges.red[mode].text }}>Failed to send notification</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   MAIN PAGE
   ───────────────────────────────────────────── */

export default function ThemeDemoPage() {
  const [focusedPalette, setFocusedPalette] = useState<PaletteKey | null>(null)

  const paletteKeys: PaletteKey[] = ['zincBlue', 'shadcn', 'unified', 'linear', 'geist']

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e12', color: '#e4e4e7' }}>
      {/* Sticky top bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(14,14,18,0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '14px 24px',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>Portal Theme Explorer</h1>
            <p style={{ fontSize: '13px', color: '#71717a', margin: '2px 0 0 0' }}>Compare palettes — each shows light &amp; dark side by side</p>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setFocusedPalette(null)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                background: !focusedPalette ? '#ff6b35' : 'rgba(255,255,255,0.06)',
                color: !focusedPalette ? '#fff' : '#a1a1aa',
                border: !focusedPalette ? 'none' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              All Palettes
            </button>
            {paletteKeys.map((key) => (
              <button
                key={key}
                onClick={() => setFocusedPalette(key)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: focusedPalette === key ? '#ff6b35' : 'rgba(255,255,255,0.06)',
                  color: focusedPalette === key ? '#fff' : '#a1a1aa',
                  border: focusedPalette === key ? 'none' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {palettes[key].name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Palette Sections */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        {paletteKeys
          .filter((key) => !focusedPalette || focusedPalette === key)
          .map((key) => (
            <div key={key} style={{ marginBottom: '40px' }}>
              {/* Palette Header */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <h2 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>{palettes[key].name}</h2>
                  {key === 'zincBlue' && (
                    <span style={{ padding: '2px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: 'rgba(255,107,53,0.15)', color: '#ff8c5a', border: '1px solid rgba(255,107,53,0.25)' }}>Recommended</span>
                  )}
                  {key === 'unified' && (
                    <span style={{ padding: '2px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.25)' }}>Current Brand</span>
                  )}
                </div>
                <p style={{ fontSize: '14px', color: '#71717a', margin: 0 }}>{palettes[key].description}</p>
              </div>

              {/* Light / Dark side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: focusedPalette ? '1fr 1fr' : '1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#71717a', marginBottom: '8px', paddingLeft: '4px' }}>Light Mode</div>
                  <PalettePreview paletteKey={key} mode="light" />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#71717a', marginBottom: '8px', paddingLeft: '4px' }}>Dark Mode</div>
                  <PalettePreview paletteKey={key} mode="dark" />
                </div>
              </div>

              {/* Color swatch strip */}
              <div style={{ marginTop: '12px', display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#52525b', marginRight: '6px' }}>Key colors:</span>
                {[
                  { label: 'Header', color: palettes[key].light.headerBg },
                  { label: 'Nav', color: palettes[key].light.navBg },
                  { label: 'Accent', color: palettes[key].light.accent },
                  { label: 'Page', color: palettes[key].light.pageBg },
                  { label: 'Card', color: palettes[key].light.cardBg },
                  { label: 'Dark BG', color: palettes[key].dark.pageBg },
                  { label: 'Dark Card', color: palettes[key].dark.cardBg },
                  { label: 'Dark Accent', color: palettes[key].dark.accent },
                ].map((swatch, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: swatch.color, border: '1px solid rgba(255,255,255,0.1)' }} />
                    <span style={{ fontSize: '10px', color: '#71717a' }}>{swatch.label}</span>
                    <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#52525b' }}>{swatch.color}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* Footer note */}
      <div style={{ textAlign: 'center', padding: '24px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#52525b', fontSize: '12px' }}>
        Click a palette name above to focus on it. All previews use sample data — actual portal content will be pulled from your Supabase instance.
      </div>
    </div>
  )
}
