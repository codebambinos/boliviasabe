/**
 * Links a profile as a partner business and adds or updates one of its offers (SPEC 29, wiki #219).
 * The owner signs up in the app first (normal account, welcome +5, ready Stellar account); this script only links it.
 * Idempotent: the partner is matched by profile and the offer by partner + title, so running it again updates the
 * name, city, zone, cost or active flag instead of adding duplicates.
 *
 *   npm run partner:add -- --profile <id> --name "Pensión Doña Rosa" --city Cochabamba --zone Centro \
 *     --offer "Un refresco gratis con tu almuerzo" --cost 10 [--inactive] [--featured-days N] [--dry-run]
 *
 * `--featured-days N` puts the partner in Hoy's «Destacados» for N days from now (SPEC 30, wiki #220); `0` clears it.
 * Without it, the featured period stays as it was.
 *
 * `--profile` also accepts the owner's e-mail.
 */
import { parseArgs } from 'node:util';
import { adminClient } from '../../lib/supabase/server.ts';

const CITIES = ['Cochabamba', 'La Paz', 'El Alto', 'Santa Cruz', 'Oruro', 'Potosí', 'Sucre', 'Tarija', 'Trinidad', 'Cobija'];

const { values } = parseArgs({
  options: {
    profile: { type: 'string' },
    name: { type: 'string' },
    city: { type: 'string' },
    zone: { type: 'string' },
    offer: { type: 'string' },
    cost: { type: 'string' },
    inactive: { type: 'boolean', default: false },
    'featured-days': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const name = values.name?.trim() ?? '';
const city = values.city?.trim() ?? '';
const zone = values.zone?.trim() ?? '';
const title = values.offer?.trim() ?? '';
const cost = Number(values.cost);
if (!values.profile) fail('Missing --profile <id or e-mail>');
if (name.length < 2 || name.length > 60) fail('--name must have 2 to 60 characters');
if (!CITIES.includes(city)) fail(`--city must be one of: ${CITIES.join(', ')}`);
if (!zone) fail('Missing --zone');
if (title.length < 3 || title.length > 80) fail('--offer must have 3 to 80 characters');
if (!Number.isInteger(cost) || cost < 1 || cost > 1000) fail('--cost must be a whole number from 1 to 1000');
const featuredDays = values['featured-days'] === undefined ? null : Number(values['featured-days']);
if (featuredDays !== null && (!Number.isInteger(featuredDays) || featuredDays < 0 || featuredDays > 365)) {
  fail('--featured-days must be a whole number from 0 to 365');
}
/** undefined: leave the period as it is; null: clear it. */
const featuredUntil =
  featuredDays === null ? undefined : featuredDays === 0 ? null : new Date(Date.now() + featuredDays * 86_400_000).toISOString();

async function main() {
  const db = adminClient();
  const ref = values.profile!.trim();

  let profileId: number;
  if (/^\d+$/.test(ref)) {
    profileId = Number(ref);
  } else {
    const { data: users, error } = await db.auth.admin.listUsers({ perPage: 1000 });
    if (error) fail(`Could not list users: ${error.message}`);
    const user = users.users.find((u) => u.email?.toLowerCase() === ref.toLowerCase());
    if (!user) fail(`No account with the e-mail ${ref}`);
    const { data, error: profileError } = await db.from('profiles').select('id').eq('auth_id', user.id).maybeSingle();
    if (profileError) fail(profileError.message);
    if (!data) fail(`${ref} has no profile yet: they must finish «Tu barrio» in the app first`);
    profileId = data.id;
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, display_name, stellar_status')
    .eq('id', profileId)
    .maybeSingle();
  if (profileError) fail(profileError.message);
  if (!profile) fail(`Profile ${profileId} does not exist`);
  if (profile.stellar_status !== 'ready') fail(`Profile ${profileId} has no ready Stellar account yet (status ${profile.stellar_status})`);

  console.log(`Profile ${profile.id} (${profile.display_name}) → partner «${name}», ${zone}, ${city}`);
  console.log(`Offer «${title}» · ${cost} yapitas · ${values.inactive ? 'inactive' : 'active'}`);
  if (featuredUntil !== undefined) console.log(featuredUntil ? `Featured until ${featuredUntil}` : 'Featured period cleared');
  if (values['dry-run']) {
    console.log('Dry run: nothing written.');
    return;
  }

  const { data: partner, error: partnerError } = await db
    .from('partners')
    .upsert(
      { profile_id: profileId, name, city, zone, ...(featuredUntil !== undefined && { featured_until: featuredUntil }) },
      { onConflict: 'profile_id' },
    )
    .select('id')
    .single<{ id: number }>();
  if (partnerError) fail(`partners: ${partnerError.message}`);

  const { data: offer, error: offerError } = await db
    .from('offers')
    .upsert({ partner_id: partner.id, title, cost, active: !values.inactive }, { onConflict: 'partner_id,title' })
    .select('id')
    .single<{ id: number }>();
  if (offerError) fail(`offers: ${offerError.message}`);

  console.log(`✓ Partner ${partner.id}, offer ${offer.id}`);
}

main().catch((error: Error) => fail(error.message));
