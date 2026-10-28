"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, User, Mail, Building, Briefcase, FileText, Palette, Sparkles } from "lucide-react";
import { type UserProfile, getUserProfile, saveUserProfile } from "@/lib/auth";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (updated: UserProfile) => void;
}

const AVATAR_COLORS = [
  { name: "Espresso", value: "#4A2818" },
  { name: "Warm Bronze", value: "#8C5E3B" },
  { name: "Amber Earth", value: "#B87345" },
  { name: "Slate Navy", value: "#2A3A4A" },
  { name: "Forest Sage", value: "#2E523A" },
];

export function EditProfileModal({ isOpen, onClose, onProfileUpdated }: EditProfileModalProps) {
  const [formData, setFormData] = useState<UserProfile>(getUserProfile());
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync initial state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData(getUserProfile());
      setSavedSuccess(false);
    }
  }, [isOpen]);

  // Handle ESC key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedFull = formData.fullName.trim();
    const trimmedShort = formData.shortName.trim() || trimmedFull.split(" ")[0];
    const trimmedEmail = formData.email.trim();

    const updated: UserProfile = {
      ...formData,
      fullName: trimmedFull,
      shortName: trimmedShort,
      email: trimmedEmail,
    };

    saveUserProfile(updated);
    setFormData(updated);
    setSavedSuccess(true);
    if (onProfileUpdated) onProfileUpdated(updated);

    // Auto close after brief confirmation
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 650);
  };

  const initialLetter = (formData.shortName || formData.fullName || "N").trim().charAt(0).toUpperCase();

  return (
    <AnimatePresence>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          backgroundColor: "rgba(28, 20, 16, 0.48)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 540,
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            background: "#FFFFFF",
            borderRadius: 20,
            border: "1px solid #EADBCE",
            boxShadow: "0 24px 60px rgba(74, 40, 24, 0.18), 0 8px 24px rgba(0, 0, 0, 0.08)",
            overflow: "hidden",
            fontFamily: "var(--font-sans)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div
            style={{
              padding: "20px 24px 18px",
              borderBottom: "1px solid #F0E8E0",
              background: "linear-gradient(180deg, #FDFBF9 0%, #FAF5F0 100%)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(74, 40, 24, 0.08)",
                    color: "#4A2818",
                  }}
                >
                  <Sparkles size={13} />
                </span>
                <h2
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#2C1810",
                    margin: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Edit Profile
                </h2>
              </div>
              <p
                style={{
                  fontSize: 13.5,
                  color: "#7D695B",
                  margin: "4px 0 0",
                  lineHeight: 1.4,
                }}
              >
                Customize your researcher identity, personal details, and display preferences.
              </p>
            </div>

            <button
              onClick={onClose}
              className="interactive-btn"
              style={{
                background: "transparent",
                border: "none",
                borderRadius: "50%",
                padding: 6,
                cursor: "pointer",
                color: "#7D695B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "#EFE6DD";
                e.currentTarget.style.color = "#2C1810";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#7D695B";
              }}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Content */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: "22px 24px 24px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {/* Avatar & Navbar Preview Strip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                background: "#FBF7F4",
                borderRadius: 14,
                border: "1px solid #EFE4DC",
                flexWrap: "wrap",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: formData.avatarColor || "#4A2818",
                    color: "#FFFFFF",
                    fontSize: 22,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(74, 40, 24, 0.2)",
                    transition: "background 0.2s ease",
                  }}
                >
                  {initialLetter}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#2C1810" }}>Avatar Color</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    {AVATAR_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, avatarColor: c.value })}
                        title={c.name}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: c.value,
                          border: formData.avatarColor === c.value ? "2.5px solid #FFFFFF" : "1.5px solid transparent",
                          outline: formData.avatarColor === c.value ? `2px solid ${c.value}` : "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                          transition: "transform 0.15s ease",
                        }}
                      >
                        {formData.avatarColor === c.value && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Navbar Pill Live Preview */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#8E7A6C", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Navbar Pill Preview
                </span>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "3px 10px 3px 5px",
                    background: "#FFFFFF",
                    borderRadius: 9999,
                    border: "1.5px solid #2563EB",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: formData.avatarColor || "#4A2818",
                      color: "#FFFFFF",
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {initialLetter}
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "#111111" }}>
                    {formData.shortName || formData.fullName.split(" ")[0] || "\u2014"}
                  </span>
                </div>
              </div>
            </div>

            {/* Inputs Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#4A2818",
                    marginBottom: 5,
                  }}
                >
                  <User size={13} />
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Your full name"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    fontSize: 14,
                    borderRadius: 8,
                    border: "1px solid #D8C8BD",
                    background: "#FAFAFA",
                    color: "#1C1917",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#4A2818";
                    e.currentTarget.style.boxShadow = "0 0 0 2px rgba(74, 40, 24, 0.1)";
                    e.currentTarget.style.background = "#FFFFFF";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#D8C8BD";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#4A2818",
                    marginBottom: 5,
                  }}
                >
                  <User size={13} />
                  Short / Display Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.shortName}
                  onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                  placeholder="What we should call you"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    fontSize: 14,
                    borderRadius: 8,
                    border: "1px solid #D8C8BD",
                    background: "#FAFAFA",
                    color: "#1C1917",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#4A2818";
                    e.currentTarget.style.boxShadow = "0 0 0 2px rgba(74, 40, 24, 0.1)";
                    e.currentTarget.style.background = "#FFFFFF";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#D8C8BD";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#4A2818",
                  marginBottom: 5,
                }}
              >
                <Mail size={13} />
                Email Address
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@example.com"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  fontSize: 14,
                  borderRadius: 8,
                  border: "1px solid #D8C8BD",
                  background: "#FAFAFA",
                  color: "#1C1917",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#4A2818";
                  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(74, 40, 24, 0.1)";
                  e.currentTarget.style.background = "#FFFFFF";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#D8C8BD";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Role & Institution */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#4A2818",
                    marginBottom: 5,
                  }}
                >
                  <Briefcase size={13} />
                  Academic Role
                </label>
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  placeholder="e.g. Knowledge Explorer"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    fontSize: 14,
                    borderRadius: 8,
                    border: "1px solid #D8C8BD",
                    background: "#FAFAFA",
                    color: "#1C1917",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#4A2818";
                    e.currentTarget.style.boxShadow = "0 0 0 2px rgba(74, 40, 24, 0.1)";
                    e.currentTarget.style.background = "#FFFFFF";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#D8C8BD";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#4A2818",
                    marginBottom: 5,
                  }}
                >
                  <Building size={13} />
                  Institution / Org
                </label>
                <input
                  type="text"
                  value={formData.institution}
                  onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                  placeholder="e.g. ConceptScape Lab"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    fontSize: 14,
                    borderRadius: 8,
                    border: "1px solid #D8C8BD",
                    background: "#FAFAFA",
                    color: "#1C1917",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#4A2818";
                    e.currentTarget.style.boxShadow = "0 0 0 2px rgba(74, 40, 24, 0.1)";
                    e.currentTarget.style.background = "#FFFFFF";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#D8C8BD";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#4A2818",
                  marginBottom: 5,
                }}
              >
                <FileText size={13} />
                Research Interests / Bio
              </label>
              <textarea
                rows={2}
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Brief summary of your learning or research interests..."
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  fontSize: 13.5,
                  borderRadius: 8,
                  border: "1px solid #D8C8BD",
                  background: "#FAFAFA",
                  color: "#1C1917",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  resize: "vertical",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#4A2818";
                  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(74, 40, 24, 0.1)";
                  e.currentTarget.style.background = "#FFFFFF";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#D8C8BD";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Success alert */}
            {savedSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "#EDF7ED",
                  color: "#1E4620",
                  fontSize: 13.5,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Check size={16} />
                Profile updated successfully!
              </motion.div>
            )}

            {/* Footer Buttons */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 12,
                marginTop: 6,
                paddingTop: 16,
                borderTop: "1px solid #F0E8E0",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  background: "transparent",
                  border: "1px solid #D8C8BD",
                  color: "#5C4638",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.12s, color 0.12s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#F5EFE9";
                  e.currentTarget.style.color = "#2C1810";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#5C4638";
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 22px",
                  borderRadius: 8,
                  background: "#4A2818",
                  color: "#FFFFFF",
                  border: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(74, 40, 24, 0.25)",
                  transition: "background 0.15s, transform 0.12s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#5F3420")}
                onMouseOut={(e) => (e.currentTarget.style.background = "#4A2818")}
              >
                <Check size={15} />
                Save Changes
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
