import { mascot } from './mascot.ts'

export function DashboardShell() {
  return <>
<div className="wrap">
  <header className="head">
    <div className="logo"><img src={mascot.image} alt="Maison" width="48" height="46" /></div>
    <div className="mascot"><img src={mascot.image} alt={mascot.alt} width="300" height="300" /></div>
    <div>
      <div className="date" id="today"></div>
      <h1 id="hello" aria-live="off">--:--</h1>
    </div>
    <div className="weather" id="weather" hidden></div>
    <button className="viewtg" id="viewtg" type="button" data-act="view-toggle" aria-label="Changer d'affichage"></button>
    <div className="hbtns"><button className="calb" type="button" data-act="hub-go" data-v="agenda" aria-label="Agenda" title="Agenda"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg></button><button className="logoutb" type="button" data-act="logout" aria-label="Déconnecter cet appareil" title="Déconnecter cet appareil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/></svg></button></div>
    <div id="banner"><div id="sync-controls"></div></div>
  </header>

  <div className="ptitle"><h2 id="pt-h"></h2><button className="mini" id="pt-act" type="button" data-act="trip-new" aria-label="Nouveau voyage" hidden>+ Nouveau</button></div>
  <main className="grid">
    <section className="card s-main"><div className="ch"><span className="ic lav"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg></span><h2>Aujourd'hui</h2></div><div className="body" id="l-main"></div></section>
    <section className="card s-proj"><div className="ch"><span className="ic peach"><svg viewBox="0 0 24 24"><path d="M14 4l6 6-3 3-6-6z"/><path d="M12.5 10.5L4 19"/></svg></span><h2><button className="h2btn" type="button" data-act="qview-open" title="Voir toutes les quêtes">Quêtes secondaires<svg className="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></h2><button className="mini" data-act="add-toggle" aria-label="Ajouter une quête" title="Ajouter">+</button></div><form id="f-add" className="addform" hidden><input className="in" id="a-title" required maxLength={80} placeholder="Une idée ?" aria-label="Nouvelle idée" /><button className="btn" type="submit">OK</button><button className="btn ghost" type="button" data-act="add-detail" title="Ajouter et compléter les détails" aria-label="Ajouter et compléter les détails"><svg className="ico-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></button></form><div className="body tg" id="l-todo"></div></section>
    <section className="card s-cal"><div className="ch"><span className="ic lav"><svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="14" rx="3"/><path d="M4 11h16M8 3v4M16 3v4"/></svg></span><h2>À venir</h2><a className="mini ico" href="https://calendar.google.com/calendar/u/0/r/week" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir Google Agenda" title="Google Agenda"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a></div><button className="tripnext" id="trip-next" type="button" data-act="hub-go" data-v="voyage" hidden></button><div className="body" id="l-cal"></div><div className="seg calr" id="cal-r" hidden></div></section>
    <section className="card s-courses"><div className="ch"><span className="ic mint"><svg viewBox="0 0 24 24"><path d="M4 5h2l2 10h10l2-7H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/></svg></span><h2><button className="h2btn" type="button" data-act="cview-open" title="Ouvrir la liste en plein écran">Liste de courses<svg className="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button> <small className="h2sub" id="c-count"></small></h2><button className="mini" data-act="course-toggle" aria-label="Ajouter un article" title="Ajouter">+</button></div><form id="f-course" className="addform" autoComplete="off" hidden><input className="in" id="c-title" required maxLength={80} enterKeyHint="done" placeholder="Ajouter…" aria-label="Ajouter à la liste de courses" /><button className="btn" type="submit">OK</button></form><div className="body" id="l-courses"></div></section>
    <section className="card s-todoall"><div className="ch"><span className="ic peach"><svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg></span><h2>À faire</h2><small className="h2sub" id="ta-count"></small><img className="ta-k" src={mascot.image} alt="" /></div><div className="body" id="l-todoall"></div></section>
    <div className="rsep" aria-hidden="true">Toutes les routines</div>
    <section className="card s-kimchi minor"><div className="ch"><span className="ic lav"><svg viewBox="0 0 24 24"><circle cx="6.5" cy="10" r="1.8" fill="currentColor"/><circle cx="10.5" cy="6.5" r="1.8" fill="currentColor"/><circle cx="15.5" cy="6.5" r="1.8" fill="currentColor"/><circle cx="19" cy="10" r="1.8" fill="currentColor"/><path d="M12.8 11.5c-3 0-5.2 2.4-4.4 4.8.5 1.5 1.8 2.2 4.4 2.2s3.9-.7 4.4-2.2c.8-2.4-1.4-4.8-4.4-4.8z" fill="currentColor"/></svg></span><h2>Kimchi</h2><button className="mini" data-act="care-add" data-group="Kimchi" aria-label="Ajouter une tâche" title="Ajouter">+</button></div><form className="addform care-add" data-group="Kimchi" hidden><input className="in" required maxLength={80} placeholder="Nouvelle tâche" aria-label="Nouvelle tâche pour Kimchi" /><button className="btn" type="submit">OK</button><button className="btn ghost" type="button" data-act="add-detail" title="Ajouter et compléter les détails" aria-label="Ajouter et compléter les détails"><svg className="ico-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></button></form><div className="body" id="l-Kimchi"></div></section>
    <section className="card s-plantes minor"><div className="ch"><span className="ic mint"><svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19L13 11"/></svg></span><h2>Plantes</h2><button className="mini" data-act="care-add" data-group="Plantes" aria-label="Ajouter une plante" title="Ajouter">+</button></div><form className="addform care-add" data-group="Plantes" hidden><input className="in" required maxLength={80} placeholder="Nom de la plante" aria-label="Nouvelle plante" /><button className="btn" type="submit">OK</button><button className="btn ghost" type="button" data-act="add-detail" title="Ajouter et compléter les détails" aria-label="Ajouter et compléter les détails"><svg className="ico-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></button></form><div className="body" id="l-Plantes"></div></section>
    <section className="card s-maison minor"><div className="ch"><span className="ic peach"><svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg></span><h2>Maison</h2><button className="mini" data-act="care-add" data-group="Maison" aria-label="Ajouter une tâche" title="Ajouter">+</button></div><form className="addform care-add" data-group="Maison" hidden><input className="in" required maxLength={80} placeholder="Nouvelle tâche" aria-label="Nouvelle tâche pour l'entretien de la maison" /><button className="btn" type="submit">OK</button><button className="btn ghost" type="button" data-act="add-detail" title="Ajouter et compléter les détails" aria-label="Ajouter et compléter les détails"><svg className="ico-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></button></form><div className="body" id="l-Maison"></div></section>
    <div id="l-custom" className="cgroups"></div>
    <section className="card s-wish"><div className="ch"><span className="ic peach"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg></span><h2>Wishlist</h2><span className="wtot" id="w-total"></span><button className="mini" data-act="wishq-toggle" aria-label="Ajouter une envie" title="Ajouter">+</button></div><form id="f-wish" className="addform" hidden><input className="in" id="w-title" required maxLength={80} placeholder="Une envie ?" aria-label="Nouvelle envie" /><button className="btn" type="submit">OK</button><button className="btn ghost" type="button" data-act="add-detail" title="Compléter les détails" aria-label="Compléter les détails"><svg className="ico-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></button></form><div className="body wchips" id="l-wish"></div></section>
    <section className="card s-voyage"><div className="ch"><span className="ic peach"><svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="12" rx="2.5"/><path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M9 12v4M15 12v4"/></svg></span><h2>Voyages</h2><button className="mini" data-act="trip-new" aria-label="Nouveau voyage" title="Nouveau voyage">+ Nouveau</button></div><div className="body" id="l-voyages"></div></section>
  </main>
  <section id="agtab" className="agtab" aria-label="Agenda"></section>
  <button className="viewbot viewbot-d" type="button" data-act="view-toggle">Passer à la vue simple</button>
  <div id="hub3" className="hub3" aria-label="Accueil"></div>
  <section id="qtab" className="qtab" aria-label="Quêtes">
    <div className="qt-head"><h2>Quêtes</h2><button className="mini" type="button" data-act="qadd3-toggle" aria-label="Nouvelle quête">+ Nouvelle</button></div>
    <form id="f-qadd3" className="addform" hidden><input className="in" id="q-title3" required maxLength={80} placeholder="Une idée ?" aria-label="Nouvelle quête" /><button className="btn" type="submit">Ajouter</button></form>
    <div id="qt-list" className="qt-list"></div>
  </section>
</div>
<nav className="tabbar" aria-label="Sections">
  <button type="button" data-act="tab" data-tab="home" aria-label="Accueil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg><span>Accueil</span></button>
  <button type="button" data-act="tab" data-tab="quetes" aria-label="Quêtes"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg><span>Quêtes</span></button>
  <button type="button" data-act="tab" data-tab="courses" aria-label="Courses et wishlist"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h2l2 10h10l2-7H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/></svg><span>Courses</span></button>
  <button type="button" data-act="tab" data-tab="maison" aria-label="Routines"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.6L4 8M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.5 4.6L20 16m0 4.5V16h-4.5"/><path d="M9 12l2 2 4-4"/></svg><span>Routines</span></button>
  <button type="button" data-act="tab" data-tab="voyage" aria-label="Voyages"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="2.5"/><path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M9 12v4M15 12v4"/></svg><span>Voyages</span></button>
</nav>
<section id="cview" className="qview cview" hidden aria-label="Liste de courses">
  <div className="qv-in">
    <header className="qv-head">
      <button className="qv-back" type="button" data-act="cview-close" aria-label="Retour au dashboard">‹</button>
      <div className="qv-tt"><h2>Courses</h2><small id="cv-count"></small></div>
      <span id="cv-net" className="cv-net" hidden></span>
    </header>
    <form id="f-course2" className="addform cv-add" autoComplete="off"><input className="in" id="c-title2" required maxLength={80} enterKeyHint="done" placeholder="Ajouter…" aria-label="Ajouter à la liste de courses" /><button className="btn" type="submit">OK</button></form>
    <div id="cv-list" className="cv-list"></div>
  </div>
</section>
<section id="vview" className="qview vview" hidden aria-label="Voyage">
  <div className="qv-in">
    <header className="qv-head">
      <button className="qv-back" type="button" data-act="vview-close" aria-label="Retour aux voyages">‹</button>
      <div className="qv-tt"><h2 id="vv-title"></h2><small id="vv-sub"></small></div>
      <button className="mini vv-bil" id="vv-bil" type="button" data-act="bil-open" aria-haspopup="dialog">🎟️ Billets</button>
    </header>
    <div id="vv-body" className="vv-body"></div>
  </div>
</section>
<div id="sheet" className="sheet" hidden></div>
<div id="toast" className="toast" role="status" aria-live="polite" hidden></div>
  </>
}
