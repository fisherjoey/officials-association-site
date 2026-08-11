import { createHandler, supabase, errorResponse } from './_shared/handler'
import type { NormalizedGame } from '../../lib/stats/types'

const CHUNK = 400

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Season Stats ingestion.
 *   POST — accept parsed Arbiter Game Info rows, idempotently upsert by game_id.
 *   GET  — list recent imports.
 */
export const handler = createHandler({
  name: 'stat-imports',
  auth: { GET: 'authenticated', POST: 'admin_or_executive' },
  handler: async ({ event, logger, user }) => {
    switch (event.httpMethod) {
      case 'GET': {
        const { data, error } = await supabase
          .from('stat_game_imports')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) throw error
        return { statusCode: 200, body: JSON.stringify(data) }
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}') as {
          season?: string
          filename?: string
          fileHash?: string
          source?: string
          games?: NormalizedGame[]
          rowCount?: number
        }
        const { season, filename, fileHash } = body
        const games = body.games || []

        if (!season || !filename || !fileHash) {
          return errorResponse({ code: 'invalid_input', message: 'season, filename and fileHash are required.' })
        }
        if (games.length === 0) {
          return errorResponse({ code: 'invalid_input', message: 'No valid game rows were found in the file.' })
        }

        // --- (1) whole-file idempotency: reject an identical re-upload ---
        const { data: dupe, error: dupeErr } = await supabase
          .from('stat_game_imports')
          .select('id, filename, created_at, game_count')
          .eq('file_hash', fileHash)
          .maybeSingle()
        if (dupeErr) throw dupeErr
        if (dupe) {
          return {
            statusCode: 409,
            body: JSON.stringify({
              error: 'This exact file has already been imported.',
              alreadyImported: true,
              existing: dupe,
            }),
          }
        }

        const assignmentCount = games.reduce((a, g) => a + (g.assignmentCount || 0), 0)

        // --- (2) create the import record ---
        const { data: imp, error: impErr } = await supabase
          .from('stat_game_imports')
          .insert([
            {
              filename,
              file_hash: fileHash,
              source: body.source || 'game_info',
              season,
              row_count: body.rowCount ?? games.length,
              game_count: games.length,
              assignment_count: assignmentCount,
              status: 'partial',
              uploaded_by: user!.id,
              uploaded_by_email: user!.email,
            },
          ])
          .select()
          .single()
        if (impErr) throw impErr
        const importId = imp.id

        // --- (3) inserted vs updated: check which game_ids already exist ---
        const ids = games.map((g) => g.gameId)
        const existing = new Set<number>()
        for (const part of chunk(ids, CHUNK)) {
          const { data, error } = await supabase.from('stat_games').select('game_id').in('game_id', part)
          if (error) throw error
          for (const row of data || []) existing.add(Number(row.game_id))
        }
        const insertedCount = ids.filter((id) => !existing.has(id)).length
        const updatedCount = ids.length - insertedCount

        // --- (4) row-level idempotency: upsert ON CONFLICT (game_id) ---
        const rows = games.map((g) => ({
          game_id: g.gameId,
          season,
          game_date: g.gameDate,
          game_time: g.gameTime,
          status: g.status || 'Normal',
          site_name: g.siteName,
          sub_site_name: g.subSiteName,
          bill_to_name: g.billToName,
          sport_name: g.sportName,
          level_name: g.levelName,
          home_teams: g.homeTeams,
          away_teams: g.awayTeams,
          officials: g.officials || [],
          assignment_count: g.assignmentCount || 0,
          import_id: importId,
        }))
        for (const part of chunk(rows, CHUNK)) {
          const { error } = await supabase.from('stat_games').upsert(part, { onConflict: 'game_id' })
          if (error) throw error
        }

        // --- (5) which orgs in this file have no mapping yet? ---
        const { data: maps, error: mapErr } = await supabase.from('stat_org_mappings').select('bill_to_name')
        if (mapErr) throw mapErr
        const mapped = new Set((maps || []).map((m) => m.bill_to_name))
        const unmappedOrgs = [...new Set(games.map((g) => g.billToName).filter((o): o is string => !!o && !mapped.has(o)))].sort()

        await supabase
          .from('stat_game_imports')
          .update({ status: 'completed', inserted_count: insertedCount, updated_count: updatedCount })
          .eq('id', importId)

        await logger.audit('CREATE', 'stat_import', importId, {
          actorId: user!.id,
          actorEmail: user!.email,
          newValues: { filename, season, inserted: insertedCount, updated: updatedCount },
          description: `Imported ${games.length} games (${insertedCount} new, ${updatedCount} updated) for ${season}`,
        })

        return {
          statusCode: 201,
          body: JSON.stringify({
            importId,
            season,
            gameCount: games.length,
            assignmentCount,
            insertedCount,
            updatedCount,
            unmappedOrgs,
          }),
        }
      }

      default:
        return errorResponse({ code: 'method_not_allowed' })
    }
  },
})
