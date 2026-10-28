"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Check,
  User,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { saveSession, setWorkspaceId } from "@/lib/auth";
import { Footer } from "@/components/Footer";

export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Focus states for input styling
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isNameFocused, setIsNameFocused] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/auth/${register ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(register ? { email, password, display_name: name } : { email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Only demo mode may wave a failure through. Signing someone in after
        // the server rejected their credentials is worse than refusing them:
        // every later call fails as 401, and the cause is no longer visible.
        setError(
          typeof data?.detail === "string"
            ? data.detail
            : res.status === 401
              ? "Incorrect email or password."
              : `Sign-in failed (${res.status}).`
        );
        return;
      }

      saveSession(data);

      // A freshly created account may not carry a workspace in the response;
      // every data endpoint needs one, so resolve it before leaving this page.
      if (!data?.workspace?.id) {
        try {
          const wsRes = await fetch(`${API_BASE}/workspaces`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
          });
          const wsBody = await wsRes.json().catch(() => ({}));
          const first = wsBody?.workspaces?.[0];
          if (first?.id) setWorkspaceId(first.id);
        } catch {
          // Leave it unset — the app will prompt rather than guess an id.
        }
      }

      router.push("/");
    } catch {
      setError(
        `Could not reach the API at ${API_BASE}. Start it with: python3 run_api.py`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg, #FBF8F5 0%, #F5EFE9 100%)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Top bar with back to home and demo badge */}
      <header
        style={{
          padding: "20px clamp(16px, 4vw, 40px)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "min(1560px, 96vw)",
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "#6E5B4F",
            textDecoration: "none",
            fontSize: 16,
            fontWeight: 500,
            transition: "color 0.15s ease",
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = "#3D2314")}
          onMouseOut={(e) => (e.currentTarget.style.color = "#6E5B4F")}
        >
          <ArrowLeft size={16} />

        </Link>

      </header>

      {/* Main Centered Sign-In Card Container */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px 48px",
          boxSizing: "border-box",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={{
            width: "100%",
            maxWidth: 480,
            background: "#FFFFFF",
            borderRadius: 28,
            border: "1.5px solid #EDE5DE",
            boxShadow: "0 20px 48px rgba(74, 40, 24, 0.06), 0 4px 16px rgba(0, 0, 0, 0.02)",
            padding: "44px clamp(22px, 5vw, 44px) 38px",
            boxSizing: "border-box",
          }}
        >
          {/* 1. Header with ConceptScape Graph Logo */}
          {/* 1. Official ConceptScape Logo Lockup */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <img
              src="/logo.png"
              alt="ConceptScape - Explore • Connect • Learn"
              style={{
                height: 108,
                width: "auto",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>

          {/* 2. Welcome Back Title */}
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 42,
              fontWeight: 500,
              color: "#2E180D",
              margin: "0 0 12px 0",
              textAlign: "center",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            {register ? "Create your account" : "Welcome back"}
          </h1>

          {/* 3. Subtitle */}
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 16.5,
              color: "#7D6B5D",
              margin: "0 auto 32px auto",
              textAlign: "center",
              lineHeight: 1.48,
              maxWidth: 380,
            }}
          >
            {register
              ? "Start building verified knowledge graphs from your research and documents."
              : "Sign in to keep your documents, graph data, and questions organised in your workspace."}
          </p>

          {/* Mode Selector: Sign in (Existing Account) vs Create Account */}
          <div
            style={{
              display: "flex",
              background: "#F7F2EC",
              padding: 4,
              borderRadius: 14,
              border: "1.5px solid #EAE2DA",
              marginBottom: 24,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setRegister(false);
                setError("");
              }}
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: 10,
                border: "none",
                background: !register ? "#FFFFFF" : "transparent",
                color: !register ? "#3D2314" : "#7D6B5D",
                fontWeight: !register ? 700 : 500,
                fontSize: 15,
                boxShadow: !register ? "0 2px 6px rgba(61, 35, 20, 0.08)" : "none",
                cursor: "pointer",
                transition: "all 0.18s ease",
                fontFamily: "var(--font-sans)",
              }}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => {
                setRegister(true);
                setError("");
              }}
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: 10,
                border: "none",
                background: register ? "#FFFFFF" : "transparent",
                color: register ? "#3D2314" : "#7D6B5D",
                fontWeight: register ? 700 : 500,
                fontSize: 15,
                boxShadow: register ? "0 2px 6px rgba(61, 35, 20, 0.08)" : "none",
                cursor: "pointer",
                transition: "all 0.18s ease",
                fontFamily: "var(--font-sans)",
              }}
            >
              Create Account
            </button>
          </div>

          {/* 4. Form */}
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column" }}>
            {/* Optional Name Field for Registration */}
            {register && (
              <div style={{ marginBottom: 18 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#5A493D",
                    marginBottom: 7,
                  }}
                >
                  Full Name
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "#FFFFFF",
                    border: isNameFocused ? "1.5px solid #B87345" : "1.5px solid #EAE2DA",
                    boxShadow: isNameFocused ? "0 0 0 3px rgba(184, 115, 69, 0.12)" : "none",
                    borderRadius: 14,
                    padding: "0 16px",
                    height: 52,
                    transition: "all 0.18s ease",
                  }}
                >
                  <User
                    size={19}
                    color="#7D6B5D"
                    strokeWidth={1.8}
                    style={{ marginRight: 12, flexShrink: 0 }}
                  />
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onFocus={() => setIsNameFocused(true)}
                    onBlur={() => setIsNameFocused(false)}
                    required
                    style={{
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      width: "100%",
                      fontSize: 16.5,
                      color: "#2E180D",
                      fontFamily: "var(--font-sans)",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Email Field */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#5A493D",
                  marginBottom: 7,
                }}
              >
                Email
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#FFFFFF",
                  border: isEmailFocused ? "1.5px solid #B87345" : "1.5px solid #EAE2DA",
                  boxShadow: isEmailFocused ? "0 0 0 3px rgba(184, 115, 69, 0.12)" : "none",
                  borderRadius: 14,
                  padding: "0 16px",
                  height: 52,
                  transition: "all 0.18s ease",
                }}
              >
                <Mail
                  size={19}
                  color="#7D6B5D"
                  strokeWidth={1.8}
                  style={{ marginRight: 12, flexShrink: 0 }}
                />
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setIsEmailFocused(true)}
                  onBlur={() => setIsEmailFocused(false)}
                  required
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    width: "100%",
                    fontSize: 16.5,
                    color: "#2E180D",
                    fontFamily: "var(--font-sans)",
                  }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#5A493D",
                  marginBottom: 7,
                }}
              >
                Password
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#FFFFFF",
                  border: isPasswordFocused ? "1.5px solid #B87345" : "1.5px solid #EAE2DA",
                  boxShadow: isPasswordFocused ? "0 0 0 3px rgba(184, 115, 69, 0.12)" : "none",
                  borderRadius: 14,
                  padding: "0 16px",
                  height: 52,
                  transition: "all 0.18s ease",
                }}
              >
                <Lock
                  size={19}
                  color="#7D6B5D"
                  strokeWidth={1.8}
                  style={{ marginRight: 12, flexShrink: 0 }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  required
                  minLength={6}
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    width: "100%",
                    fontSize: 16.5,
                    color: "#2E180D",
                    fontFamily: "var(--font-sans)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 4,
                    cursor: "pointer",
                    color: "#7D6B5D",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "color 0.15s ease",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.color = "#3D2314")}
                  onMouseOut={(e) => (e.currentTarget.style.color = "#7D6B5D")}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff size={19} strokeWidth={1.8} />
                  ) : (
                    <Eye size={19} strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message if any */}
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#FDF5F5",
                  border: "1.5px solid #F5C6C6",
                  color: "#B91C1C",
                  fontSize: 14.5,
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            {/* Remember Me & Forgot Password Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 2,
                marginBottom: 24,
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <div
                  onClick={() => setRememberMe(!rememberMe)}
                  style={{
                    width: 19,
                    height: 19,
                    borderRadius: 5,
                    border: rememberMe ? "1.5px solid #3D2314" : "1.5px solid #D6CBC2",
                    background: rememberMe ? "#3D2314" : "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFFFFF",
                    transition: "all 0.15s ease",
                  }}
                >
                  {rememberMe && <Check size={13} strokeWidth={3} />}
                </div>
                <span
                  onClick={() => setRememberMe(!rememberMe)}
                  style={{
                    fontSize: 15.5,
                    color: "#5A493D",
                    fontWeight: 500,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  Remember me
                </span>
              </label>

              <button
                type="button"
                onClick={() =>
                  alert("Password reset link will be sent to your registered email.")
                }
                style={{
                  background: "none",
                  border: "none",
                  color: "#B85D19",
                  fontWeight: 600,
                  fontSize: 15.5,
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "var(--font-sans)",
                  transition: "color 0.15s ease",
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = "#99470F")}
                onMouseOut={(e) => (e.currentTarget.style.color = "#B85D19")}
              >
                Forgot password?
              </button>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                height: 52,
                borderRadius: 9999,
                background: "#3D2314",
                color: "#FFFFFF",
                fontSize: 17.5,
                fontWeight: 600,
                border: "none",
                cursor: busy ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.18s ease",
                boxShadow: "0 4px 14px rgba(61, 35, 20, 0.18)",
                fontFamily: "var(--font-sans)",
              }}
              onMouseOver={(e) => {
                if (!busy) {
                  e.currentTarget.style.background = "#28150B";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 6px 18px rgba(61, 35, 20, 0.28)";
                }
              }}
              onMouseOut={(e) => {
                if (!busy) {
                  e.currentTarget.style.background = "#3D2314";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 14px rgba(61, 35, 20, 0.18)";
                }
              }}
            >
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            </button>
          </form>

          {/* 5. Divider */}
          <div
            style={{
              height: 1,
              background: "#EDE5DE",
              margin: "28px 0 20px 0",
              width: "100%",
            }}
          />

          {/* 6. Switch to Register / Sign in */}
          <div
            style={{
              textAlign: "center",
              fontSize: 15.5,
              color: "#7D6B5D",
              fontFamily: "var(--font-sans)",
            }}
          >
            {register ? "Already have an account? " : "Need an account? "}
            <button
              type="button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#B85D19",
                fontWeight: 600,
                fontSize: 15.5,
                cursor: "pointer",
                padding: 0,
                fontFamily: "var(--font-sans)",
                transition: "color 0.15s ease",
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = "#99470F")}
              onMouseOut={(e) => (e.currentTarget.style.color = "#B85D19")}
            >
              {register ? "Log in to your account" : "Create one"}
            </button>
          </div>
        </motion.div>
      </main>

      {/* Sleek bottom footer */}
      <Footer />
    </div>
  );
}
