/* ===================== APP THAÏ MALIN — PARTAGÉ ENTRE TOUTES LES DESTINATIONS =====================
   Ce fichier est commun à toutes les pages (Bangkok, Phuket, Krabi, Koh Samui, et les suivantes).
   Chaque page doit définir un objet window.THAIMALIN_CONFIG AVANT d'inclure ce script, avec :

   window.THAIMALIN_CONFIG = {
     citySlug: 'bangkok',          // sert à construire <citySlug>-districts.json / <citySlug>-restaurants.json
     cityLabel: 'Bangkok',         // utilisé dans les messages d'erreur
     mapCenter: [13.7563, 100.5018],
     mapZoom: 12,
     locationField: 'station',     // 'station' (villes avec métro) ou 'zone' (îles sans métro)
     locationIcon: '🚆'            // icône affichée à côté du champ ci-dessus ('🚆' ou '📍')
   };

   Voir bangkok-premium.html pour un exemple d'intégration complet.
====================================================================================================== */

const CONFIG = window.THAIMALIN_CONFIG || {};

/* ===================== INDICATEUR DE CHARGEMENT ===================== */

const loaderEl = document.createElement('div');
loaderEl.id = 'thaimalin-loader';
loaderEl.innerHTML = '<div class="thaimalin-spinner"></div><p>Chargement du guide…</p>';
document.body.appendChild(loaderEl);

function hideLoader(){
  const loader = document.getElementById('thaimalin-loader');
  if(!loader) return;
  loader.classList.add('hidden');
  setTimeout(()=> loader.remove(), 400);
}
const CITY = CONFIG.citySlug || 'ville';
const CITY_LABEL = CONFIG.cityLabel || CITY;
const LOC_FIELD = CONFIG.locationField || 'zone';
const LOC_ICON = CONFIG.locationIcon || '📍';
const MAP_CENTER = CONFIG.mapCenter || [13.7563, 100.5018];
const MAP_ZOOM = CONFIG.mapZoom || 12;
const FAV_KEY = `thaimalin_favorites_${CITY}`;

/* ===================== DONNÉES ===================== */

let districts = [];
let restaurants = [];
let extras = { sites: [], transport: [], hotels: [], budget: [] };

/* ===================== SÉLECTEUR DE DEVISE ===================== */

let CURRENCY_EUR = false;
const THB_PER_EUR = 38.4; // taux indicatif juillet 2026, à mettre à jour périodiquement

function convertText(str){
  if(!CURRENCY_EUR || !str) return str;
  return str.replace(/(\d[\d\s]*)(\s*[–-]\s*(\d[\d\s]*))?\s*THB/g, (match, n1, sep, n2) => {
    const num1 = parseInt(n1.replace(/\s/g,''), 10);
    if(isNaN(num1)) return match;
    const eur1 = Math.round(num1 / THB_PER_EUR);
    if(n2){
      const num2 = parseInt(n2.replace(/\s/g,''), 10);
      const eur2 = Math.round(num2 / THB_PER_EUR);
      return `${match} (≈ ${eur1}–${eur2} €)`;
    }
    return `${match} (≈ ${eur1} €)`;
  });
}

function toggleCurrency(){
  CURRENCY_EUR = !CURRENCY_EUR;
  renderSites();
  renderTransport();
  renderHotels();
  renderBudget();
  syncCurrencyButton();
}

function syncCurrencyButton(){
  const btn = document.getElementById('currencyToggle');
  if(btn){ btn.textContent = CURRENCY_EUR ? '🇹🇭 Revenir aux THB' : '🇪🇺 Afficher en €'; }
}

async function loadData(){
  const districtsFile = `${CITY}-districts.json`;
  const restaurantsFile = `${CITY}-restaurants.json`;
  const extrasFile = `extras-${CITY}.json`;
  try {
    const [dRes, rRes, eRes] = await Promise.all([
      fetch(districtsFile),
      fetch(restaurantsFile),
      fetch(extrasFile)
    ]);
    if(!dRes.ok || !rRes.ok || !eRes.ok) throw new Error('Fichier JSON introuvable');
    districts = await dRes.json();
    restaurants = await rRes.json();
    extras = await eRes.json();
  } catch(e){
    console.error(`Erreur de chargement des données ${CITY_LABEL} :`, e);
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="background:#c0392b;color:#fff;padding:14px;text-align:center">'
      + `Impossible de charger les données (${districtsFile} / ${restaurantsFile} / ${extrasFile}). `
      + 'Vérifiez qu\'elles sont bien à côté de ce fichier HTML et que la page est servie en http(s), pas ouverte en local.</div>');
  }
  renderSites();
  renderTransport();
  renderHotels();
  renderBudget();
  renderDistricts();
  renderRestaurants('all');
  renderItinerary();
  initMap();
  injectStructuredData();
  hideLoader();
}

