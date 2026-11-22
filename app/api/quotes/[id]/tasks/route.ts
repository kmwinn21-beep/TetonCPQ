import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { createTask, dealPeople, listTasks, type TaskInput } from '@/lib/data/tasks';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote } from '@/lib/data/access';

/** The deal's tasks, the people who can be assigned (owner and collaborators), and the viewer. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const qid = idParam(params.id);
    const a = await accessForQuote(db, qid, u);
    const [tasks, people] = await Promise.all([listTasks(db, qid, u), dealPeople(db, a.dealId)]);
    const canWork = a.isAdmin || people.some((p) => p.id === u.id);
    return NextResponse.json({ tasks, people, me: u.id, canWork }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const qid = idParam(params.id);
    const id = await createTask(db, qid, (await req.json()) as TaskInput, u);
    return NextResponse.json({ id, tasks: await listTasks(db, qid, u) });
  } catch (e) {
    return jsonError(e);
  }
}
