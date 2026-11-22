import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { deleteTask, listTasks, setTaskDone, updateTask, type TaskInput } from '@/lib/data/tasks';
import { requireApiUser } from '@/lib/auth/server';

/** { done } ticks it off or reopens it (anyone on the deal); otherwise edits it (its creator or an admin). */
export async function PATCH(req: Request, { params }: { params: { id: string; tid: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const qid = idParam(params.id);
    const b = (await req.json()) as TaskInput & { done?: boolean };
    if (typeof b.done === 'boolean') await setTaskDone(db, qid, idParam(params.tid), b.done, u);
    else await updateTask(db, qid, idParam(params.tid), b, u);
    return NextResponse.json({ tasks: await listTasks(db, qid, u) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; tid: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const qid = idParam(params.id);
    await deleteTask(db, qid, idParam(params.tid), u);
    return NextResponse.json({ tasks: await listTasks(db, qid, u) });
  } catch (e) {
    return jsonError(e);
  }
}