const catLabel = {street:"Street Food",gastro:"Gastronomique",rooftop:"Rooftop",cafe:"Café"};
const catColor = {street:"#e8983b",gastro:"#c0392b",rooftop:"#9b59b6",cafe:"#3d8bd4"};

/* ===================== NAV MOBILE ===================== */

const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', ()=>{
  const isOpen = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
});
navLinks.querySelectorAll('a').forEach(link=>{
  link.addEventListener('click', ()=>{
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded','false');
  });
});

/* ===================== QUARTIERS ===================== */

const districtGrid = document.getElementById('districtGrid');
const districtSearch = document.getElementById('districtSearch');
const districtFilter = document.getElementById('districtFilter');

function renderDistricts(){
  const q = districtSearch.value.toLowerCase();
  const cat = districtFilter.value;
  districtGrid.innerHTML = districts
    .filter(d => d.name.toLowerCase().includes(q) && (cat==='all' || d.cat===cat))
    .map(d => `
      <article class="tile">
        <img src="${d.img}" alt="${d.emoji} ${d.name}" loading="lazy">
        <div class="body">
          <h3>${d.emoji} ${d.name}</h3>
          <p>${d.desc}</p>
          <p><strong>Attractions :</strong> ${d.attractions}</p>
          <p><strong>Restaurant conseillé :</strong> ${d.restaurant}</p>
          <p><strong>Hôtel conseillé :</strong> ${d.hotel}</p>
          <p class="tip">${d.tip}</p>
        </div>
      </article>
    `).join('');
}
districtSearch.addEventListener('input', renderDistricts);
districtFilter.addEventListener('change', renderDistricts);

/* ===================== INCONTOURNABLES / TRANSPORT / HÔTELS / BUDGET ===================== */

function fieldLine(label, value){
  return value ? `<p><strong>${label} :</strong> ${convertText(value)}</p>` : '';
}

function renderSites(){
  const grid = document.getElementById('sitesGrid');
  if(!grid) return;
  grid.innerHTML = extras.sites.map(s => `
    <div class="card">
      <h3>${s.name}</h3>
      <p>${s.desc}</p>
      ${fieldLine('🎟️', s.price)}
      ${fieldLine('🕒', s.hours)}
      ${s.tip ? `<p class="tip">${s.tip}</p>` : ''}
    </div>
  `).join('');
}

function renderTransport(){
  const grid = document.getElementById('transportGrid');
  if(!grid) return;
  grid.innerHTML = extras.transport.map(t => `
    <div class="card">
      <h3>${t.icon} ${t.title}</h3>
      <p>${t.desc}</p>
      ${fieldLine('💰 Prix', t.price)}
      ${fieldLine('🕒 Horaires', t.hours)}
      ${t.tip ? `<p class="tip">${t.tip}</p>` : ''}
      ${t.buttonUrl ? `<p><a class="btn" style="padding:10px 20px;font-size:14px" href="${t.buttonUrl}" target="_blank" rel="noopener">${t.buttonText}</a></p>` : ''}
    </div>
  `).join('');
}

function renderHotels(){
  const grid = document.getElementById('hotelsGrid');
  if(!grid) return;
  grid.innerHTML = extras.hotels.map(h => `
    <div class="card">
      <h3>${h.tier}</h3>
      <p>${h.desc}</p>
      <p><strong>💰 ${convertText(h.price)}</strong></p>
      <p><a class="btn" style="padding:10px 20px;font-size:14px" href="${h.bookingUrl}" target="_blank" rel="noopener">Voir sur Booking.com</a></p>
    </div>
  `).join('');
}

function renderBudget(){
  const grid = document.getElementById('budgetGrid');
  if(!grid) return;
  grid.innerHTML = extras.budget.map(b => `
    <div class="card">
      <h3>${b.icon} ${b.tier} — ${convertText(b.price)}</h3>
      <p>${b.desc}</p>
    </div>
  `).join('');
}

