"use client";

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { createSubject, deleteSubject, listSubjects, type Subject } from "@/lib/api";
import { getSubjectId, setSubjectId } from "@/lib/auth";

export function SubjectSelector({ onChange, manage = false, compact = false }: { onChange?: () => void; manage?: boolean; compact?: boolean }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const items = await listSubjects();
      setSubjects(items);
      const saved = getSubjectId();
      if (saved && items.some((item) => item.id === saved)) setSelected(saved);
      else if (items.length === 1) { setSelected(items[0].id); setSubjectId(items[0].id); }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load subjects."); }
  };

  useEffect(() => { load(); }, []);

  const choose = (id: string) => {
    setSelected(id);
    setSubjectId(id || null);
    onChange?.();
  };

  const create = async () => {
    if (!newName.trim()) return;
    try {
      const item = await createSubject(newName.trim());
      setNewName("");
      setSubjects((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
      choose(item.id);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create subject."); }
  };

  const remove = async () => {
    const item = subjects.find((subject) => subject.id === selected);
    if (!item || !confirm(`Delete subject '${item.name}'? It must be empty first.`)) return;
    try {
      await deleteSubject(item.id);
      const remaining = subjects.filter((subject) => subject.id !== item.id);
      setSubjects(remaining);
      choose(remaining[0]?.id || "");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete subject."); }
  };

  return (
    <section style={{ display: compact ? "inline-block" : "block", width: compact ? "fit-content" : undefined, maxWidth: "100%", marginBottom: compact ? 18 : 20, padding: compact ? "7px 10px" : "14px 18px", border: "1px solid #E8DDD5", borderRadius: compact ? 10 : 14, background: "#FFFCFA", boxShadow: compact ? "0 2px 8px rgba(33, 79, 64, 0.08)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Layers size={20} color="#B87345" />
        {!compact && <div style={{ flex: "1 1 220px" }}>
          <div style={{ color: "#4A2818", fontWeight: 700, fontSize: 18 }}>Subject</div>
          <div style={{ color: "#77716D", fontSize: 14 }}>Choose the subject for this page.</div>
        </div>}
        <select aria-label="Select subject" value={selected} onChange={(event) => choose(event.target.value)} style={{ minWidth: 180, padding: "8px 10px", borderRadius: 8, border: "1px solid #D8C8BD", background: "#FFFFFF" }}>
          <option value="">All subjects</option>
          {subjects.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.document_count ?? 0})</option>)}
        </select>
        {manage && <>
          <button onClick={remove} disabled={!selected} style={{ padding: "8px 11px", borderRadius: 8, border: "1px solid #E2B8B8", background: selected ? "#FFF5F5" : "#F7F3F0", color: selected ? "#991B1B" : "#A99B92", cursor: selected ? "pointer" : "not-allowed" }}>Delete</button>
          <input value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") create(); }} placeholder="New subject" style={{ width: 145, padding: "8px 10px", borderRadius: 8, border: "1px solid #D8C8BD" }} />
          <button onClick={create} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#4A3024", color: "#FFFFFF", cursor: "pointer" }}>Create</button>
        </>}
      </div>
      {error && <div style={{ marginTop: 8, color: "#B91C1C", fontSize: 13 }}>{error}</div>}
    </section>
  );
}
