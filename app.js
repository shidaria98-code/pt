const SUBJECTS = [
  ["portugues", "Português"],
  ["matematica", "Matemática"],
  ["ciencias", "Ciências Naturais"],
  ["hgp", "História e Geografia de Portugal"],
  ["ingles", "Inglês"],
  ["visual", "Educação Visual"],
  ["tecnologica", "Educação Tecnológica"],
  ["musical", "Educação Musical"],
  ["fisica", "Educação Física"],
  ["cidadania", "Cidadania e Desenvolvimento"],
  ["tic", "TIC"],
  ["emr", "Educação Moral e Religiosa (opcional)"]
];
const LESSONS = [{
  year: "5",
  subject: "matematica",
  slug: "fracoes-introducao",
  title: "Frações: partes de um todo"
}, ...HGP_LESSONS];
const YEARS = ["5", "6"];
const MODE_LABELS = { pt: "Português", ru: "Português + russo" };
const $ = selector => document.querySelector(selector);
const safe = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
);

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current session still works when browser storage is unavailable.
  }
}

let year = String(load("pt-year", "5"));
if (!YEARS.includes(year)) year = "5";
let mode = load("pt-mode", null);
if (mode !== "pt" && mode !== "ru") mode = null;
let renderId = 0;

const page = $("#page");
const dialog = $("#mode-dialog");
const modeButton = $("#change-mode");
const yearLabel = value => `${value}.º ano`;
const catalogLink = value => `#disciplinas/${value}`;
const lessonLink = entry => `#aula/${entry.year}/${entry.subject}/${entry.slug}`;
const heading = title => `<h1 id="page-heading" tabindex="-1">${safe(title)}</h1>`;
const russian = (value, tag = "p") => value
  ? `<${tag} lang="ru" data-russian>${safe(value)}</${tag}>`
  : "";

