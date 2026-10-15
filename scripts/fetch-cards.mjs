import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'public/images/cards';
await mkdir(directory, { recursive: true });
await mkdir('public/fonts', { recursive: true });
await mkdir('src/data', { recursive: true });
const definitions = [
  ['Ragavan, Nimble Pilferer','mh2',4990,6,true,['Modern favourites']],
  ['The One Ring','ltr',8990,4,true,['Commander staples']],
  ['Sheoldred, the Apocalypse','dmu',7490,3,true,['Modern favourites','Commander staples']],
  ['Orcish Bowmasters','ltr',3990,8,true,['Modern favourites','Commander staples']],
  ['Esper Sentinel','mh2',3490,12,true,['Commander staples']],
  ['Sol Ring','cmm',350,24,true,['Commander staples','Under $5']],
  ['Lightning Bolt','m11',250,20,false,['Modern favourites','Under $5']],
  ['Cyclonic Rift','cmm',4490,5,false,['Commander staples']],
  ['Swords to Plowshares','cmm',290,16,false,['Commander staples','Under $5']],
  ["Teferi's Protection",'2x2',4990,4,false,['Commander staples']],
  ['Valley Questcaller','blb',390,9,false,['New arrivals','Under $5']],
  ['Bristly Bill, Spine Sower','otj',2290,6,false,['Commander staples']],
  ['Ulamog, the Defiler','mh3',3990,3,false,['New arrivals','Commander staples']],
  ['Psychic Frog','mh3',2490,8,false,['Modern favourites','New arrivals']],
  ['Overlord of the Hauntwoods','dsk',1990,7,false,['New arrivals']],
  ['Kaito, Bane of Nightmares','dsk',1290,8,false,['New arrivals']],
  ['Llanowar Elves','fdn',90,28,false,['Under $5','New arrivals']],
  ['Quilled Greatwurm','fdn',390,13,false,['Under $5','New arrivals']],
];
const headers = { 'User-Agent': 'ManaVaultStore/1.0 (independent card catalogue)', 'Accept': 'application/json' };
async function download(url, path) { const res = await fetch(url, { headers: { 'User-Agent': 'ManaVaultStore/1.0 (independent card catalogue)' } }); if (!res.ok) throw new Error(`Asset ${res.status}: ${url}`); await writeFile(path, Buffer.from(await res.arrayBuffer())); }
const cards = [];
for (const [name,set,price,quantity,featured,categories] of definitions) {
  await new Promise(r => setTimeout(r, 650));
  const response = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&set=${set}`, { headers });
  const card = await response.json();
  if (!response.ok) throw new Error(`${name}: ${card.details}`);
  const image = card.image_uris || card.card_faces?.[0]?.image_uris;
  const filename = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await download(image.normal, `${directory}/${filename}.jpg`);
  await download(image.art_crop, `${directory}/${filename}-art.jpg`);
  cards.push({ scryfallId: card.id, name: card.name, setName: card.set_name, setCode: card.set, collectorNumber: card.collector_number, imageUrl: `/images/cards/${filename}.jpg`, artUrl: `/images/cards/${filename}-art.jpg`, rarity: card.rarity, colors: card.colors || card.card_faces?.[0]?.colors || [], typeLine: card.type_line, manaCost: card.mana_cost || '', oracleText: card.oracle_text || card.card_faces?.[0]?.oracle_text || '', price, quantity, featured, condition: 'Near mint', finish: 'Non-foil', categories });
  console.log(`Downloaded ${card.name} (${card.set.toUpperCase()})`);
}
await writeFile('src/data/cards.json', JSON.stringify(cards, null, 2));
for (const code of ['fdn','blb','dsk','mh3']) {
  await new Promise(r => setTimeout(r, 150));
  const res = await fetch(`https://api.scryfall.com/sets/${code}`, { headers });
  const set = await res.json();
  await download(set.icon_svg_uri, `public/images/set-${code}.svg`);
}
await import('./fetch-fonts.mjs');
console.log('Catalogue, expansion icons, and fonts ready.');
