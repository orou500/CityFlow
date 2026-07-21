const audioModules = import.meta.glob('/src/audio/**/*.{mp3,wav,ogg,flac,m4a}', { eager: true });

function nameToId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function filenameToTrack(filePath, url, index) {
  const name = filePath
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, '');
  const parts = name.split(' - ');
  let artist = 'Unknown';
  let title = name;
  if (parts.length >= 2) {
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }
  return {
    id: `track-${index}`,
    title,
    artist,
    src: url,
    duration: 0,
  };
}

const dirMap = {};
let globalIndex = 0;

for (const [filePath, mod] of Object.entries(audioModules)) {
  const url = mod.default || mod;
  const relativePath = filePath.replace('/src/audio/', '');
  const parts = relativePath.split('/');
  const dir = parts.length > 1 ? parts[0] : '__root__';

  if (!dirMap[dir]) dirMap[dir] = [];
  dirMap[dir].push(filenameToTrack(filePath, url, globalIndex));
  globalIndex++;
}

const playlists = [];

if (dirMap['__root__']) {
  playlists.push({
    id: 'cityflow-playlist',
    name: 'CityFlow Playlist',
    description: 'CityFlow Radio',
    icon: '\uD83C\uDFB5',
    tracks: dirMap['__root__'],
  });
  delete dirMap['__root__'];
}

for (const [dir, tracks] of Object.entries(dirMap)) {
  playlists.push({
    id: nameToId(dir),
    name: dir,
    description: `${tracks.length} tracks`,
    icon: '\uD83C\uDFB5',
    tracks,
  });
}

if (playlists.length === 0) {
  playlists.push({
    id: 'empty',
    name: 'My Playlist',
    description: 'Add audio files to src/audio/',
    icon: '\uD83C\uDFB5',
    tracks: [],
  });
}

export default playlists;