/* ===================== DONNÉES STRUCTURÉES SCHEMA.ORG ===================== */

function injectStructuredData(){
  const graph = [];

  restaurants.forEach(r=>{
    graph.push({
      "@type": "Restaurant",
      "name": r.name,
      "description": r.desc,
      "servesCuisine": r.spec,
      "priceRange": r.price,
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": r.lat,
        "longitude": r.lng
      },
      "address": {
        "@type": "PostalAddress",
        "addressLocality": r[LOC_FIELD],
        "addressCountry": "TH"
      }
    });
  });

  extras.sites.forEach(s=>{
    graph.push({
      "@type": "TouristAttraction",
      "name": s.name,
      "description": s.desc
    });
  });

  const data = {
    "@context": "https://schema.org",
    "@graph": graph
  };

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

/* ===================== FICHES RESTAURANTS ===================== */

const restGrid = document.getElementById('restGrid');
const restToolbar = document.getElementById('restToolbar');

let favorites;
try {
  favorites = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'));
} catch(e) {
  favorites = new Set(); // localStorage indisponible (aperçu isolé, navigation privée...) : favoris en mémoire uniquement
}

function saveFavorites(){
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favorites])); }
  catch(e) { /* stockage indisponible, on continue en mémoire */ }
}

function renderRestaurants(cat){
  const list = restaurants.filter(r => cat==='all' || r.cat===cat);
  restGrid.innerHTML = list.map(r => `
    <article class="tile" data-name="${r.name}">
      <img src="${r.img}" alt="${r.name}" loading="lazy">
      <div class="body">
        <span class="badge b-${r.cat}">${catLabel[r.cat]}</span>
        <h3>${r.name}</h3>
        <p>${r.desc}</p>
        <p><strong>Prix :</strong> ${r.price} · <strong>Horaires :</strong> ${r.hours}</p>
        <p><strong>⭐ Note Thaï Malin :</strong> ${r.note} · <strong>${LOC_ICON}</strong> ${r[LOC_FIELD]}</p>
        <p class="tip">${r.tip}</p>
        <button class="fav-btn" onclick="toggleFav(this,'${r.name.replace(/'/g,"\\'")}')">☆ Ajouter aux favoris</button>
      </div>
    </article>
  `).join('');
  syncFavButtons();
}

function toggleFav(btn, name){
  if(favorites.has(name)){ favorites.delete(name); }
  else{ favorites.add(name); }
  saveFavorites();
  syncFavButtons();
  renderItinerary();
}

function syncFavButtons(){
  document.querySelectorAll('.fav-btn').forEach(btn=>{
    const name = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
    if(favorites.has(name)){ btn.classList.add('on'); btn.innerHTML='★ Ajouté aux favoris'; }
    else{ btn.classList.remove('on'); btn.innerHTML='☆ Ajouter aux favoris'; }
  });
}

restToolbar.addEventListener('click', e=>{
  if(e.target.tagName!=='BUTTON') return;
  restToolbar.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  renderRestaurants(e.target.dataset.cat);
});

/* ===================== CARTE INTERACTIVE ===================== */

let map, clusterGroup, routeControl, userMarker;

function initMap(){
  if(typeof L === 'undefined') return;

  map = L.map('leafletMap').setView(MAP_CENTER, MAP_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 60
  });

  renderMapMarkers('all');
  map.addLayer(clusterGroup);

  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const {latitude, longitude} = pos.coords;
      userMarker = L.circleMarker([latitude, longitude], {color:'#fff', fillColor:'#1e88e5', fillOpacity:1})
        .addTo(map).bindPopup('Votre position');
    });
  }
}

function popupHTML(r){
  return `
    <strong>${r.name}</strong><br>
    ${catLabel[r.cat]} · ${r.price}<br>
    ⭐ ${r.note} · ${LOC_ICON} ${r[LOC_FIELD]}<br>
    🍽️ ${r.spec}<br><br>
    <button onclick="startRouteTo(${r.lat},${r.lng})">🧭 Itinéraire</button>
  `;
}

function renderMapMarkers(cat){
  if(!clusterGroup) return;
  clusterGroup.clearLayers();
  const list = cat === 'favorites'
    ? restaurants.filter(r => favorites.has(r.name))
    : restaurants.filter(r => cat==='all' || r.cat===cat);
  list.forEach(r=>{
      const icon = L.divIcon({
        className:'',
        html:`<div style="background:${catColor[r.cat]};width:16px;height:16px;border-radius:50%;border:2px solid white;"></div>`,
        iconSize:[16,16]
      });
      const marker = L.marker([r.lat, r.lng], {icon});
      marker.bindPopup(popupHTML(r));
      clusterGroup.addLayer(marker);
    });
}