function applyMode() {
  page.dataset.mode = mode || "pt";
  modeButton.textContent = mode ? `Apoio linguístico · ${MODE_LABELS[mode]}` : "Apoio linguístico";
  dialog.querySelectorAll("[data-mode]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
}

function openMode() {
  $("#close-mode").hidden = !mode;
  dialog.showModal();
  (dialog.querySelector('[aria-pressed="true"]') || dialog.querySelector("[data-mode]")).focus();
}

modeButton.addEventListener("click", openMode);
$("#close-mode").addEventListener("click", () => dialog.close());
dialog.addEventListener("cancel", event => {
  if (!mode) event.preventDefault();
});
dialog.addEventListener("click", event => {
  const choice = event.target.closest("[data-mode]");
  if (!choice) return;
  const firstChoice = !mode;
  mode = choice.dataset.mode;
  save("pt-mode", mode);
  applyMode();
  dialog.close();
  if (firstChoice && (!location.hash || location.hash === "#inicio")) {
    location.hash = "#anos";
  } else if (firstChoice) {
    $("#page-heading").focus();
  }
});

$(".skip").addEventListener("click", event => {
  event.preventDefault();
  $("#page-heading")?.focus();
});

const hgpLink = "#hgp/5/02";

function renderCatalog() {
  return `<a href="#anos">← Escolher outro ano</a>
    ${heading(`Disciplinas · ${yearLabel(year)}`)}
    <p class="muted">O catálogo está a ser preparado.</p>
    <div class="grid">${SUBJECTS.map(([id, name]) => {
      const lessons = LESSONS.filter(entry => entry.year === year && entry.subject === id);
      return `<article class="subject">
        <h2>${safe(name)}</h2>
        ${year === "5" && id === "hgp"
          ? `<a class="action" href="${hgpLink}">${safe(HGP_TOPIC)}</a>`
          : lessons.length ? lessons.map(entry =>
          `<a class="action" href="${lessonLink(entry)}">${safe(entry.title)}</a>`
        ).join("") : '<p class="muted">Em preparação</p>'}
      </article>`;
    }).join("")}</div>`;
}

function renderWords() {
  const words = load("pt-words", []);
  return `${heading("O meu dicionário")}
    <p class="muted">Guarda palavras das aulas neste dispositivo.</p>
    ${words.some(word => word.explanation_pt) ? `<a class="action" href="#dicionario/treinar">Treinar vocabulário</a>` : ""}
    ${words.length ? `<ul class="word-grid">${words.map(word =>
      `<li class="word"><strong>${safe(word.pt)}</strong>
        ${word.explanation_pt ? `<p>${safe(word.explanation_pt)}</p>` : ""}
        ${russian(word.ru, "span")}${russian(word.explanation_ru)}</li>`
    ).join("")}</ul>` : '<p class="muted">Ainda não guardaste palavras.</p>'}`;
}

function saveWords(vocabulary, announce = true) {
  const existing = load("pt-words", []);
  const words = new Map(existing.map(word => [word.id, word]));
  vocabulary.forEach(word => words.set(word.id, { ...words.get(word.id), ...word }));
  save("pt-words", [...words.values()]);
  if (announce) $("#word-status").textContent = "Palavras guardadas.";
}

function renderLesson(lesson, area) {
  const previous = load("pt-progress", {})[lesson.id];
  area.innerHTML = `<p>${safe(lesson.intro)}</p>
    ${russian(lesson.intro_ru)}
    <h2>O meu vocabulário</h2>
    <dl>${lesson.vocabulary.map(word =>
      `<div class="term"><dt><strong>${safe(word.pt)}</strong> ${russian(word.ru, "span")}</dt>
        <dd>${word.explanation_pt ? `<p>${safe(word.explanation_pt)}</p>` : ""}${russian(word.explanation_ru)}</dd></div>`
    ).join("")}</dl>
    <button class="primary" id="add-words" type="button">Guardar palavras no dicionário</button>
    <p id="word-status" role="status"></p>
    <h2>Praticar</h2>
    ${previous ? `<p class="muted" id="previous-result">Último resultado: ${safe(previous.correct)}/${safe(previous.total)}</p>` : ""}
    <form id="quiz">
      ${lesson.questions.map((question, index) =>
        `<fieldset class="question">
          <legend><strong>${index + 1}. ${safe(question.prompt)}</strong> ${russian(question.prompt_ru, "span")}</legend>
          ${question.options.map((option, choice) =>
            `<label><input type="radio" name="q${index}" value="${choice}">
              <span>${safe(option)} ${russian(question.options_ru?.[choice], "span")}</span></label>`
          ).join("")}
          <div id="feedback-${index}" class="feedback"></div>
        </fieldset>`
      ).join("")}
      <button class="primary" type="submit">Verificar respostas</button>
      <p id="result" role="status"></p>
    </form>`;

  $("#add-words").addEventListener("click", () => saveWords(lesson.vocabulary));

  $("#quiz").addEventListener("submit", event => {
    event.preventDefault();
    const answers = new FormData(event.currentTarget);
    let correct = 0;
    lesson.questions.forEach((question, index) => {
      const answer = answers.get(`q${index}`);
      const ok = answer !== null && Number(answer) === question.answer;
      if (ok) correct++;
      $(`#feedback-${index}`).innerHTML =
        `<p>${ok ? "Correto." : answer === null ? "Sem resposta." : "Resposta incorreta."} ${safe(question.explanation)}</p>${russian(question.explanation_ru)}`;
    });
    $("#previous-result")?.remove();
    $("#result").textContent = `Resultado: ${correct}/${lesson.questions.length}`;
    const progress = load("pt-progress", {});
    progress[lesson.id] = { correct, total: lesson.questions.length, updatedAt: new Date().toISOString() };
    save("pt-progress", progress);
  });
}

async function openLesson(entry, currentRender) {
  const area = $("#lesson");
  try {
    const path = `./content/lessons/${entry.year}/${entry.subject}`;
    const getJson = async name => {
      const response = await fetch(`${path}/${name}.json`);
      if (!response.ok) throw new Error("Ficheiro indisponível");
      return response.json();
    };
    const isHgp = entry.subject === "hgp";
    const [lesson, dictionary] = await Promise.all([
      getJson(entry.slug),
      isHgp ? getJson("dictionary") : null
    ]);
    if (currentRender !== renderId) return;
    if (isHgp) renderHgpLesson(lesson, dictionary, area);
    else renderLesson(lesson, area);
  } catch {
    if (currentRender !== renderId) return;
    area.innerHTML = '<p role="alert">Não foi possível carregar a aula.</p><button type="button">Tentar novamente</button>';
    area.querySelector("button").addEventListener("click", renderRoute);
  }
}

function renderRoute(focus = true) {
  const currentRender = ++renderId;
  const hash = location.hash.slice(1) || "inicio";
  const [route, selectedYear, subject, slug, ...extra] = hash.split("/");
  const entry = route === "aula" && !extra.length && LESSONS.find(lesson =>
    lesson.year === selectedYear && lesson.subject === subject && lesson.slug === slug
  );
  let active = route;
  if (hash === "inicio") {
    page.innerHTML = `<section class="hero">
      ${heading("Estuda, compreende, pratica.")}
      <p>Materiais de apoio escolar para o 2.º ciclo. Escolhe o teu ano e a forma como preferes aprender.</p>
      <a class="action" href="#anos">Escolher ano</a>
      <a class="action" href="${hgpLink}">História e Geografia · 5.º ano</a>
    </section>`;
  } else if (hash === "anos") {
    page.innerHTML = `${heading("Escolhe o teu ano")}
      <div class="grid">${YEARS.map(value =>
        `<a class="year-card" href="${catalogLink(value)}">${yearLabel(value)}</a>`
      ).join("")}</div>`;
  } else if (hash === "disciplinas" || YEARS.some(value => hash === `disciplinas/${value}`)) {
    if (selectedYear) {
      year = selectedYear;
      save("pt-year", year);
    }
    page.innerHTML = renderCatalog();
  } else if (`#${hash}` === hgpLink) {
    active = "disciplinas";
    year = "5";
    save("pt-year", year);
    page.innerHTML = renderHgpTopic();
  } else if (entry) {
    active = "disciplinas";
    year = entry.year;
    save("pt-year", year);
    const subjectName = SUBJECTS.find(([id]) => id === entry.subject)[1];
    page.innerHTML = `<a href="${entry.subject === "hgp" ? hgpLink : catalogLink(year)}">
      ${entry.subject === "hgp" ? "← Voltar ao tema" : `← Disciplinas · ${yearLabel(year)}`}</a>
      <article class="panel">
        <p class="tag">${safe(subjectName)} · ${yearLabel(year)} · demonstração</p>
        ${heading(entry.title)}
        <div id="lesson"><p role="status">A carregar…</p></div>
      </article>`;
    openLesson(entry, currentRender);
  } else if (hash === "dicionario") {
    page.innerHTML = renderWords();
  } else if (hash === "dicionario/treinar") {
    active = "dicionario";
    renderVocabularyTrainer();
  } else if (hash === "sobre") {
    page.innerHTML = `<section class="panel">${heading("Sobre o projeto")}
      <p>Plataforma educativa independente em desenvolvimento. Os materiais são originais e sujeitos a revisão pedagógica. As Aprendizagens Essenciais são a referência curricular; a sequência dos temas será organizada com apoio de outras fontes educativas, sem reprodução dos seus conteúdos.</p>
      <p>Esta versão é uma demonstração funcional, não um curso completo.</p></section>`;
  } else {
    active = "";
    page.innerHTML = `${heading("Página indisponível")}<a href="#anos">Escolher ano</a>`;
  }

  document.querySelectorAll("[data-nav]").forEach(link => {
    if (link.dataset.nav === active) {
      link.setAttribute("aria-current", entry ? "location" : "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  const title = $("#page-heading");
  document.title = `${title.textContent} · A Minha Escola`;
  if (focus && !dialog.open) {
    title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

window.addEventListener("hashchange", () => renderRoute());
renderRoute(false);
applyMode();
if (!mode) openMode();
