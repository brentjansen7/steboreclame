"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Project } from "@/types";

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data || []);
    } catch (error) {
      console.error("Failed to load projects:", error);
    }
    setLoading(false);
  }

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (data) {
        setProjects([data, ...projects]);
        setNewName("");
      }
    } catch (error) {
      console.error("Failed to create project:", error);
    }
    setCreating(false);
  }

  async function deleteProject(id: string) {
    if (!confirm("Weet je zeker dat je dit project wilt verwijderen?")) return;
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects(projects.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  }

  return (
    <div>
      {/* Hero */}
      <section className="mb-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
        <div className="lg:col-span-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-stebo-blue-700)] uppercase mb-3">
            <span className="inline-block w-6 h-px bg-[var(--color-stebo-yellow)] align-middle mr-2" />
            Werkplaats — Krimpen aan den IJssel
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.05] text-[var(--color-stebo-ink)]">
            Folie-calculator,
            <br />
            pand-preview &
            <span className="relative inline-block ml-3">
              snij-workflow
              <span className="absolute -bottom-1 left-0 right-0 h-2 bg-[var(--color-stebo-yellow)] -z-10" />
            </span>
            .
          </h1>
          <p className="mt-5 text-base md:text-lg text-[var(--color-stebo-mute)] max-w-2xl leading-relaxed">
            Upload een ontwerp, bereken folie per kleur, zie het op de gevel,
            en exporteer kant-en-klaar voor de snijplotter — in één tool.
          </p>
        </div>
        <div className="lg:col-span-4 lg:justify-self-end w-full">
          <div className="card p-5 grid grid-cols-3 gap-4">
            <Stat label="Projecten" value={projects.length} />
            <Stat label="Rolbreedtes" value={2} sub="63 / 126 cm" />
            <Stat label="Export" value={3} sub="SVG · HPGL · DXF" />
          </div>
        </div>
      </section>

      {/* Quick create + CTA */}
      <section className="card mb-10 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 p-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5 block">
              Nieuw project starten
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              placeholder="Bijv. Bakkerij De Groot — Gevelreclame"
              className="input-stebo"
            />
          </div>
          <div className="flex md:items-end gap-2">
            <button
              onClick={createProject}
              disabled={creating || !newName.trim()}
              className="btn-primary flex-1 md:flex-none"
            >
              {creating ? "Bezig..." : "Project aanmaken"}
            </button>
            <Link href="/upload" className="btn-yellow flex-1 md:flex-none whitespace-nowrap">
              + Direct uploaden
            </Link>
          </div>
        </div>
      </section>

      {/* Projects list header */}
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="section-title text-2xl">Projecten</h2>
        <span className="text-sm text-[var(--color-stebo-mute)]">
          {loading ? "Laden..." : `${projects.length} ${projects.length === 1 ? "project" : "projecten"}`}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="card h-24 animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-stebo-yellow-50)] mb-4">
            <svg className="w-7 h-7 text-[var(--color-stebo-blue-700)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H6A2.25 2.25 0 013.75 6.75V6zm0 9.75A2.25 2.25 0 016 13.5h2.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H6a2.25 2.25 0 01-2.25-2.25v-1zm10.5-9.75A2.25 2.25 0 0116.5 3.75h2.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H16.5a2.25 2.25 0 01-2.25-2.25V6z" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-[var(--color-stebo-ink)]">Nog geen projecten</p>
          <p className="text-sm text-[var(--color-stebo-mute)] mt-1">
            Maak hierboven een nieuw project aan, of upload direct een ontwerp.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="card p-5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center hover:border-[var(--color-stebo-blue-300)] transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="inline-block w-1.5 h-7 bg-[var(--color-stebo-yellow)] rounded-sm flex-shrink-0" />
                  <h3 className="font-semibold text-lg text-[var(--color-stebo-ink)] truncate">
                    {project.name}
                  </h3>
                </div>
                <div className="flex items-center gap-3 mt-1 ml-[1.125rem] text-sm text-[var(--color-stebo-mute)]">
                  {project.client_name && (
                    <>
                      <span>{project.client_name}</span>
                      <span aria-hidden>·</span>
                    </>
                  )}
                  <span className="font-mono text-xs">
                    {new Date(project.created_at).toLocaleDateString("nl-NL", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-start md:justify-end">
                <ActionLink href={`/upload?projectId=${project.id}`}>Upload</ActionLink>
                <ActionLink href={`/calculator/${project.id}`}>Calculator</ActionLink>
                <ActionLink href={`/preview/${project.id}`}>Preview</ActionLink>
                <Link
                  href={`/cut/${project.id}`}
                  className="px-3 py-1.5 text-sm font-semibold bg-[var(--color-stebo-blue-700)] hover:bg-[var(--color-stebo-blue-800)] text-white rounded-md transition-colors"
                >
                  Snij-workflow →
                </Link>
                <button
                  onClick={() => deleteProject(project.id)}
                  className="px-2 py-1.5 text-[var(--color-stebo-mute)] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Verwijder project"
                  aria-label="Verwijder project"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div>
      <p className="text-3xl font-bold text-[var(--color-stebo-blue-700)] tracking-tight">
        {value}
      </p>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mt-1">
        {label}
      </p>
      {sub && <p className="text-[10px] text-[var(--color-stebo-mute)] mt-0.5 font-mono">{sub}</p>}
    </div>
  );
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-sm font-medium text-[var(--color-stebo-ink)] border border-[var(--color-stebo-line)] hover:border-[var(--color-stebo-blue-700)] hover:text-[var(--color-stebo-blue-700)] rounded-md transition-colors"
    >
      {children}
    </Link>
  );
}