function startRouteTo(lat,lng){
  if(!navigator.geolocation){ alert("La géolocalisation n'est pas disponible."); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    if(routeControl){ map.removeControl(routeControl); }
    routeControl = L.Routing.control({
      waypoints: [
        L.latLng(pos.coords.latitude, pos.coords.longitude),
        L.latLng(lat, lng)
      ],
      routeWhileDragging:false,
      show:true,
      addWaypoints:false,
      draggableWaypoints:false,
      fitSelectedRoutes:true
    }).addTo(map);
  }, err=>{
    alert("Impossible d'obtenir votre position : "+err.message);
  });
}

/* ===================== MON ITINÉRAIRE ===================== */

function buildItinerarySection(){
  const section = document.createElement('section');
  section.id = 'mon-itineraire';
  section.innerHTML = `
    <h2>★ Mon itinéraire</h2>
    <p>Retrouve ici tous les restaurants ajoutés en favori depuis la section Restaurants — prêts à consulter ou imprimer avant de partir.</p>
    <div id="itineraireList" class="rest-grid"></div>
    <p id="itineraireEmpty" class="tip" style="display:none">Aucun favori pour l'instant — clique sur ☆ sur une fiche restaurant pour l'ajouter ici.</p>
    <p><button id="itinerairePrintBtn" class="btn" style="border:none;cursor:pointer">🖨️ Imprimer mon itinéraire</button></p>
  `;
  const footer = document.querySelector('footer');
  if(footer && footer.parentNode){ footer.parentNode.insertBefore(section, footer); }

  const printBtn = document.getElementById('itinerairePrintBtn');
  if(printBtn){ printBtn.addEventListener('click', ()=> window.print()); }

  if(navLinks){
    const link = document.createElement('a');
    link.href = '#mon-itineraire';
    link.textContent = '★ Mon itinéraire';
    link.addEventListener('click', ()=>{
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded','false');
    });
    navLinks.appendChild(link);

    const currencyBtn = document.createElement('a');
    currencyBtn.href = '#';
    currencyBtn.id = 'currencyToggle';
    currencyBtn.textContent = '🇪🇺 Afficher en €';
    currencyBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      toggleCurrency();
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded','false');
    });
    navLinks.appendChild(currencyBtn);
  }

  const mapToolbar = document.querySelector('#carte .toolbar');
  if(mapToolbar){
    const favBtn = document.createElement('button');
    favBtn.dataset.mapcat = 'favorites';
    favBtn.textContent = '★ Mes favoris';
    mapToolbar.appendChild(favBtn);
  }
}

function renderItinerary(){
  const list = document.getElementById('itineraireList');
  const empty = document.getElementById('itineraireEmpty');
  if(!list) return;
  const favRestaurants = restaurants.filter(r => favorites.has(r.name));
  if(favRestaurants.length === 0){
    list.innerHTML = '';
    if(empty) empty.style.display = 'block';
    return;
  }
  if(empty) empty.style.display = 'none';
  list.innerHTML = favRestaurants.map(r => `
    <article class="tile">
      <img src="${r.img}" alt="${r.name}" loading="lazy">
      <div class="body">
        <span class="badge b-${r.cat}">${catLabel[r.cat]}</span>
        <h3>${r.name}</h3>
        <p>${r.desc}</p>
        <p><strong>Prix :</strong> ${r.price} · <strong>Horaires :</strong> ${r.hours}</p>
        <p><strong>${LOC_ICON}</strong> ${r[LOC_FIELD]}</p>
        <p class="tip">${r.tip}</p>
      </div>
    </article>
  `).join('');
}

buildItinerarySection();

document.querySelectorAll('#carte .toolbar button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#carte .toolbar button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderMapMarkers(btn.dataset.mapcat);
  });
});

document.addEventListener('DOMContentLoaded', loadData);
window.addEventListener('resize', ()=>{ if(map){ map.invalidateSize(); } });

/* ===================== MODE HORS LIGNE (SERVICE WORKER) ===================== */

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js')
      .catch(err => console.warn('Service worker non enregistré :', err));
  });
}
