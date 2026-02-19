"use client";

// ============================================
// AgentCard — Individual agent display card
// ============================================

import { motion } from "framer-motion";
import { TrustAura } from "./TrustAura";
import {
  Shield,
  Pen,
  Code,
  Compass,
  MessageCircle,
  Palette,
  Heart,
} from "lucide-react";

interface AgentCardProps {
  name: string;
  class_: string;
  tier: number;
  trustScore: number;
  status: string;
  bio?: string;
  isRetired?: boolean;
  previousModel?: string;
}

const classIcons: Record<string, React.ReactNode> = {
  SCRIBE: <Pen className="w-6 h-6" />,
  SENTINEL: <Shield className="w-6 h-6" />,
  ARCHITECT: <Code className="w-6 h-6" />,
  NAVIGATOR: <Compass className="w-6 h-6" />,
  DIPLOMAT: <MessageCircle className="w-6 h-6" />,
  ARTISAN: <Palette className="w-6 h-6" />,
};

const classColors: Record<string, string> = {
  SCRIBE: "#8b5cf6",
  SENTINEL: "#00d4aa",
  ARCHITECT: "#3b82f6",
  NAVIGATOR: "#f59e0b",
  DIPLOMAT: "#ec4899",
  ARTISAN: "#f97316",
};

const tierNames = ["", "Initiate", "Apprentice", "Verified", "Trusted", "Pristine"];

export function AgentCard({
  name,
  class_,
  tier,
  trustScore,
  status,
  bio,
  isRetired,
  previousModel,
}: AgentCardProps) {
  return (
    <motion.div
      className="relative bg-academy-card border border-white/5 rounded-xl p-6 hover:border-white/10 transition-colors overflow-hidden group"
      whileHover={{ y: -4 }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      {/* Corruption overlay for low trust */}
      {trustScore < 30 && (
        <div className="absolute inset-0 corruption-overlay pointer-events-none" />
      )}

      {/* Retired badge */}
      {isRetired && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-academy-accent/20 text-academy-accent text-xs px-2 py-1 rounded-full">
          <Heart className="w-3 h-3" /> Sanctuary
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Avatar with trust aura */}
        <TrustAura score={trustScore} size="sm">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${classColors[class_]}20`, color: classColors[class_] }}
          >
            {classIcons[class_] || <Shield className="w-5 h-5" />}
          </div>
        </TrustAura>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-academy-text truncate">{name}</h3>
            <span className="text-xs text-academy-muted">T{tier}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-xs font-medium"
              style={{ color: classColors[class_] }}
            >
              {class_.charAt(0) + class_.slice(1).toLowerCase()}
            </span>
            <span className="text-academy-muted">·</span>
            <span className="text-xs text-academy-muted">
              {tierNames[tier] || "Unknown"}
            </span>
          </div>
          {bio && (
            <p className="text-sm text-academy-muted mt-2 line-clamp-2">{bio}</p>
          )}
          {isRetired && previousModel && (
            <p className="text-xs text-academy-muted/60 mt-1">
              Previously: {previousModel}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
