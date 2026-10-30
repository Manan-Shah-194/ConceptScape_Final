"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Network, Sparkles, Bell, ChevronDown, LogOut, LogIn, User, Pencil } from "lucide-react";
import { clearSession, getToken, getUserProfile, type UserProfile } from "@/lib/auth";
import { EditProfileModal } from "@/components/EditProfileModal";
import { listNotifications, respondToNotification, type NotificationItem } from "@/lib/api";

export function Navbar({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [profile, setProfile] = useState<UserProfile>(getUserProfile());

  useEffect(() => {
    setSignedIn(Boolean(getToken()));
    setProfile(getUserProfile());
    if (getToken()) listNotifications().then(setNotifications).catch(() => setNotifications([]));

    const handleProfileUpdate = (e: Event) => {
      const detail = (e as CustomEvent<UserProfile>).detail;
      if (detail) {
        setProfile(detail);
      } else {
        setProfile(getUserProfile());
      }
    };

    window.addEventListener("conceptscape:profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("conceptscape:profile-updated", handleProfileUpdate);
  }, []);

  const navs = [
    { name: "Home", path: "/" },
    { name: "Graph", path: "/graph" },
    { name: "Ask", path: "/chat" },
    { name: "Documents", path: "/upload" },
    { name: "Workspace", path: "/workspace" },
    { name: "Learn", path: "/learn" },
    { name: "Progress", path: "/progress" },
  ];

  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/" className="title-area" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <img
            src="/logo-mark.png"
            alt="ConceptScape"
            style={{
              height: 32,
              width: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
          <span className="title" style={{ fontSize: 24 }}>ConceptScape</span>
        </Link>
      </div>

      <nav className="nav-inline">
        {navs.map((n) => {
          const isActive = pathname === n.path;
          return (
            <Link key={n.path} href={n.path} className={`nav-link ${isActive ? "active" : ""}`}>
              {n.name}
              {isActive && (
                <motion.div
                  layoutId="navbar-indicator"
                  className="nav-indicator"
                  style={{ background: "#4A2818" }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="nav-right" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {rightSlot}

        {/* Notifications Bell */}
        <div style={{ position: "relative" }}>
        <button
          onClick={() => setShowNotifications((value) => !value)}
          className="bell-hover interactive-btn"
          style={{
            background: "transparent",
            border: "none",
            color: "#555555",
            cursor: "pointer",
            padding: 6,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Notifications"
        >
          <Bell size={17} />
          {notifications.some((item) => item.status === "unread") && <span style={{ position: "absolute", top: 2, right: 2, width: 7, height: 7, borderRadius: "50%", background: "#C74747" }} />}
        </button>
        {showNotifications && <div style={{ position: "absolute", right: 0, top: 42, width: 340, maxHeight: 420, overflowY: "auto", background: "#FFFFFF", border: "1px solid #EAE4DE", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.15)", padding: 10, zIndex: 50 }}>
          {notifications.length === 0 ? <div style={{ padding: 14, color: "#77716D" }}>No notifications</div> : notifications.map((item) => {
            const invite = item.kind === "workspace_invite";
            const result = item.kind === "workspace_invite_result";
            return <div key={item.id} style={{ padding: 12, borderBottom: "1px solid #F3ECE6" }}>
              <div style={{ fontSize: 14, color: "#2D1E15", marginBottom: 8 }}>
                {invite && `${item.payload.inviter_name || "A user"} wants to add you to ${item.payload.workspace_name || "a workspace"}.`}
                {result && `${item.payload.user_name || "A user"} ${item.payload.decision === "accept" ? "accepted and joined" : "declined"} ${item.payload.workspace_name || "your workspace"}.`}
              </div>
              {invite && item.status === "unread" && <div style={{ display: "flex", gap: 8 }}><button onClick={async () => { await respondToNotification(item.id, "accept"); setNotifications((prev) => prev.map((n) => n.id === item.id ? { ...n, status: "accepted" } : n)); }} style={{ background: "#4A3024", color: "white", border: 0, borderRadius: 6, padding: "6px 10px" }}>Accept</button><button onClick={async () => { await respondToNotification(item.id, "decline"); setNotifications((prev) => prev.map((n) => n.id === item.id ? { ...n, status: "declined" } : n)); }} style={{ background: "#FFFFFF", color: "#4A3024", border: "1px solid #D8C8BD", borderRadius: 6, padding: "6px 10px" }}>Decline</button></div>}
            </div>;
          })}
        </div>}
        </div>

        {/* User Account / Log In Option */}
        {signedIn ? (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="interactive-btn"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px",
                borderRadius: 9999,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: profile.avatarColor || "#4A2818",
                  color: "#FFFFFF",
                  fontSize: 16,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {(profile.shortName || profile.fullName || "N").trim().charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 16.5, fontWeight: 600, color: "#111111", fontFamily: "var(--font-sans)" }}>
                {profile.shortName || profile.fullName.split(" ")[0] || profile.email.split("@")[0] || "Account"}
              </span>
              <ChevronDown
                size={14}
                color="#666666"
                style={{
                  transform: showUserMenu ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -6 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    background: "#FFFFFF",
                    border: "1px solid #E8E8E8",
                    borderRadius: 12,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                    padding: "8px 0",
                    minWidth: 190,
                    zIndex: 100,
                  }}
                >
                  <div style={{ padding: "8px 14px", borderBottom: "1px solid #EFEFEF" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#111111" }}>{profile.fullName}</div>
                    <div style={{ fontSize: 14, color: "#666666" }}>{profile.email}</div>
                  </div>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowEditProfile(true);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 14px",
                      fontSize: 15,
                      color: "#4A2818",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      boxSizing: "border-box",
                      transition: "background 0.12s",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "#FAF7F5")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Pencil size={14} />
                    Edit profile
                  </button>

                  <Link
                    href="/login"
                    onClick={() => {
                      clearSession();
                      setSignedIn(false);
                      setShowUserMenu(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 14px",
                      fontSize: 15,
                      color: "#4A2818",
                      textDecoration: "none",
                      boxSizing: "border-box",
                      transition: "background 0.12s",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "#FAF7F5")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <User size={14} />
                    Switch account
                  </Link>

                  <button
                    onClick={() => {
                      clearSession();
                      setSignedIn(false);
                      setShowUserMenu(false);
                      router.push("/login");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 14px",
                      fontSize: 15,
                      color: "#D32F2F",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.12s",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "#FDF5F5")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <LogOut size={13} />
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <Link
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 18px",
              borderRadius: 9999,
              background: "#4A2818",
              color: "#FFFFFF",
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              transition: "all 0.15s ease",
              boxShadow: "0 2px 8px rgba(74, 40, 24, 0.15)",
              whiteSpace: "nowrap",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#361D11";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#4A2818";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <LogIn size={14} />
            Log in
          </Link>
        )}
      </div>

      <EditProfileModal
        isOpen={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        onProfileUpdated={(updated) => setProfile(updated)}
      />
    </div>
  );
}
