import { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

export const queueRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // GET / — queue overview with counts
  app.get("/", async () => {
    const queues = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        name,
        policy,
        retry_limit,
        expire_seconds,
        dead_letter,
        created_on,
        updated_on
      FROM pgboss.queue
      WHERE name != '__pgboss__send-it'
      ORDER BY name
    `);

    // Get counts per queue grouped by state
    const counts = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        name,
        state::text as state,
        COUNT(*)::int as count
      FROM pgboss.job
      WHERE name != '__pgboss__send-it'
      GROUP BY name, state
      ORDER BY name, state
    `);

    const countMap: Record<string, Record<string, number>> = {};
    for (const row of counts) {
      if (!countMap[row.name]) {
        countMap[row.name] = { created: 0, retry: 0, active: 0, completed: 0, cancelled: 0, failed: 0 };
      }
      countMap[row.name][row.state] = row.count;
    }

    const data = queues.map((q: any) => ({
      name: q.name,
      policy: q.policy,
      retryLimit: q.retry_limit,
      expireSeconds: q.expire_seconds,
      deadLetter: q.dead_letter,
      createdOn: q.created_on instanceof Date ? q.created_on.toISOString() : q.created_on,
      updatedOn: q.updated_on instanceof Date ? q.updated_on.toISOString() : q.updated_on,
      counts: countMap[q.name] || { created: 0, retry: 0, active: 0, completed: 0, cancelled: 0, failed: 0 },
    }));

    return { data };
  });

  // GET /:name/jobs — list jobs for a specific queue
  app.get<{ Params: { name: string }; Querystring: { state?: string; limit?: string; offset?: string } }>(
    "/:name/jobs",
    async (request) => {
      const { name } = request.params;
      const state = request.query.state;
      const limit = Math.min(parseInt(request.query.limit || "50"), 100);
      const offset = parseInt(request.query.offset || "0");

      const stateFilter = state ? `AND state = '${state}'::pgboss.job_state` : "";

      const jobs = await prisma.$queryRawUnsafe<any[]>(`
        SELECT
          id,
          name,
          state::text as state,
          data,
          output,
          retry_count,
          retry_limit,
          created_on,
          started_on,
          completed_on,
          expire_seconds,
          singleton_key
        FROM pgboss.job
        WHERE name = $1 ${stateFilter}
        ORDER BY created_on DESC
        LIMIT $2 OFFSET $3
      `, name, limit, offset);

      const totalResult = await prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::int as total
        FROM pgboss.job
        WHERE name = $1 ${stateFilter}
      `, name);

      const data = jobs.map((j: any) => ({
        id: j.id,
        name: j.name,
        state: j.state,
        data: j.data,
        output: j.output,
        retryCount: j.retry_count,
        retryLimit: j.retry_limit,
        createdOn: j.created_on instanceof Date ? j.created_on.toISOString() : j.created_on,
        startedOn: j.started_on instanceof Date ? j.started_on.toISOString() : j.started_on,
        completedOn: j.completed_on instanceof Date ? j.completed_on.toISOString() : j.completed_on,
        expireSeconds: j.expire_seconds,
        singletonKey: j.singleton_key,
      }));

      return { data: { jobs: data, total: totalResult[0]?.total || 0 } };
    }
  );
};
