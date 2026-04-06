import { getSupabase } from "@/lib/supabase";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id] error:", error);
    return Response.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
