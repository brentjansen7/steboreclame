import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json(data || []);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("GET /api/projects error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name?.trim()) {
      return Response.json({ error: "Name required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    console.error("POST /api/projects error:", error);
    return Response.json({ error: "Failed to create project" }, { status: 500 });
  }
}
