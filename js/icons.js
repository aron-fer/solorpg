// Icons from Lucide (https://lucide.dev), v1.76.0 – ISC license, see
// LICENSE-lucide.txt. Only the icons the app uses are copied in here.
//
// Adding an icon: find it on lucide.dev/icons, "Copy SVG", and add a line
// below with its name and only the part between <svg …> and </svg>
// (the <path …/>, <circle …/> … elements), in single quotes. Use it with
// icon('name').
const ICONS = {
  'notebook-pen': '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" /><path d="M2 6h4" /><path d="M2 10h4" /><path d="M2 14h4" /><path d="M2 18h4" /><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />',
  'dices': '<rect width="12" height="12" x="2" y="10" rx="2" ry="2" /><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" /><path d="M6 18h.01" /><path d="M10 14h.01" /><path d="M15 6h.01" /><path d="M18 9h.01" />',
  'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />',
  'map': '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><path d="M15 5.764v15" /><path d="M9 3.236v15" />',
  'graph-star': '<path d="m12.342 9.316 1.764-3.527" /><path d="m12.59 14.545 2.35 3.759" /><path d="m13.982 12.332 4.03.447" /><path d="M5.414 17.586 8.88 14.12" /><path d="M9.025 9.742 5.317 5.505" /><circle cx="11" cy="12" r="3" /><circle cx="15" cy="4" r="2" /><circle cx="16" cy="20" r="2" /><circle cx="20" cy="13" r="2" /><circle cx="4" cy="19" r="2" /><circle cx="4" cy="4" r="2" />',
  'swords': '<path d="m13 19 6-6" /><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5" /><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /><path d="m5 14 4 4" /><path d="m5 21-2-2" /><path d="M7.5 16.5 4 20" />',
  'library': '<path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" />',
  'trash-2': '<path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
  'cloud': '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />',
  'plus': '<path d="M5 12h14" /><path d="M12 5v14" />',
  'download': '<path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" />',
};
// Icon for each tab of the navigation (Karteien share one).
const TAB_ICONS = {notes:"notebook-pen", dice:"dices", character:"user", map:"map", relations:"graph-star", battle:"swords", karteien:"library"};
function icon(name, size, cls){
  const body = ICONS[name];
  if(!body) return "";
  size = size || 20;
  return `<svg class="icon ${cls||""}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
