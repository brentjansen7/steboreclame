"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
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
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    setProjects(data || []);
    setLoading(false);
  }

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    const { data } = await supabase
      .from("projects")
      .insert({ name: newName.trim() })
      .select()
      .single();
    if (data) {
      setProjects([data, ...projects]);
      setNewName("");
    }
    setCreating(false);
  }

  async function deleteProject(id: string) {
    if (!confirm("Weet je zeker dat je dit project wilt verwijderen?")) return;
    await supabase.from("projects").delete().eq("id", id);
    setProjects(projects.filter((p) => p.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Projecten</h1>
        <Link
          href="/upload"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Nieuw ontwerp
        </Link>
      </div>

      {/* Quick create */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProject()}
            placeholder="Projectnaam (bijv. Bakkerij De Groot - Gevelreclame)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={createProject}
            disabled={creating || !newName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Aanmaken
          </button>
        </div>
      </div>

      {/* Projects list */}
      {loading ? (
        <p className="text-gray-500">Laden...</p>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">Nog geen projecten</p>
          <p className="text-sm mt-1">
            Maak een nieuw project aan of upload een ontwerp
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center justify-between"
            >
              <div>
                <h3 className="font-semibold text-lg">{project.name}</h3>
                {project.client_name && (
                  <p className="text-sm text-gray-500">
                    {project.client_name}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(project.created_at).toLocaleDateString("nl-NL")}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/upload?projectId=${project.id}`}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Upload
                </Link>
                <Link
                  href={`/calculator/${project.id}`}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Calculator
                </Link>
                <Link
                  href={`/preview/${project.id}`}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Preview
                </Link>
                <Link
                  href={`/cut/${project.id}`}
                  className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                >
                  Snij-workflow
                </Link>
                <button
                  onClick={() => deleteProject(project.id)}
                  className="px-3 py-1.5 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                >
                  Verwijder
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
